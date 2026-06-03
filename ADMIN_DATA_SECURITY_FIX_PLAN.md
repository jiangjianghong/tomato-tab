# Admin 数据统计安全修复方案

> 本文档记录了 tomato-tab 项目 admin 管理界面中用户使用数据在收集和传输过程中发现的所有问题，以及完整的、零破坏风险的分阶段修复方案。

---

## 目录

- [问题清单](#问题清单)
- [风险评估总览](#风险评估总览)
- [实施原则](#实施原则)
- [阶段一：SQL 迁移脚本](#阶段一sql-迁移脚本)
- [阶段二：前端基础加固](#阶段二前端基础加固)
- [阶段三：user_profiles RLS 收紧](#阶段三user_profiles-rls-收紧)
- [阶段四：暂不实施](#阶段四暂不实施)
- [部署检查清单](#部署检查清单)
- [不做之事](#不做之事)
- [涉及文件清单](#涉及文件清单)

---

## 问题清单

### P0 严重问题

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | `user_profiles` 表对所有用户公开可读 | `supabase_deploy.sql:289-290` | 策略为 `USING (true)`，作用于 `public` 角色，**匿名 anon key 也可读全表**（不止已登录用户），暴露所有用户的 `email`、`display_name`、`role` |
| 2 | `analytics_daily` 的 INSERT 策略过于宽松 | `supabase_deploy.sql:285` | 任何已登录用户可向 analytics_daily 插入虚假数据 |
| 3 | SECURITY DEFINER 函数缺少调用者校验 | `supabase_deploy.sql:303,385,399` | 函数默认授予 `PUBLIC`，**任何认证用户、甚至匿名用户**都可调用 `get_popular_searches`、`get_hourly_activity`，读取本应仅管理员可见的聚合数据 |
| 8 | OAuth Token 明文存储 | `supabase_deploy.sql:428-429` | 数据库泄露时所有用户的 Notion token 直接暴露。**本方案不处理**，作为已知接受风险（见[阶段四](#阶段四暂不实施)） |

### P1 中等问题

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 4 | `hourlyDistribution` 和 `streakDays` 不会同步到云端 | `useUserStats.ts:124-142`、`supabase_deploy.sql:399` | 双重影响：①用户年度报告(`AnnualReport.tsx`)的活跃时段在多设备间不一致；②admin 活跃时段图表(`get_hourly_activity`)目前仅按 `last_active_at`（每人只算最后活跃的那 1 个小时）粗略估算，并未反映真实全天分布。本方案将上云该字段并**重写 `get_hourly_activity` 聚合该列**以同时修复两者 |
| 5 | `admin_logs` 的 `ip_address` 字段从未被写入 | `adminUtils.ts:25-31` | 缺少审计追踪的关键信息 |
| 6 | `cardClicks` 数据未做清理验证 | `useUserStats.ts:124-133`（toCloudFormat）、`supabaseSync.ts:717,745` | 恶意用户可构造超大 JSON 对象上传 |
| 7 | 时区处理不一致 | `AdminDashboard.tsx:53-54` | 仪表盘数字与 `analytics_daily` 聚合数据不一致 |
| 9 | `search_logs` 缺少用户删除机制 | `supabase_deploy.sql:349-355` | 用户无法删除自己的搜索历史，不符合隐私法规 |

---

## 风险评估总览

### 各修改项风险等级

| 修改项 | 风险 | 核心风险点 |
|--------|------|-----------|
| D. user_stats 新增列 | **LOW** | 元数据级 DDL，零锁表风险 |
| E. search_logs 外键改 CASCADE | **LOW** | 部署零锁表风险；**注意取舍**：删用户将连带删除其搜索关键词，热门搜索分析会丢失这部分历史（已确认采用，详见下方说明） |
| F. search_logs 新增策略 | **LOW** | 纯新增策略，与现有策略无冲突 |
| B. analytics_daily INSERT 收紧 | **LOW** | SECURITY DEFINER 函数绕过 RLS，不影响现有功能 |
| A. user_profiles RLS 收紧 | **MEDIUM-HIGH** | 会破坏公告回复的用户名显示，必须先部署前端 RPC |
| C. SECURITY DEFINER 函数加守卫 | **MEDIUM** | `aggregate_daily_stats` 不应加守卫（会阻断 cron 调用） |
| H. 重写 `get_hourly_activity` 聚合新列 | **MEDIUM** | 语义由「最后活跃小时」改为「全天分布」；依赖前端先同步该列，**过渡期图表会偏空**，待用户客户端同步后才填充；该列用户可写，需服务端做正则/范围守卫防脏数据 |
| I. `aggregate_daily_stats` 改北京时区 | **LOW-MEDIUM** | 逻辑改动需测试；历史行按 UTC 日期聚合，切换当天可能出现一天的衔接差异（一次性，可接受） |
| G. Notion Token 加密 | **HIGH** | pgsodium 可能未启用；需要独立部署 |

### 前端修改风险等级

| 修改项 | 风险 | 核心风险点 |
|--------|------|-----------|
| sanitizeCardClicks | **LOW** | 遵循现有模式，无兼容性问题；新增条数上限防止 key 数量膨胀 |
| sanitizeHourlyDistribution | **LOW** | 新增；保证上云的 24 元素数组为非负整数，与服务端聚合守卫形成双重防护 |
| AdminDashboard 时区统一 | **MEDIUM** | 改为北京时间(Asia/Shanghai)，且**必须与 SQL `aggregate_daily_stats` 同步修改**，否则前后端口径再次不一致 |
| AnnouncementCenter 改用 RPC | **MEDIUM** | 返回值 shape 必须匹配 |
| PrivacySettings 搜索历史清除 | **MEDIUM** | RPC 函数必须先部署 |
| hourlyDistribution/streakDays 上云 | **HIGH** | 列不存在时 upsert 会持续报错（已通过 fallback 解决）；上云后该列被 admin 图表聚合使用 |
| getClientIp 外部 API | **HIGH** | 广告拦截器阻断、延迟高（已决定跳过） |

---

## 实施原则

1. **SQL 先行，前端跟进** — 所有数据库变更必须先于前端部署
2. **每一步都有 fallback** — 任何新功能失败时，旧功能不受影响
3. **可回滚** — 每个变更都能安全回退
4. **不引入外部依赖** — 不使用 ipify.org 等外部 API

---

## 阶段一：SQL 迁移脚本

> 一次性部署（第 9 步 RLS 除外）。SQL 操作本身均为低风险（`CREATE OR REPLACE` / `ADD COLUMN`）；其中第 7 步 `get_hourly_activity` 改写属语义变更，过渡期图表可能偏空。在 Supabase SQL Editor 中执行。
>
> **注意：第 9 步（RLS 收紧）必须在阶段三前端部署完成后才能执行。**

```sql
-- ==============================================================================
-- Tomato Tab - 安全修复迁移脚本
-- 说明：所有变更均为向后兼容，旧前端不会受到影响
-- ==============================================================================

-- 1. user_stats 新增列（零锁表，元数据级操作）
-- 解决问题 #4：hourlyDistribution 和 streakDays 不会同步到云端
-- ==============================================================================
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS hourly_distribution
  JSONB DEFAULT '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0;


-- 2. search_logs 外键改 CASCADE（删除用户时清理搜索记录）
-- 解决问题 #9：search_logs 缺少用户删除机制（子问题 b）
-- 取舍（已确认）：原为 ON DELETE SET NULL（保留匿名关键词供热门搜索分析）；
--   改为 CASCADE 后，删号会连带删除该用户的搜索关键词，热门搜索统计将丢失这部分历史。
--   选择 CASCADE 以满足「删号=删数据」的隐私合规预期。
-- ==============================================================================
ALTER TABLE search_logs
  DROP CONSTRAINT IF EXISTS search_logs_user_id_fkey;
ALTER TABLE search_logs
  ADD CONSTRAINT search_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- 3. search_logs 用户可删除自己的记录
-- 解决问题 #9：search_logs 缺少用户删除机制（子问题 a）
-- ==============================================================================
DROP POLICY IF EXISTS "Users can delete own search logs" ON search_logs;
CREATE POLICY "Users can delete own search logs" ON search_logs
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own search logs" ON search_logs;
CREATE POLICY "Users can read own search logs" ON search_logs
  FOR SELECT USING (auth.uid() = user_id);


-- 4. 批量删除搜索记录的 RPC 函数
-- 解决问题 #9：提供高效的批量删除接口
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


-- 5. 公开资料查询 RPC（用于公告回复显示用户名）
-- 解决问题 #1 的前置准备：收紧 RLS 后仍能显示回复用户名
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


-- 6. analytics_daily INSERT 收紧（阻断浏览器客户端直接插入）
-- 解决问题 #2：analytics_daily 的 INSERT 策略过于宽松
-- 说明：
--   - aggregate_daily_stats() 是 SECURITY DEFINER，绕过 RLS，正常写入不受影响
--   - service_role 本身绕过 RLS；浏览器只会用 anon/authenticated，auth.role() 不等于
--     'service_role'，因此该策略实际效果 = 阻断所有客户端直接插入
--   - auth.role() 是 Supabase 旧 helper（仍可用）；若担心其废弃，可改用等价的
--     WITH CHECK (false)（service_role 仍可绕过 RLS 写入，效果相同）
-- ==============================================================================
DROP POLICY IF EXISTS "System can insert analytics" ON analytics_daily;
CREATE POLICY "System can insert analytics" ON analytics_daily
  FOR INSERT WITH CHECK (auth.role() = 'service_role');


-- 7. SECURITY DEFINER 函数加管理员守卫
-- 解决问题 #3：SECURITY DEFINER 函数缺少调用者校验
-- 注意：aggregate_daily_stats 不加守卫，因为它可能被 cron/Edge Function 调用
--       service_role 下 auth.uid() 返回 NULL，is_admin() 会返回 FALSE
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

-- get_hourly_activity 改为聚合 hourly_distribution 列（解决问题 #4 的 admin 侧）
-- 语义：对「最近 p_days 天内活跃」的用户，逐小时求和其全天分布数组，得到真实活跃时段分布。
--   （原实现仅取每人 last_active_at 的那 1 个小时，无法反映真实分布）
-- 依赖：user_stats.hourly_distribution 列（步骤 1 已新增）+ 前端已同步该列（阶段二）
-- 返回值结构 (hour, count) 保持不变，AdminAnalytics.tsx 无需改动
CREATE OR REPLACE FUNCTION get_hourly_activity(p_days INTEGER DEFAULT 7)
RETURNS TABLE (hour INTEGER, count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  -- 守卫：jsonb_typeof 防非数组；正则 ^\d{1,12}$ 防脏数据/溢出（该列用户可写自己行）；
  --       h BETWEEN 0 AND 23 防超长数组注入额外小时桶
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


-- 8. aggregate_daily_stats 改用北京时间（解决问题 #7 的服务端侧）
-- 说明：原用 CURRENT_DATE(UTC)，与前端「今日」口径不一致。改为 Asia/Shanghai 后，
--       与阶段二 AdminDashboard 的北京时间口径对齐。
-- 注意：本函数保持 SECURITY DEFINER 且【不加 is_admin() 守卫】，以便未来 cron/Edge
--       Function（service_role，auth.uid() 为 NULL）仍能调用。
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
      -- 注：last_visit_date 由客户端按 UTC 日期写入，此回退分支在午夜前后可能 ±1 天；
      --     绝大多数行有 last_active_at，主路径已按北京时间精确判断
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


-- 9. user_profiles RLS 收紧
-- 解决问题 #1：user_profiles 表对所有用户公开可读
-- ⚠️ 此步骤必须在阶段三前端部署完成后才能执行！
-- ⚠️ 取消下方注释以执行：
-- ==============================================================================
-- DROP POLICY IF EXISTS "Anyone can read user profiles" ON user_profiles;
-- DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
-- CREATE POLICY "Users can read own profile or admins read all" ON user_profiles
--   FOR SELECT USING (auth.uid() = id OR is_admin());
```

### 阶段一安全性说明

| 步骤 | 安全性 | 原因 |
|------|--------|------|
| 1 | `ADD COLUMN IF NOT EXISTS` | 元数据操作，不锁表，不影响现有 upsert |
| 2 | 外键约束变更 | 小表无影响，NULL 行不受限 |
| 3-5 | 纯新增 | 不修改任何现有策略 |
| 6 | `aggregate_daily_stats` 绕过 RLS | SECURITY DEFINER 函数不受 INSERT 策略影响 |
| 7 | 读取函数加守卫 + `get_hourly_activity` 改聚合 | 不影响写入函数；新查询带 jsonb/正则/范围守卫，对脏数据安全 |
| 8 | `aggregate_daily_stats` 改北京时区 | 仅改日期口径，保持 SECURITY DEFINER 且不加守卫，cron 仍可调用 |
| 9 | 依赖前端已改用 RPC | 必须在阶段三之后执行 |

---

## 阶段二：前端基础加固

> 无破坏风险的独立修改，可与阶段一（不含第 9 步 RLS）同版本部署。其中 2.4 时区改动须与阶段一第 8 步同步上线。

### 2.1 给 `saveUserStats` 添加列不存在的 fallback

**解决问题：** #4（hourlyDistribution/streakDays 上云）
**风险等级：** HIGH -> 通过 fallback 降至 LOW
**文件：** `src/lib/supabaseSync.ts`

参考 `saveUserSettings`（第 99-178 行）的 fallback 模式，修改 `saveUserStats` 函数：

```typescript
export const saveUserStats = async (
  user: User,
  stats: UserStatsData,
  callbacks?: SyncStatusCallback
): Promise<boolean> => {
  try {
    callbacks?.onSyncStart?.();

    const { error } = await retryAsync(
      async () =>
        supabase.from(TABLES.USER_STATS).upsert(
          {
            id: user.id,
            total_site_visits: stats.totalSiteVisits,
            total_searches: stats.totalSearches,
            settings_opened: stats.settingsOpened,
            app_opened: stats.appOpened,
            card_clicks: stats.cardClicks,
            first_use_date: stats.firstUseDate,
            last_visit_date: stats.lastVisitDate,
            last_active_at: stats.lastActiveAt || new Date().toISOString(),
            hourly_distribution: stats.hourlyDistribution || new Array(24).fill(0),
            streak_days: stats.streakDays ?? 0,
            last_sync: new Date().toISOString(),
          },
          { onConflict: 'id' }
        ),
      3,
      1000
    );

    if (error) {
      // 如果新字段导致错误，回退到基本字段
      // 注：PostgREST upsert 遇未知列返回 PGRST204；Postgres 直接报 42703
      if (
        error.code === '42703' ||
        error.code === 'PGRST204' ||
        error.message?.includes('column') ||
        error.message?.includes('does not exist')
      ) {
        logger.sync.warn('user_stats 新字段暂不可用，使用基本字段同步');

        const basicData = {
          id: user.id,
          total_site_visits: stats.totalSiteVisits,
          total_searches: stats.totalSearches,
          settings_opened: stats.settingsOpened,
          app_opened: stats.appOpened,
          card_clicks: stats.cardClicks,
          first_use_date: stats.firstUseDate,
          last_visit_date: stats.lastVisitDate,
          last_active_at: stats.lastActiveAt || new Date().toISOString(),
          last_sync: new Date().toISOString(),
        };

        const { error: basicError } = await supabase
          .from(TABLES.USER_STATS)
          .upsert(basicData, { onConflict: 'id' });

        if (basicError) throw basicError;
      } else {
        throw error;
      }
    }

    logger.sync.info('用户统计数据同步成功');
    callbacks?.onSyncSuccess?.('统计数据已同步');
    return true;
  } catch (error) {
    logger.sync.error('保存用户统计数据失败', error);
    callbacks?.onSyncError?.('统计数据同步失败: ' + (error as Error).message);
    return false;
  }
};
```

**安全性：** 列存在时走完整路径，列不存在时自动 fallback 到旧字段，用户无感知。

---

### 2.2 添加 `sanitizeCardClicks` 函数

**解决问题：** #6（cardClicks 数据未做清理验证）
**风险等级：** LOW
**文件：** `src/lib/dataValidator.ts`

在文件末尾添加：

```typescript
/**
 * 清理卡片点击数据，防止恶意或损坏数据上传
 */
export const sanitizeCardClicks = (cardClicks: any): Record<string, number> => {
  if (!cardClicks || typeof cardClicks !== 'object' || Array.isArray(cardClicks)) {
    return {};
  }

  const MAX_KEY_LENGTH = 100;
  const MAX_CLICKS = 1_000_000;
  const MAX_ENTRIES = 500; // 防止恶意构造海量不同 key 膨胀 JSON

  const valid: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(cardClicks)) {
    if (typeof key !== 'string' || key.trim().length === 0 || key.length > MAX_KEY_LENGTH) {
      continue;
    }
    if (typeof value !== 'number' || !isFinite(value) || value < 0) {
      continue;
    }
    valid.push([key.trim(), Math.min(Math.floor(value), MAX_CLICKS)]);
  }

  // 超出条数上限时，保留点击数最高的前 N 个
  valid.sort((a, b) => b[1] - a[1]);

  const sanitized: Record<string, number> = {};
  for (const [key, value] of valid.slice(0, MAX_ENTRIES)) {
    sanitized[key] = value;
  }
  return sanitized;
};

/**
 * 清理 24 小时活跃分布数组，保证为长度 24 的非负整数数组
 * （该数组上云后会被 admin 的 get_hourly_activity 聚合，必须防脏数据）
 */
export const sanitizeHourlyDistribution = (value: any): number[] => {
  const result = new Array(24).fill(0);
  if (!Array.isArray(value)) return result;

  const MAX_PER_HOUR = 10_000_000;
  for (let i = 0; i < 24; i++) {
    const v = value[i];
    if (typeof v === 'number' && isFinite(v) && v >= 0) {
      result[i] = Math.min(Math.floor(v), MAX_PER_HOUR);
    }
  }
  return result;
};
```

**安全性：** `sanitizeCardClicks` 只过滤无效数据（空 key、负数、非数字、超大值）并限制条数；`sanitizeHourlyDistribution` 始终返回干净的 24 元素整数数组，与服务端正则守卫形成双重防护。

---

### 2.3 修改 `useUserStats.ts` 和 `supabaseSync.ts` 支持新字段同步

**解决问题：** #4（hourlyDistribution/streakDays 不会同步到云端）
**文件：** `src/hooks/useUserStats.ts`

#### 修改 `toCloudFormat`（约第 124 行）

```typescript
import { sanitizeCardClicks, sanitizeHourlyDistribution } from '@/lib/dataValidator';

const toCloudFormat = (stats: UserStats, includeActiveAt = false): UserStatsData => ({
  totalSiteVisits: stats.totalSiteVisits,
  totalSearches: stats.totalSearches,
  settingsOpened: stats.settingsOpened,
  appOpened: stats.appOpened,
  cardClicks: sanitizeCardClicks(stats.cardClicks),  // 添加清理
  firstUseDate: stats.firstUseDate,
  lastVisitDate: stats.lastVisitDate,
  hourlyDistribution: sanitizeHourlyDistribution(stats.hourlyDistribution),  // 新增+清理
  streakDays: stats.streakDays,                      // 新增
  ...(includeActiveAt ? { lastActiveAt: new Date().toISOString() } : {}),
});
```

#### 修改 `fromCloudFormat`（约第 136 行）

```typescript
const fromCloudFormat = (cloud: UserStatsData, local: UserStats): UserStats => ({
  ...cloud,
  todaySiteVisits: local.todaySiteVisits,    // 今日数据只保存在本地
  todaySearches: local.todaySearches,
  hourlyDistribution: Array.isArray(cloud.hourlyDistribution) && cloud.hourlyDistribution.length === 24
    ? cloud.hourlyDistribution
    : local.hourlyDistribution,
  streakDays: typeof cloud.streakDays === 'number' && cloud.streakDays > 0
    ? cloud.streakDays
    : local.streakDays,
});
```

**文件：** `src/lib/supabaseSync.ts`

#### 扩展 `UserStatsData` 接口（约第 640 行）

```typescript
export interface UserStatsData {
  totalSiteVisits: number;
  totalSearches: number;
  settingsOpened: number;
  appOpened: number;
  cardClicks: Record<string, number>;
  firstUseDate: string;
  lastVisitDate: string;
  lastActiveAt?: string;
  hourlyDistribution?: number[];    // 新增
  streakDays?: number;              // 新增
}
```

#### 修改 `getUserStats`（约第 710 行）

> 同时在 `supabaseSync.ts` 顶部的 `from './dataValidator'` 导入中加入
> `sanitizeCardClicks, sanitizeHourlyDistribution`（`getUserStats` 与 `mergeUserStats` 都会用到）。

```typescript
if (data) {
  logger.sync.info('从云端获取用户统计数据成功');
  return {
    totalSiteVisits: data.total_site_visits || 0,
    totalSearches: data.total_searches || 0,
    settingsOpened: data.settings_opened || 0,
    appOpened: data.app_opened || 0,
    cardClicks: sanitizeCardClicks(data.card_clicks),  // 添加清理
    firstUseDate: data.first_use_date || new Date().toISOString().split('T')[0],
    lastVisitDate: data.last_visit_date || new Date().toISOString().split('T')[0],
    lastActiveAt: data.last_active_at || undefined,
    hourlyDistribution: sanitizeHourlyDistribution(data.hourly_distribution),  // 清理+补齐 24 长度
    streakDays: typeof data.streak_days === 'number' && data.streak_days > 0 ? data.streak_days : 0,
  };
}
```

#### 修改 `mergeUserStats`（约第 733 行）

```typescript
export const mergeUserStats = (local: UserStatsData, cloud: UserStatsData): UserStatsData => {
  // 合并卡片点击数据
  const mergedCardClicks: Record<string, number> = { ...local.cardClicks };
  for (const [cardId, clicks] of Object.entries(cloud.cardClicks)) {
    mergedCardClicks[cardId] = Math.max(mergedCardClicks[cardId] || 0, clicks);
  }

  return {
    totalSiteVisits: Math.max(local.totalSiteVisits, cloud.totalSiteVisits),
    totalSearches: Math.max(local.totalSearches, cloud.totalSearches),
    settingsOpened: Math.max(local.settingsOpened, cloud.settingsOpened),
    appOpened: Math.max(local.appOpened, cloud.appOpened),
    cardClicks: sanitizeCardClicks(mergedCardClicks),
    firstUseDate: local.firstUseDate < cloud.firstUseDate ? local.firstUseDate : cloud.firstUseDate,
    lastVisitDate: local.lastVisitDate > cloud.lastVisitDate ? local.lastVisitDate : cloud.lastVisitDate,
    // 新增：逐元素取最大值
    hourlyDistribution: Array.from({ length: 24 }, (_, i) =>
      Math.max(local.hourlyDistribution?.[i] || 0, cloud.hourlyDistribution?.[i] || 0)
    ),
    streakDays: Math.max(local.streakDays || 0, cloud.streakDays || 0),
  };
};
```

**安全性：**
- 有 fallback 保护（2.1），列不存在时不会报错
- `fromCloudFormat` 云端有数据时用云端，没有时保留本地
- `mergeUserStats` 对数组逐元素取 max，多设备同步不会丢数据

---

### 2.4 AdminDashboard 时区统一为北京时间

**解决问题：** #7（时区处理不一致）
**风险等级：** MEDIUM
**文件：** `src/components/Admin/AdminDashboard.tsx`
**前置：** 必须与阶段一第 8 步（`aggregate_daily_stats` 改 `Asia/Shanghai`）同时上线，否则前后端口径仍不一致。

用 `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })` 取北京日期（`en-CA` 输出 `YYYY-MM-DD`）。

#### 修改日期计算（约第 53-54 行）

```typescript
// 原来（本地时区）：
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// 改为（北京时间，与服务器 aggregate_daily_stats 的 Asia/Shanghai 一致）：
const beijingDate = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(d); // YYYY-MM-DD
const today = beijingDate(new Date());
```

#### 修改 newUsersToday 查询（约第 58 行）

```typescript
// 北京时间零点 = UTC+8
.gte('created_at', `${today}T00:00:00+08:00`);
```

#### 修改 activeUsersToday 过滤（约第 70-78 行）

```typescript
const activeUsersToday = statsData?.filter((s) => {
    if (s.last_active_at) {
        return beijingDate(new Date(s.last_active_at)) === today;
    }
    return s.last_visit_date === today;
}).length || 0;
```

**安全性：** 只影响显示数字，与 `aggregate_daily_stats`（已改 `Asia/Shanghai`）对齐。数字相对旧版本会变化，属预期行为。

---

### 2.5 AdminUtils IP 记录（非阻塞方案）

**解决问题：** #5（admin_logs 的 ip_address 字段从未被写入）
**风险等级：** LOW（不引入外部 API 依赖）
**文件：** `src/lib/adminUtils.ts`

**决策：** 不使用 ipify.org 等外部 API（广告拦截器阻断、3 秒延迟、外部依赖）。`ip_address` 列保持 NULL，未来可通过 Supabase Edge Function 的 `x-forwarded-for` header 或数据库触发器补充。

当前代码无需修改，`logAdminAction` 保持原样即可。`ip_address` 列是 nullable 的，不填不影响功能。

---

### 2.6 PrivacySettings 添加搜索历史清除

**解决问题：** #9（search_logs 缺少用户删除机制）
**风险等级：** MEDIUM
**文件：** `src/components/PrivacySettings.tsx`

#### 添加导入

```typescript
import { supabase } from '@/lib/supabase';
```

#### 添加状态和处理函数

```typescript
const [clearingSearchLogs, setClearingSearchLogs] = useState(false);

const handleClearSearchHistory = async () => {
    const confirmed = confirm(
        '确认清除搜索历史？\n\n这将删除服务器上记录的所有搜索关键词。\n此操作不可撤销！'
    );
    if (!confirmed) return;

    setClearingSearchLogs(true);
    try {
        const { data, error } = await supabase.rpc('delete_my_search_logs');
        if (error) throw error;
        alert(`已清除 ${data || 0} 条搜索记录`);
    } catch (err) {
        console.error('清除搜索历史失败:', err);
        alert('清除失败，请稍后重试');
    } finally {
        setClearingSearchLogs(false);
    }
};
```

#### 添加按钮（在"重置使用统计"按钮之后，约第 289 行后）

```tsx
<button
    onClick={handleClearSearchHistory}
    disabled={clearingSearchLogs}
    className="w-full p-3 bg-purple-100 hover:bg-purple-200 disabled:bg-gray-100 disabled:text-gray-400 text-purple-800 rounded-lg transition-colors text-left"
>
    <div className="flex items-center gap-3">
        <i className="fa-solid fa-magnifying-glass"></i>
        <div>
            <div className="font-medium">清除搜索历史</div>
            <div className="text-sm opacity-75">删除服务器上记录的所有搜索关键词</div>
        </div>
    </div>
</button>
```

**安全性：** 纯新增功能，不影响现有代码。RPC 函数在阶段一已部署。失败时有错误提示。

---

## 阶段三：user_profiles RLS 收紧

> 在阶段二部署并验证公告回复功能正常后执行。

### 3.1 修改 AnnouncementCenter.tsx

**解决问题：** #1（user_profiles 公开可读）的前端适配
**风险等级：** MEDIUM
**文件：** `src/components/AnnouncementCenter.tsx`

#### 修改 `loadReplies` 函数（约第 142-155 行）

```typescript
// 获取所有唯一的 user_id
const userIds = [...new Set((data || []).map(r => r.user_id))];

// 使用 RPC 获取公开资料（不暴露 email 等敏感信息）
let userNames: Record<string, string> = {};
if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
        .rpc('get_public_profiles', { p_user_ids: userIds });

    if (!profileError && profiles) {
        profiles.forEach((p: { id: string; display_name: string }) => {
            userNames[p.id] = p.display_name || '';
        });
    }
}
```

#### 修改 `submitReply` 函数（约第 192-208 行）

将 join 查询改为两步查询：

```typescript
// 重新加载该公告的回复（改为两步查询）
const { data } = await supabase
    .from('announcement_replies')
    .select('id, announcement_id, user_id, content, created_at')
    .eq('announcement_id', announcementId)
    .order('created_at', { ascending: true });

// 获取用户名
const replyUserIds = [...new Set((data || []).map(r => r.user_id))];
const { data: replyProfiles } = await supabase
    .rpc('get_public_profiles', { p_user_ids: replyUserIds });

const replyNameMap = new Map(
    (replyProfiles || []).map((p: { id: string; display_name: string }) => [p.id, p.display_name])
);

const formattedReplies = (data || []).map(reply => ({
    ...reply,
    user_name: replyNameMap.get(reply.user_id) || `用户${reply.user_id.substring(0, 6)}`
}));
```

**安全性：** RPC 返回相同的 `{ id, display_name }` 结构，现有逻辑完全兼容。失败时 fallback 到显示用户 ID 前 6 位。

---

### 3.2 执行 RLS 收紧 SQL

在前端部署并验证公告回复功能正常后，在 Supabase SQL Editor 中执行：

```sql
-- 收紧 user_profiles 读取策略
DROP POLICY IF EXISTS "Anyone can read user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read own profile or admins read all" ON user_profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());
```

**回滚方案：** 如果出现问题，重建旧策略：

```sql
DROP POLICY IF EXISTS "Users can read own profile or admins read all" ON user_profiles;
CREATE POLICY "Users can read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Anyone can read user profiles" ON user_profiles FOR SELECT USING (true);
```

**安全性：** 前端已改用 RPC 查询公开资料，不再依赖直接读取 `user_profiles`。管理员组件通过 `is_admin()` 仍有完整访问权限。

> 关于 `get_public_profiles`：它是 `SECURITY DEFINER`，默认授予 `PUBLIC`（任意已登录甚至匿名用户可调用），但**仅返回 `id` 与 `display_name`**，不再暴露 `email`/`role`。`display_name` 本就在公告回复中公开显示，属可接受范围。若希望仅登录用户可调用，可追加：
> ```sql
> REVOKE EXECUTE ON FUNCTION get_public_profiles(UUID[]) FROM anon;
> ```

---

## ⚠️ 执行偏差记录（2026-06-03）

实际部署时发现**线上 DB 的 RLS 策略与本文档 / `supabase_deploy.sql` 已分叉**，原计划的「按名 `DROP POLICY`」不足以堵洞：

- 阶段三 / 第 9 步原本只删 `"Anyone can read user profiles"` 和 `"Users can read own profile"` 两个**已知名字**的策略。推送后用 anon key 实测，**匿名仍可读全表 `email`/`role`**（含 super_admin）。
- 根因：线上 `user_profiles` 上存在**后台手动创建、repo 任何 .sql 都没有**的策略 —— `"Anyone can read user profiles for replies"`（`SELECT USING (true)`，role `public`）以及 `"Admins can read basic profiles"`。前者带 "for replies" 后缀，按名 drop 漏掉了它（RLS 策略 OR 关系，漏一条即放行）。
- 解决：追加**名字无关**的纠正迁移 `supabase/migrations/20260603012240_user_profiles_rls_dropall_select.sql` —— 用 `DO` 块遍历 `pg_policies` 删除 `user_profiles` 上**所有 SELECT 策略**后，重建唯一的「本人或管理员」读策略（不触碰 INSERT/UPDATE 写策略），并 `RAISE NOTICE` 打印 before/after 快照。
- 验证：anon REST 直读 `user_profiles` 由「全表 email/role」变为 `[]`（HTTP 200）；`get_public_profiles` RPC 仍返回 200，合法路径完好。

**教训：改 RLS 前别信 repo SQL 里的策略名就是线上全部；应先 introspect `pg_policies`。anon key 直打 REST 做匿名读测，是验证洞是否堵上的有效手段。**

---

## 阶段四：暂不实施

> 经评估，原阶段四的两项均不纳入本方案（详见[不做之事](#不做之事)）：
>
> - **Notion Token 加密**（对应 P0 #8）：Supabase 磁盘层已加密、RLS 已限制访问，明文风险主要在整库 dump / service_role 泄露场景；而 pgsodium/Vault 需 Pro 计划、密钥仍存于同库、迁移复杂度高。结合 Notion 集成的实际使用量，作为**已知接受风险**暂不处理；未来若要做，优先考虑「Edge Function + 库外密钥」的服务端加密方案。
> - **AdminLogs IP 显示**（对应 #5）：2.5 已放弃 IP 采集，该显示列恒为 NULL，无意义。

---

## 部署检查清单

| 步骤 | 操作 | 验证方式 | 回滚方案 |
|------|------|----------|----------|
| 1 | 执行阶段一 SQL 脚本（不含第 9 步） | `SELECT hourly_distribution FROM user_stats LIMIT 1` 返回 JSONB；以管理员执行 `SELECT * FROM get_hourly_activity(7)` 成功、非管理员报权限错误 | `DROP COLUMN IF EXISTS` / 恢复旧函数体 |
| 2 | 部署阶段二前端代码 | 用户统计数据正常同步，无控制台报错 | git revert |
| 3 | 验证 `saveUserStats` fallback | 临时删除列，确认同步不报错 | 恢复列 |
| 4 | 验证 hourly_distribution 上云 | 触发几次访问/搜索后，查自己行 `hourly_distribution` 非全零 | - |
| 5 | 验证 aggregate 北京时区 | 点击「更新统计数据」，`analytics_daily.date` 为北京日期；admin「今日」与聚合一致 | 恢复旧函数体（UTC） |
| 6 | 验证 admin 活跃时段图表 | 用户同步后，AdminAnalytics 活跃时段图按真实分布展示（**过渡期可能偏空，待客户端同步后填充**） | - |
| 7 | 验证搜索历史清除按钮 | 点击按钮，确认 RPC 调用成功 | 删除按钮代码 |
| 8 | 部署阶段三 AnnouncementCenter 修改 | 公告回复正常显示用户名 | git revert |
| 9 | 执行阶段一第 9 步 RLS 收紧 SQL | 非管理员无法直接查询他人 profile | 重建旧策略 |
| 10 | 端到端测试 | 非管理员：公告回复显示用户名；管理员：所有面板正常 | - |

---

## 不做之事

| 不做的事 | 原因 |
|----------|------|
| 使用 ipify.org 获取 IP | 广告拦截器阻断、3 秒延迟、外部依赖 |
| 给 `aggregate_daily_stats` 加 `is_admin()` 守卫 | 会阻断未来 cron/Edge Function 自动调用 |
| Notion Token 加密（原阶段四 4.1，P0 #8） | Supabase 已磁盘加密 + RLS 限制；pgsodium/Vault 需 Pro 计划、密钥仍同库、迁移复杂；结合使用量作为已知接受风险暂不做。未来优先「Edge Function + 库外密钥」 |
| 客户端加密 Token | 加密密钥必须在客户端内存中，XSS 攻击可提取 |
| AdminLogs IP 显示（原阶段四 4.2，#5） | 2.5 已放弃 IP 采集，显示列恒为 NULL，无意义 |

---

## 涉及文件清单

| 文件 | 阶段 | 修改内容 |
|------|------|----------|
| `supabase_deploy.sql` | 参考 | 迁移脚本参考（含 `get_hourly_activity` 改聚合、`aggregate_daily_stats` 改北京时区），不直接修改此文件 |
| `src/lib/supabaseSync.ts` | 二 | 给 `saveUserStats` 加 fallback、扩展 `UserStatsData` 接口、更新 `getUserStats`/`mergeUserStats`、导入 `sanitizeCardClicks`+`sanitizeHourlyDistribution` |
| `src/hooks/useUserStats.ts` | 二 | 更新 `toCloudFormat`/`fromCloudFormat`、导入 `sanitizeCardClicks`+`sanitizeHourlyDistribution` |
| `src/lib/dataValidator.ts` | 二 | 添加 `sanitizeCardClicks`、`sanitizeHourlyDistribution` 函数 |
| `src/components/Admin/AdminDashboard.tsx` | 二 | 时区统一为北京时间（`Asia/Shanghai`） |
| `src/components/Admin/AdminAnalytics.tsx` | 二 | 无需改代码（`get_hourly_activity` 返回 shape 不变）；活跃时段图标签可选改为「全天分布」 |
| `src/lib/adminUtils.ts` | 二 | 无修改（IP 记录暂跳过） |
| `src/components/PrivacySettings.tsx` | 二 | 添加搜索历史清除按钮 |
| `src/components/AnnouncementCenter.tsx` | 三 | 改用 `get_public_profiles` RPC |
