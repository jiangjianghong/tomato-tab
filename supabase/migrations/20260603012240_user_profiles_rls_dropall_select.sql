-- ==============================================================================
-- Tomato Tab - 安全修复 PART 2 纠正补丁：彻底收紧 user_profiles 读取 RLS
-- 配套文档：ADMIN_DATA_SECURITY_FIX_PLAN.md（阶段三）/ 问题 #1
--
-- 背景：前一迁移 20260602065335 只 DROP 了两个【已知名字】的策略
--   （"Anyone can read user profiles" / "Users can read own profile"），
--   但线上以 anon key 实测仍能读到全部用户 email/role —— 说明线上存在一条
--   【repo 外、后台手动创建、名字未知】的宽松 SELECT 策略（OR 关系下仍放行）。
--
-- 本迁移名字无关：遍历 pg_policies 删除 user_profiles 上【所有 SELECT 策略】，
--   再重建唯一正确的「仅本人或管理员可读」策略。不触碰 INSERT/UPDATE/DELETE 写策略。
--   前后各打印一次策略快照（NOTICE 会出现在 supabase db push 输出中，便于核对）。
--
-- 安全前提（已满足）：前端 AnnouncementCenter 已改用 get_public_profiles RPC
--   （SECURITY DEFINER，绕过 RLS），不再直读 user_profiles 取回复用户名。
-- ==============================================================================

-- ---- 1) 打印 before 快照 + 删除所有 SELECT 策略 ----------------------------
DO $$
DECLARE
  r RECORD;
  v_all_permissive INT := 0;
BEGIN
  RAISE NOTICE '==== user_profiles 策略快照（before）====';
  FOR r IN
    SELECT policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE '[before] name=% | cmd=% | permissive=% | roles=% | using=% | check=%',
      r.policyname, r.cmd, r.permissive, r.roles, r.qual, r.with_check;
    -- 记录是否存在宽松的 ALL 策略（本迁移不自动删 ALL，避免连带移除写权限）
    IF r.cmd = 'ALL' AND r.permissive = 'PERMISSIVE' THEN
      v_all_permissive := v_all_permissive + 1;
    END IF;
  END LOOP;

  -- 删除所有作用于 SELECT 的策略（cmd='SELECT'）
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_profiles', r.policyname);
    RAISE NOTICE '[dropped SELECT policy] %', r.policyname;
  END LOOP;

  IF v_all_permissive > 0 THEN
    RAISE WARNING '检测到 % 条 PERMISSIVE 的 cmd=ALL 策略，可能仍放行 SELECT；请看 before 快照中 cmd=ALL 的行并单独处理。', v_all_permissive;
  END IF;
END $$;

-- ---- 2) 重建唯一的 SELECT 策略：仅本人或管理员 ------------------------------
CREATE POLICY "Users can read own profile or admins read all" ON user_profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());

-- ---- 3) 打印 after 快照 ------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '==== user_profiles 策略快照（after）====';
  FOR r IN
    SELECT policyname, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE '[after] name=% | cmd=% | using=%', r.policyname, r.cmd, r.qual;
  END LOOP;
END $$;

-- 回滚（如线上回复用户名异常等问题，可临时恢复公开读）：
-- CREATE POLICY "Anyone can read user profiles" ON user_profiles FOR SELECT USING (true);
