# 用户设置云端同步补全 — 设计文档

- 日期：2026-06-03
- 状态：已确认，待转实现计划
- 范围：让 `TransparencyContext` 里所有持久化设置项与云端 `user_settings` 完全对齐

## 1. 背景与问题

应用的设置真正存储在 `src/contexts/TransparencyContext.tsx`（共 32 项持久化到 localStorage）。云端同步走 `src/lib/supabaseSync.ts` 的 `UserSettings` 接口 + `user_settings` 表。审计发现两类问题：

### 问题一：14 项设置完全没纳入云端同步
以下设置在设置界面可改、已持久化到 localStorage，但 `UserSettings` 接口、同步构造点、DB 表里都没有，换设备后丢失：

`darkModePreference`、`darkModeScheduleStart`、`darkModeScheduleEnd`、`atmosphereMode`、`atmosphereParticleCount`、`atmosphereWindEnabled`、`darkOverlayEnabled`、`darkOverlayMode`、`aiIconDisplayMode`、`workCountdownEnabled`、`lunchTime`、`offWorkTime`、`dateDisplayMode`、`animationStyle`。

其中 `darkModePreference` 是当前真正控制深色模式的开关；同步里还在传一个遗留的 `theme` 字段（已基本不起作用）。

### 问题二：2 项「看似同步、实则被静默重置成默认值」
`searchInNewTab` 和 `searchBarBorderRadius` 在接口和 DB 列里都有，但 `saveUserSettings` 会先经过 `sanitizeUserSettings()`（`dataValidator.ts`），而该清洗函数的返回对象**漏掉了这两个字段**。于是：

```ts
search_in_new_tab:        validatedSettings.searchInNewTab        ?? true,  // 永远 true
search_bar_border_radius: validatedSettings.searchBarBorderRadius ?? 12,    // 永远 12
```

用户关掉「新标签页打开」或调整圆角后，上云被写死成默认值，多设备同步丢失/被改坏。

### 次要问题
- DB 列默认值过时：`wallpaper_resolution DEFAULT 'high'`（非法值）、`card_opacity 0.8`、`search_bar_opacity 0.9`、`theme 'dark'`，与应用默认不符。因 upsert 每次带显式值，平时不触发，属隐患。
- 本地导出/导入（`useSettingsManager.ts`）同样缺失上述大部分项。

## 2. 决策

- **同步范围**：全部对齐 —— 14 项缺失全部纳入同步 + 修复被重置的 2 项。
- **迁移落地**：创建 `supabase/migrations/` 迁移文件，用已认证的 supabase CLI `db push` 应用到线上库。加列一律 `ADD COLUMN IF NOT EXISTS`，纯增量、不破坏存量数据。
- **实现风格**：方案 A —— 沿用现有「显式字段列表」模式，在各处映射补字段，不引入字段描述表框架（YAGNI，降低回归面）。
- **`theme` 旧字段**：保持现状继续同步（无害遗留），真正的深色控制 `darkModePreference` 本次纳入同步。

## 3. 字段映射表（权威清单）

### 3.1 新增 14 列

| camelCase | snake_case | TS 类型 | DB 类型 / 默认 | sanitize 校验 |
|---|---|---|---|---|
| `dateDisplayMode` | `date_display_mode` | `'yearMonth' \| 'yearMonthDay'` | TEXT `'yearMonthDay'` | 枚举内否则默认 |
| `animationStyle` | `animation_style` | `'dynamic' \| 'simple'` | TEXT `'simple'` | 枚举内否则默认 |
| `workCountdownEnabled` | `work_countdown_enabled` | `boolean` | BOOLEAN `false` | typeof boolean 否则 false |
| `lunchTime` | `lunch_time` | `string` | TEXT `'12:00'` | `HH:mm` 正则否则默认 |
| `offWorkTime` | `off_work_time` | `string` | TEXT `'18:00'` | `HH:mm` 正则否则默认 |
| `aiIconDisplayMode` | `ai_icon_display_mode` | `'circular' \| 'dropdown'` | TEXT `'circular'` | 枚举内否则默认 |
| `atmosphereMode` | `atmosphere_mode` | `'auto'\|'snow'\|'leaf'\|'cherry'\|'firefly'\|'off'` | TEXT `'auto'` | 枚举内否则默认 |
| `atmosphereParticleCount` | `atmosphere_particle_count` | `number` | INTEGER `60` | clamp 1–200 否则 60 |
| `atmosphereWindEnabled` | `atmosphere_wind_enabled` | `boolean` | BOOLEAN `true` | typeof boolean 否则 true |
| `darkOverlayEnabled` | `dark_overlay_enabled` | `boolean` | BOOLEAN `false` | typeof boolean 否则 false |
| `darkOverlayMode` | `dark_overlay_mode` | `'off'\|'always'\|'smart'` | TEXT `'smart'` | 枚举内否则默认 |
| `darkModePreference` | `dark_mode_preference` | `'system'\|'on'\|'off'\|'scheduled'` | TEXT `'system'` | 枚举内否则默认 |
| `darkModeScheduleStart` | `dark_mode_schedule_start` | `string` | TEXT `'22:00'` | `HH:mm` 正则否则默认 |
| `darkModeScheduleEnd` | `dark_mode_schedule_end` | `string` | TEXT `'06:00'` | `HH:mm` 正则否则默认 |

### 3.2 修复回归的 2 字段（重新纳入 `sanitizeUserSettings` 返回值）

| camelCase | snake_case | 默认 | sanitize 校验 |
|---|---|---|---|
| `searchInNewTab` | `search_in_new_tab` | `true` | typeof boolean 否则 true |
| `searchBarBorderRadius` | `search_bar_border_radius` | `12` | clamp 0–50 否则 12 |

`HH:mm` 正则统一用：`/^([01]\d|2[0-3]):[0-5]\d$/`。

## 4. 改动文件与要点

### 4.1 `supabase/migrations/<timestamp>_user_settings_full_sync.sql`（新建）
- 14 条 `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ...`，默认值见 3.1。
- 修正过时默认：`ALTER COLUMN ... SET DEFAULT`——`card_opacity 0.1`、`search_bar_opacity 0.1`、`wallpaper_resolution '1080p'`、`theme 'light'`（仅改默认，不动存量行）。
- 不触碰 RLS：现有策略是行级 `auth.uid() = id`，对新列自动生效，无需新增列级策略。

### 4.2 `supabase_deploy.sql`
- 在 `user_settings` 建表语句补齐 14 列，并把上述 4 个过时默认改正，保持「全量 schema 之源」与迁移一致。

### 4.3 `src/lib/supabaseSync.ts`
- `UserSettings` 接口新增 14 字段（精确联合类型）。
- `saveUserSettings` 的 `fullData` 新增 14 个 snake_case 字段，取自 `validatedSettings`。
- `getUserSettings` 把 14 个新列映射回 camelCase，带默认值（沿用「列暂缺时回退默认、不报错」的现有风格）。
- `basicData` 回退块保持不变（仅列缺失时触发；迁移后不再触发）。

### 4.4 `src/lib/dataValidator.ts` —— 根因修复
- `sanitizeUserSettings` 返回对象：**补回 `searchInNewTab`、`searchBarBorderRadius`**，并新增 14 字段，按 3.1/3.2 的校验规则做兜底/clamp。

### 4.5 `src/pages/Settings.tsx`
- 确认从 `useTransparency()` 解构了 14 项的值与 `set*`（缺的补上）。
- `handleUploadToCloud`：构造的 `settings` 对象补 14 字段。
- `handleDownloadFromCloud`：补 14 个 `setXxx(cloudSettings.xxx ?? 默认)`。

### 4.6 `src/hooks/useAutoSync.ts`
- 从 `useTransparency()` 解构 14 个新值。
- 构造的 `settings` 对象补 14 字段。
- **同时把 14 字段加入变更指纹**（`performSync` 内成功回调处 + 独立 useEffect 处两份 fingerprint），并补全相关 `useCallback`/`useEffect` 依赖数组——否则仅改这些设置时自动同步不会触发。

### 4.7 `src/hooks/useSettingsManager.ts`（导出/导入补全）
- `SettingsData` 接口、`exportSettings`、`validateSettings`、`importSettings` 补上现缺的 12 项（已有 `dateDisplayMode`/`animationStyle`），使本地配置文件导出/导入也完整。

## 5. 验证

- 自动化：`npx tsc --noEmit` 全绿；`pnpm lint` 零警告。
- 手动回环：A 设备改全部新设置 → 上传到云端 → B 设备（或清空 localStorage 后）下载 → 逐项核对一致。
- 重点回归：`searchInNewTab=false`、自定义圆角值能正确往返不被重置。

## 6. 风险与回滚

- 迁移为纯增量（`IF NOT EXISTS` + `SET DEFAULT`），不改存量行，低风险。
- 代码前后兼容：列缺失时 `saveUserSettings` 走 `basicData` 回退、`getUserSettings` 用默认值，不会崩。推荐顺序：**先 push 迁移 → 校验列存在 → 再合并/部署代码**。
- 回滚：代码可独立回退；新列留存无副作用（旧代码不读写即可）。

## 7. 明确不做（范围边界）

- 不引入字段描述表/同步框架重构（方案 B）。
- 不改 `theme` 的现有语义（保留遗留同步）。
- 不动 `wallpaperResolution` 是否应按设备区分的既有行为。
- 不为缺失的测试基建引入测试运行器（本仓库无 vitest/jest）。
