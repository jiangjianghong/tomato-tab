-- ==============================================================================
-- Tomato Tab - 安全修复 PART 2：user_profiles 读取 RLS 收紧
-- 配套文档：ADMIN_DATA_SECURITY_FIX_PLAN.md（阶段三）
-- 解决问题 #1：user_profiles 表对所有用户公开可读（匿名 anon 也可读全表）
--
-- ⚠️ 前置（已满足）：前端必须先部署上线——AnnouncementCenter 改用
--    get_public_profiles RPC（SECURITY DEFINER，绕过 RLS），不再直读 user_profiles。
--
-- 收紧后 user_profiles 的 SELECT 策略只剩一条：仅本人或管理员可读。
-- 匿名/他人无法再读取任意用户的 email/role/display_name。
-- UPDATE/INSERT「仅本人」策略保持不变，不在此处改动。
-- ==============================================================================

DROP POLICY IF EXISTS "Anyone can read user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile or admins read all" ON user_profiles;

CREATE POLICY "Users can read own profile or admins read all" ON user_profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());

-- 回滚（如线上回复用户名异常等问题，可临时恢复旧策略）：
-- DROP POLICY IF EXISTS "Users can read own profile or admins read all" ON user_profiles;
-- CREATE POLICY "Users can read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
-- CREATE POLICY "Anyone can read user profiles" ON user_profiles FOR SELECT USING (true);
