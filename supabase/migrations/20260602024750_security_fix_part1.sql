-- ==============================================================================
-- Tomato Tab - 安全修复 PART 1（步骤 1-8）
-- 配套文档：ADMIN_DATA_SECURITY_FIX_PLAN.md / security_fix_migration.sql
-- 说明：向后兼容，旧前端不受影响。所有语句幂等（IF NOT EXISTS / CREATE OR REPLACE /
--       DROP ... IF EXISTS），即使对象已由 supabase_deploy.sql 手动创建也可安全重放。
-- ⚠️ PART 2（user_profiles RLS 收紧）不在此文件中，需在前端部署上线后单独执行。
-- ==============================================================================

-- 1. user_stats 新增列（零锁表，元数据级操作）— 问题 #4
-- ==============================================================================
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS hourly_distribution
  JSONB DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0;


-- 2. search_logs 外键改 CASCADE（删除用户时清理搜索记录）— 问题 #9(b)
-- 取舍（已确认）：删号将连带删除该用户搜索关键词，热门搜索会丢失这部分历史；
--   选择 CASCADE 以满足「删号=删数据」的隐私合规预期。
-- ==============================================================================
ALTER TABLE search_logs
  DROP CONSTRAINT IF EXISTS search_logs_user_id_fkey;
ALTER TABLE search_logs
  ADD CONSTRAINT search_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- 3. search_logs 用户可删除/读取自己的记录 — 问题 #9(a)
-- ==============================================================================
DROP POLICY IF EXISTS "Users can delete own search logs" ON search_logs;
CREATE POLICY "Users can delete own search logs" ON search_logs
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own search logs" ON search_logs;
CREATE POLICY "Users can read own search logs" ON search_logs
  FOR SELECT USING (auth.uid() = user_id);


-- 4. 批量删除搜索记录的 RPC（前端 PrivacySettings「清除搜索历史」调用）— 问题 #9
-- ==============================================================================
CREATE OR REPLACE FUNCTION delete_my_search_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM search_logs WHERE user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- 5. 公开资料查询 RPC（公告回复显示用户名）— 问题 #1 前置
-- 仅返回 id 与 display_name，不暴露 email/role
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_public_profiles(p_user_ids UUID[])
RETURNS TABLE (id UUID, display_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT up.id, up.display_name
  FROM user_profiles up
  WHERE up.id = ANY(p_user_ids);
END;
$$;
-- 可选：仅允许登录用户调用（屏蔽匿名）
-- REVOKE EXECUTE ON FUNCTION get_public_profiles(UUID[]) FROM anon;


-- 6. analytics_daily INSERT 收紧（阻断浏览器客户端直接插入）— 问题 #2
-- aggregate_daily_stats() 为 SECURITY DEFINER，绕过 RLS，正常写入不受影响
-- ==============================================================================
DROP POLICY IF EXISTS "System can insert analytics" ON analytics_daily;
CREATE POLICY "System can insert analytics" ON analytics_daily
  FOR INSERT WITH CHECK (auth.role() = 'service_role');


-- 7. SECURITY DEFINER 读取函数加管理员守卫 — 问题 #3
--    （aggregate_daily_stats 不加守卫，保留给 cron/Edge Function 调用）
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_popular_searches(
  p_limit INTEGER DEFAULT 10,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (keyword TEXT, count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  RETURN QUERY
  SELECT sl.keyword, COUNT(*) as count
  FROM search_logs sl
  WHERE sl.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY sl.keyword
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$;

-- get_hourly_activity 改为聚合 hourly_distribution 列（问题 #4 admin 侧）
-- 语义：对最近 p_days 天内活跃的用户，逐小时求和其全天分布数组。
-- 守卫：jsonb_typeof 防非数组；正则 ^\d{1,12}$ 防脏数据/溢出（该列用户可写）；
--       h BETWEEN 0 AND 23 防超长数组注入额外小时桶。返回结构 (hour,count) 不变。
CREATE OR REPLACE FUNCTION get_hourly_activity(p_days INTEGER DEFAULT 7)
RETURNS TABLE (hour INTEGER, count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  RETURN QUERY
  SELECT e.h AS hour, SUM(e.c)::BIGINT AS count
  FROM user_stats us
  CROSS JOIN LATERAL (
    SELECT (ord - 1)::INTEGER AS h,
           CASE WHEN val ~ '^\d{1,12}$' THEN val::BIGINT ELSE 0 END AS c
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(us.hourly_distribution) = 'array'
           THEN us.hourly_distribution
           ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS t(val, ord)
  ) e
  WHERE us.last_active_at >= NOW() - (p_days || ' days')::INTERVAL
    AND e.h BETWEEN 0 AND 23
  GROUP BY e.h
  ORDER BY e.h;
END;
$$;


-- 8. aggregate_daily_stats 改用北京时间（问题 #7 服务端侧）
--    保持 SECURITY DEFINER 且不加守卫，cron/Edge Function 仍可调用
-- ==============================================================================
CREATE OR REPLACE FUNCTION aggregate_daily_stats()
RETURNS void AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
  INSERT INTO analytics_daily (date, total_users, new_users, active_users, total_searches, total_site_visits)
  SELECT
    v_today,
    (SELECT COUNT(*) FROM user_profiles),
    (SELECT COUNT(*) FROM user_profiles
       WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date = v_today),
    (SELECT COUNT(*) FROM user_stats WHERE
      (last_active_at IS NOT NULL AND (last_active_at AT TIME ZONE 'Asia/Shanghai')::date = v_today)
      OR (last_active_at IS NULL AND last_visit_date = v_today)
    ),
    (SELECT COALESCE(SUM(total_searches), 0) FROM user_stats),
    (SELECT COALESCE(SUM(total_site_visits), 0) FROM user_stats)
  ON CONFLICT (date) DO UPDATE SET
    total_users = EXCLUDED.total_users,
    new_users = EXCLUDED.new_users,
    active_users = EXCLUDED.active_users,
    total_searches = EXCLUDED.total_searches,
    total_site_visits = EXCLUDED.total_site_visits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
