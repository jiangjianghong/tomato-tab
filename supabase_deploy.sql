-- ==============================================================================
-- Tomato Tabs - Unified Deployment Script (One-Click Setup)
-- 西红柿标签页 - 统一部署脚本 (一键安装)
-- ==============================================================================
-- Usage: Run this entire script in the Supabase SQL Editor.
-- 用法: 在 Supabase SQL Editor 中运行此脚本即可完成所有数据库配置。
-- ==============================================================================

-- 1. Create Tables (创建数据表)
-- ==============================================================================

-- 1.1 User Profiles (用户资料表)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.2 User Settings (用户设置表) - Includes all latest columns
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  -- Basic Appearance
  card_opacity NUMERIC DEFAULT 0.8,
  search_bar_opacity NUMERIC DEFAULT 0.9,
  parallax_enabled BOOLEAN DEFAULT true,
  wallpaper_resolution TEXT DEFAULT 'high',
  theme TEXT DEFAULT 'dark',
  -- Colors
  card_color TEXT DEFAULT '255, 255, 255',
  search_bar_color TEXT DEFAULT '255, 255, 255',
  -- Sync Settings
  auto_sync_enabled BOOLEAN DEFAULT true,
  auto_sync_interval INTEGER DEFAULT 30,
  -- Behavior
  search_in_new_tab BOOLEAN DEFAULT true,
  auto_sort_enabled BOOLEAN DEFAULT false,
  -- Time Component
  time_component_enabled BOOLEAN DEFAULT true,
  show_full_date BOOLEAN DEFAULT true,
  show_seconds BOOLEAN DEFAULT true,
  show_weekday BOOLEAN DEFAULT true,
  show_year BOOLEAN DEFAULT true,
  show_month BOOLEAN DEFAULT true,
  show_day BOOLEAN DEFAULT true,
  -- Style
  search_bar_border_radius INTEGER DEFAULT 12,
  -- Meta
  last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.3 User Websites (用户网站数据表)
CREATE TABLE IF NOT EXISTS user_websites (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  websites JSONB DEFAULT '[]'::jsonb,
  last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.4 User Stats (用户统计表)
CREATE TABLE IF NOT EXISTS user_stats (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  total_site_visits INTEGER DEFAULT 0,
  total_searches INTEGER DEFAULT 0,
  settings_opened INTEGER DEFAULT 0,
  app_opened INTEGER DEFAULT 0,
  card_clicks JSONB DEFAULT '{}'::jsonb,
  first_use_date DATE DEFAULT CURRENT_DATE,
  last_visit_date DATE DEFAULT CURRENT_DATE,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 精确活跃时间戳
  last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS) (启用行级安全)
-- ==============================================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- 3. Create Security Policies (创建安全策略)
-- ==============================================================================

-- Helper for common policies (DROP helps if re-running script)
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Settings Policies
DROP POLICY IF EXISTS "Users can read own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;

CREATE POLICY "Users can read own settings" ON user_settings FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = id);

-- Websites Policies
DROP POLICY IF EXISTS "Users can read own websites" ON user_websites;
DROP POLICY IF EXISTS "Users can update own websites" ON user_websites;
DROP POLICY IF EXISTS "Users can insert own websites" ON user_websites;

CREATE POLICY "Users can read own websites" ON user_websites FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own websites" ON user_websites FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own websites" ON user_websites FOR INSERT WITH CHECK (auth.uid() = id);

-- Stats Policies
DROP POLICY IF EXISTS "Users can read own stats" ON user_stats;
DROP POLICY IF EXISTS "Users can update own stats" ON user_stats;
DROP POLICY IF EXISTS "Users can insert own stats" ON user_stats;

CREATE POLICY "Users can read own stats" ON user_stats FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own stats" ON user_stats FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own stats" ON user_stats FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. Create Functions & Triggers (创建函数与触发器)
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers to avoid duplication errors on re-run
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
DROP TRIGGER IF EXISTS update_user_websites_updated_at ON user_websites;
DROP TRIGGER IF EXISTS update_user_stats_updated_at ON user_stats;

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_websites_updated_at BEFORE UPDATE ON user_websites 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON user_stats 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Storage Buckets (存储桶)
-- ==============================================================================
-- Note: Running this via SQL Editor might require special permissions.
-- If this fails, please create buckets named 'favicons' and 'wallpapers' manually in the Dashboard.

INSERT INTO storage.buckets (id, name, public)
VALUES ('favicons', 'favicons', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('wallpapers', 'wallpapers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies (Public Read, Authenticated Upload)

-- Favicons
DROP POLICY IF EXISTS "Public favicon access" ON storage.objects;
CREATE POLICY "Public favicon access" ON storage.objects FOR SELECT USING (bucket_id = 'favicons');

DROP POLICY IF EXISTS "Service role favicon upload" ON storage.objects;
CREATE POLICY "Service role favicon upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'favicons');

-- Wallpapers
DROP POLICY IF EXISTS "Public wallpaper access" ON storage.objects;
CREATE POLICY "Public wallpaper access" ON storage.objects FOR SELECT USING (bucket_id = 'wallpapers');

DROP POLICY IF EXISTS "Service role wallpaper upload" ON storage.objects;
CREATE POLICY "Service role wallpaper upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'wallpapers');

-- ==============================================================================
-- 6. Admin System Tables (管理员系统表)
-- ==============================================================================

-- 6.1 User Bans (用户禁用表)
CREATE TABLE IF NOT EXISTS user_bans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  banned_by UUID REFERENCES auth.users(id),
  reason TEXT,
  banned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE user_bans ENABLE ROW LEVEL SECURITY;

-- 6.2 Announcements (公告表)
CREATE TABLE IF NOT EXISTS announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'update', 'maintenance')),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- 6.3 Default Websites (默认网站卡片)
CREATE TABLE IF NOT EXISTS default_websites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  favicon TEXT,
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE default_websites ENABLE ROW LEVEL SECURITY;

-- 6.4 Analytics Daily (每日统计聚合)
CREATE TABLE IF NOT EXISTS analytics_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  total_searches INTEGER DEFAULT 0,
  total_site_visits INTEGER DEFAULT 0,
  avg_cards_per_user NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;

-- 7. Admin Helper Function (管理员辅助函数)
-- ==============================================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Admin RLS Policies (管理员安全策略)
-- ==============================================================================

-- user_bans: Only admins can manage
DROP POLICY IF EXISTS "Admins can manage bans" ON user_bans;
CREATE POLICY "Admins can manage bans" ON user_bans FOR ALL USING (is_admin());

-- announcements: Anyone can read active, admins can manage
DROP POLICY IF EXISTS "Anyone can read active announcements" ON announcements;
CREATE POLICY "Anyone can read active announcements" ON announcements
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;
CREATE POLICY "Admins can manage announcements" ON announcements FOR ALL USING (is_admin());

-- default_websites: Anyone can read active, admins can manage
DROP POLICY IF EXISTS "Anyone can read default websites" ON default_websites;
CREATE POLICY "Anyone can read default websites" ON default_websites FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage default websites" ON default_websites;
CREATE POLICY "Admins can manage default websites" ON default_websites FOR ALL USING (is_admin());

-- analytics_daily: Only admins can read
DROP POLICY IF EXISTS "Admins can read analytics" ON analytics_daily;
CREATE POLICY "Admins can read analytics" ON analytics_daily FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "System can insert analytics" ON analytics_daily;
CREATE POLICY "System can insert analytics" ON analytics_daily FOR INSERT WITH CHECK (true);

-- Admin can read all user profiles (basic info only)
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;
CREATE POLICY "Admins can read all profiles" ON user_profiles FOR SELECT USING (auth.uid() = id OR is_admin());

-- Admin can read all user stats
DROP POLICY IF EXISTS "Admins can read all stats" ON user_stats;
CREATE POLICY "Admins can read all stats" ON user_stats FOR SELECT USING (auth.uid() = id OR is_admin());

-- 9. Aggregate Stats Function (统计聚合函数)
-- ==============================================================================

CREATE OR REPLACE FUNCTION aggregate_daily_stats()
RETURNS void AS $$
BEGIN
  INSERT INTO analytics_daily (date, total_users, new_users, active_users, total_searches, total_site_visits)
  SELECT 
    CURRENT_DATE,
    (SELECT COUNT(*) FROM user_profiles),
    (SELECT COUNT(*) FROM user_profiles WHERE created_at::date = CURRENT_DATE),
    (SELECT COUNT(*) FROM user_stats WHERE 
      (last_active_at IS NOT NULL AND last_active_at::date = CURRENT_DATE)
      OR (last_active_at IS NULL AND last_visit_date = CURRENT_DATE)
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

-- ==============================================================================
-- 10. Admin Enhancement Tables (管理增强表)
-- ==============================================================================

-- 10.1 Admin Logs (管理员操作日志表)
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('ban_user', 'unban_user', 'create_announcement', 'update_announcement', 'delete_announcement', 'toggle_announcement', 'other')),
  target_id UUID,
  target_type TEXT CHECK (target_type IN ('user', 'announcement', 'system', 'other')),
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action_type ON admin_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);

-- 10.2 Search Logs (搜索日志表 - 用于热门搜索分析)
CREATE TABLE IF NOT EXISTS search_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  keyword TEXT NOT NULL,
  search_engine TEXT DEFAULT 'google',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_search_logs_keyword ON search_logs(keyword);
CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at DESC);

-- 11. Admin Enhancement RLS Policies (管理增强安全策略)
-- ==============================================================================

DROP POLICY IF EXISTS "Admins can read logs" ON admin_logs;
CREATE POLICY "Admins can read logs" ON admin_logs
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert logs" ON admin_logs;
CREATE POLICY "Admins can insert logs" ON admin_logs
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Users can insert own search logs" ON search_logs;
CREATE POLICY "Users can insert own search logs" ON search_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read search logs" ON search_logs;
CREATE POLICY "Admins can read search logs" ON search_logs
  FOR SELECT USING (is_admin());

-- 12. Admin Analytics Functions (管理分析函数)
-- ==============================================================================

-- 获取热门搜索词
CREATE OR REPLACE FUNCTION get_popular_searches(p_limit INTEGER DEFAULT 10, p_days INTEGER DEFAULT 7)
RETURNS TABLE (keyword TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT sl.keyword, COUNT(*) as count
  FROM search_logs sl
  WHERE sl.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY sl.keyword
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取小时活跃分布
CREATE OR REPLACE FUNCTION get_hourly_activity(p_days INTEGER DEFAULT 7)
RETURNS TABLE (hour INTEGER, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT EXTRACT(HOUR FROM last_active_at)::INTEGER as hour, COUNT(*) as count
  FROM user_stats
  WHERE last_active_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY hour
  ORDER BY hour;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- Deployment Complete! 部署完成!
-- 
-- 包含:
-- - 用户表: user_profiles, user_settings, user_websites, user_stats
-- - 管理表: user_bans, announcements, default_websites, analytics_daily
-- - 日志表: admin_logs, search_logs
-- - 存储桶: favicons, wallpapers
-- - 函数: is_admin(), aggregate_daily_stats(), get_popular_searches(), get_hourly_activity()
-- ==============================================================================

-- ==============================================================================
-- 13. Notion OAuth Token Storage (Notion OAuth 令牌存储)
-- ==============================================================================

-- 存储用户的 Notion OAuth access token，用于持久化访问 Notion API
CREATE TABLE IF NOT EXISTS user_notion_tokens (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  access_token TEXT NOT NULL,  -- OAuth access token
  refresh_token TEXT,          -- OAuth refresh token (用于刷新 access_token)
  expires_at TIMESTAMP WITH TIME ZONE,  -- access_token 过期时间
  workspace_id TEXT,           -- Notion workspace ID
  workspace_name TEXT,         -- Notion workspace name
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 添加 refresh_token 和 expires_at 字段（如果表已存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'user_notion_tokens' AND column_name = 'refresh_token') THEN
    ALTER TABLE user_notion_tokens ADD COLUMN refresh_token TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'user_notion_tokens' AND column_name = 'expires_at') THEN
    ALTER TABLE user_notion_tokens ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

ALTER TABLE user_notion_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies - 用户只能访问自己的 token
DROP POLICY IF EXISTS "Users can read own notion token" ON user_notion_tokens;
CREATE POLICY "Users can read own notion token" ON user_notion_tokens 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notion token" ON user_notion_tokens;
CREATE POLICY "Users can insert own notion token" ON user_notion_tokens 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notion token" ON user_notion_tokens;
CREATE POLICY "Users can update own notion token" ON user_notion_tokens 
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notion token" ON user_notion_tokens;
CREATE POLICY "Users can delete own notion token" ON user_notion_tokens 
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_user_notion_tokens_updated_at ON user_notion_tokens;
CREATE TRIGGER update_user_notion_tokens_updated_at BEFORE UPDATE ON user_notion_tokens 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 部署完成! 新增表: user_notion_tokens
-- ==============================================================================

