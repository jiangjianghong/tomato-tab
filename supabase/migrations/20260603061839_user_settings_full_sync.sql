-- 给 user_settings 补齐前端全部持久化设置列 + 修正过时默认值
-- 纯增量：ADD COLUMN IF NOT EXISTS，不改存量行；RLS 为行级策略，新列自动覆盖

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS date_display_mode TEXT DEFAULT 'yearMonthDay';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS animation_style TEXT DEFAULT 'simple';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS work_countdown_enabled BOOLEAN DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS lunch_time TEXT DEFAULT '12:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS off_work_time TEXT DEFAULT '18:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_icon_display_mode TEXT DEFAULT 'circular';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS atmosphere_mode TEXT DEFAULT 'auto';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS atmosphere_particle_count INTEGER DEFAULT 60;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS atmosphere_wind_enabled BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dark_overlay_enabled BOOLEAN DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dark_overlay_mode TEXT DEFAULT 'smart';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dark_mode_preference TEXT DEFAULT 'system';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dark_mode_schedule_start TEXT DEFAULT '22:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dark_mode_schedule_end TEXT DEFAULT '06:00';

-- 修正过时默认（仅改默认，不动存量行）
ALTER TABLE user_settings ALTER COLUMN card_opacity SET DEFAULT 0.1;
ALTER TABLE user_settings ALTER COLUMN search_bar_opacity SET DEFAULT 0.1;
ALTER TABLE user_settings ALTER COLUMN wallpaper_resolution SET DEFAULT '1080p';
ALTER TABLE user_settings ALTER COLUMN theme SET DEFAULT 'light';
