# 用户设置云端同步补全 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐个实现。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 让 `TransparencyContext` 里全部持久化设置项与云端 `user_settings` 完全对齐，并修复 `searchInNewTab` / `searchBarBorderRadius` 被静默重置的回归。

**Architecture:** 沿用现有「显式字段列表」模式（方案 A）：DB 加 14 列 → `sanitizeUserSettings` 修回 2 项并加 14 项 → `UserSettings` 接口 + save/get 映射 → 两个构造点（Settings 手动上传/下载、useAutoSync 自动同步含指纹）→ 本地导出/导入补全。

**Tech Stack:** TypeScript / React 18 / Supabase（Postgres + supabase CLI）/ Vite。**本仓库无测试运行器**（spec §7），故每个任务验证门为 `npx tsc --noEmit` + `pnpm lint`，行为正确性在 Task 8 用真机回环统一验证。

**对应设计文档:** `docs/superpowers/specs/2026-06-03-user-settings-full-sync-design.md`

**约定:**
- 文档（本计划 + spec）按用户标准约定**不提交**到 public 仓库。
- 代码改动在分支 `fix/user-settings-full-sync` 上提交；推远端 / 开 PR 需用户另行确认。
- 提交信息结尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

## 字段清单（贯穿所有任务，命名以此为准）

14 个新增 + 2 个修复，camelCase ↔ snake_case ↔ 默认值：

| camelCase | snake_case | 默认 |
|---|---|---|
| `dateDisplayMode` | `date_display_mode` | `'yearMonthDay'` |
| `animationStyle` | `animation_style` | `'simple'` |
| `workCountdownEnabled` | `work_countdown_enabled` | `false` |
| `lunchTime` | `lunch_time` | `'12:00'` |
| `offWorkTime` | `off_work_time` | `'18:00'` |
| `aiIconDisplayMode` | `ai_icon_display_mode` | `'circular'` |
| `atmosphereMode` | `atmosphere_mode` | `'auto'` |
| `atmosphereParticleCount` | `atmosphere_particle_count` | `60` |
| `atmosphereWindEnabled` | `atmosphere_wind_enabled` | `true` |
| `darkOverlayEnabled` | `dark_overlay_enabled` | `false` |
| `darkOverlayMode` | `dark_overlay_mode` | `'smart'` |
| `darkModePreference` | `dark_mode_preference` | `'system'` |
| `darkModeScheduleStart` | `dark_mode_schedule_start` | `'22:00'` |
| `darkModeScheduleEnd` | `dark_mode_schedule_end` | `'06:00'` |
| `searchInNewTab`（修复） | `search_in_new_tab` | `true` |
| `searchBarBorderRadius`（修复） | `search_bar_border_radius` | `12`（clamp 0–50） |

---

## Task 0: 建分支

**Files:** 无（git）

- [ ] **Step 1: 从最新 main 建分支**

```bash
cd "C:/Users/19404/Desktop/Projects/tomato-tab"
git checkout main
git pull --rebase origin main
git checkout -b fix/user-settings-full-sync
```

- [ ] **Step 2: 确认干净工作区**

Run: `git status`
Expected: `On branch fix/user-settings-full-sync` + `nothing to commit, working tree clean`（spec/plan 文档为未跟踪，可忽略）

---

## Task 1: 数据库迁移（加 14 列 + 修正过时默认）+ push 到线上

**Files:**
- Create: `supabase/migrations/<生成时间戳>_user_settings_full_sync.sql`
- Modify: `supabase_deploy.sql`（user_settings 建表块，约 23-54 行）

- [ ] **Step 1: 生成迁移文件**

```bash
supabase migration new user_settings_full_sync
```
Expected: 输出形如 `Created new migration at supabase/migrations/<ts>_user_settings_full_sync.sql`

- [ ] **Step 2: 写入迁移 SQL**

把以下内容写入上一步生成的文件：

```sql
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
```

- [ ] **Step 3: 同步更新 `supabase_deploy.sql`（保持 schema 之源一致）**

在 `supabase_deploy.sql` 的 `user_settings` 建表语句里：把 `search_bar_border_radius INTEGER DEFAULT 12,` 那行（约 49 行）之后、`-- Meta` 之前，插入：

```sql
  -- Extended Appearance / Behavior (full-sync)
  date_display_mode TEXT DEFAULT 'yearMonthDay',
  animation_style TEXT DEFAULT 'simple',
  work_countdown_enabled BOOLEAN DEFAULT false,
  lunch_time TEXT DEFAULT '12:00',
  off_work_time TEXT DEFAULT '18:00',
  ai_icon_display_mode TEXT DEFAULT 'circular',
  atmosphere_mode TEXT DEFAULT 'auto',
  atmosphere_particle_count INTEGER DEFAULT 60,
  atmosphere_wind_enabled BOOLEAN DEFAULT true,
  dark_overlay_enabled BOOLEAN DEFAULT false,
  dark_overlay_mode TEXT DEFAULT 'smart',
  dark_mode_preference TEXT DEFAULT 'system',
  dark_mode_schedule_start TEXT DEFAULT '22:00',
  dark_mode_schedule_end TEXT DEFAULT '06:00',
```

并把同一建表块里的 4 个过时默认改正：
- `card_opacity NUMERIC DEFAULT 0.8,` → `card_opacity NUMERIC DEFAULT 0.1,`
- `search_bar_opacity NUMERIC DEFAULT 0.9,` → `search_bar_opacity NUMERIC DEFAULT 0.1,`
- `wallpaper_resolution TEXT DEFAULT 'high',` → `wallpaper_resolution TEXT DEFAULT '1080p',`
- `theme TEXT DEFAULT 'dark',` → `theme TEXT DEFAULT 'light',`

- [ ] **Step 4: push 到线上库（生产操作，已获用户授权）**

```bash
supabase db push
```
Expected: 输出列出 `<ts>_user_settings_full_sync.sql` 被 applied，结尾 `Finished supabase db push.`

- [ ] **Step 5: 校验列已存在**

```bash
supabase db push
```
Expected: `Remote database is up to date.`（无待应用迁移，即上一步已成功落库）

- [ ] **Step 6: 提交**

```bash
git add supabase/migrations supabase_deploy.sql
git commit -m "$(cat <<'EOF'
feat(db): user_settings 补齐 14 个设置列并修正过时默认

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 修复 `sanitizeUserSettings` 回归（修回 searchInNewTab / searchBarBorderRadius）

这是问题二的根因点，独立可上线，最高优先。

**Files:**
- Modify: `src/lib/dataValidator.ts`（`sanitizeUserSettings`，约 126-167 行）

- [ ] **Step 1: 在 sanitize 返回对象补回两字段**

在 `dataValidator.ts` 里，把 `sanitizeUserSettings` 返回对象末尾的

```ts
    lastSync: typeof settings.lastSync === 'string' ? settings.lastSync : new Date().toISOString(),
  };
```

改为（在 `lastSync` 之前插入两项）：

```ts
    searchInNewTab:
      typeof settings.searchInNewTab === 'boolean' ? settings.searchInNewTab : true,
    searchBarBorderRadius:
      typeof settings.searchBarBorderRadius === 'number' &&
      settings.searchBarBorderRadius >= 0 &&
      settings.searchBarBorderRadius <= 50
        ? settings.searchBarBorderRadius
        : 12,
    lastSync: typeof settings.lastSync === 'string' ? settings.lastSync : new Date().toISOString(),
  };
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误退出（exit 0）

- [ ] **Step 3: 提交**

```bash
git add src/lib/dataValidator.ts
git commit -m "$(cat <<'EOF'
fix(sync): sanitizeUserSettings 修回 searchInNewTab/searchBarBorderRadius

此前清洗丢弃这两个字段，导致上云被写死为 true/12

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 扩展 `UserSettings` 接口 + `sanitizeUserSettings` 加 14 字段

**Files:**
- Modify: `src/lib/supabaseSync.ts`（`UserSettings` 接口，约 17-38 行）
- Modify: `src/lib/dataValidator.ts`（顶部加 helper + sanitize 返回对象）

- [ ] **Step 1: 接口加 14 个可选字段**

在 `supabaseSync.ts` 的 `UserSettings` 接口里，把

```ts
  searchBarBorderRadius?: number; // 搜索框圆角大小（可选，向后兼容）
  lastSync: string;
}
```

改为：

```ts
  searchBarBorderRadius?: number; // 搜索框圆角大小（可选，向后兼容）
  dateDisplayMode?: 'yearMonth' | 'yearMonthDay';
  animationStyle?: 'dynamic' | 'simple';
  workCountdownEnabled?: boolean;
  lunchTime?: string; // HH:mm
  offWorkTime?: string; // HH:mm
  aiIconDisplayMode?: 'circular' | 'dropdown';
  atmosphereMode?: 'auto' | 'snow' | 'leaf' | 'cherry' | 'firefly' | 'off';
  atmosphereParticleCount?: number;
  atmosphereWindEnabled?: boolean;
  darkOverlayEnabled?: boolean;
  darkOverlayMode?: 'off' | 'always' | 'smart';
  darkModePreference?: 'system' | 'on' | 'off' | 'scheduled';
  darkModeScheduleStart?: string; // HH:mm
  darkModeScheduleEnd?: string; // HH:mm
  lastSync: string;
}
```

- [ ] **Step 2: dataValidator 顶部加两个 helper**

在 `dataValidator.ts` 顶部的 import 之后、`validateWebsiteData` 之前插入：

```ts
// HH:mm 时间串校验（00:00–23:59）
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const sanitizeTime = (v: any, fallback: string): string =>
  typeof v === 'string' && TIME_RE.test(v) ? v : fallback;

// 枚举值校验，非法回落默认
const sanitizeEnum = <T extends string>(v: any, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
```

- [ ] **Step 3: sanitize 返回对象加 14 字段**

在 `sanitizeUserSettings` 返回对象里、Task 2 插入的 `searchInNewTab` 之前（或紧接其后、`lastSync` 之前均可），插入：

```ts
    dateDisplayMode: sanitizeEnum(
      settings.dateDisplayMode,
      ['yearMonth', 'yearMonthDay'] as const,
      'yearMonthDay'
    ),
    animationStyle: sanitizeEnum(settings.animationStyle, ['dynamic', 'simple'] as const, 'simple'),
    workCountdownEnabled:
      typeof settings.workCountdownEnabled === 'boolean' ? settings.workCountdownEnabled : false,
    lunchTime: sanitizeTime(settings.lunchTime, '12:00'),
    offWorkTime: sanitizeTime(settings.offWorkTime, '18:00'),
    aiIconDisplayMode: sanitizeEnum(
      settings.aiIconDisplayMode,
      ['circular', 'dropdown'] as const,
      'circular'
    ),
    atmosphereMode: sanitizeEnum(
      settings.atmosphereMode,
      ['auto', 'snow', 'leaf', 'cherry', 'firefly', 'off'] as const,
      'auto'
    ),
    atmosphereParticleCount:
      typeof settings.atmosphereParticleCount === 'number' &&
      isFinite(settings.atmosphereParticleCount)
        ? Math.min(200, Math.max(1, Math.floor(settings.atmosphereParticleCount)))
        : 60,
    atmosphereWindEnabled:
      typeof settings.atmosphereWindEnabled === 'boolean' ? settings.atmosphereWindEnabled : true,
    darkOverlayEnabled:
      typeof settings.darkOverlayEnabled === 'boolean' ? settings.darkOverlayEnabled : false,
    darkOverlayMode: sanitizeEnum(
      settings.darkOverlayMode,
      ['off', 'always', 'smart'] as const,
      'smart'
    ),
    darkModePreference: sanitizeEnum(
      settings.darkModePreference,
      ['system', 'on', 'off', 'scheduled'] as const,
      'system'
    ),
    darkModeScheduleStart: sanitizeTime(settings.darkModeScheduleStart, '22:00'),
    darkModeScheduleEnd: sanitizeTime(settings.darkModeScheduleEnd, '06:00'),
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0，无错误

- [ ] **Step 5: 提交**

```bash
git add src/lib/supabaseSync.ts src/lib/dataValidator.ts
git commit -m "$(cat <<'EOF'
feat(sync): UserSettings 接口与 sanitize 扩展 14 个设置字段

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `saveUserSettings` / `getUserSettings` 映射 14 字段

**Files:**
- Modify: `src/lib/supabaseSync.ts`（`saveUserSettings` 的 `fullData`，约 114-136 行；`getUserSettings` 返回对象，约 199-227 行）

- [ ] **Step 1: saveUserSettings 的 fullData 加 14 字段**

在 `fullData` 里，把

```ts
        search_bar_border_radius: validatedSettings.searchBarBorderRadius ?? 12,
        last_sync: new Date().toISOString(),
      };
```

改为：

```ts
        search_bar_border_radius: validatedSettings.searchBarBorderRadius ?? 12,
        date_display_mode: validatedSettings.dateDisplayMode ?? 'yearMonthDay',
        animation_style: validatedSettings.animationStyle ?? 'simple',
        work_countdown_enabled: validatedSettings.workCountdownEnabled ?? false,
        lunch_time: validatedSettings.lunchTime ?? '12:00',
        off_work_time: validatedSettings.offWorkTime ?? '18:00',
        ai_icon_display_mode: validatedSettings.aiIconDisplayMode ?? 'circular',
        atmosphere_mode: validatedSettings.atmosphereMode ?? 'auto',
        atmosphere_particle_count: validatedSettings.atmosphereParticleCount ?? 60,
        atmosphere_wind_enabled: validatedSettings.atmosphereWindEnabled ?? true,
        dark_overlay_enabled: validatedSettings.darkOverlayEnabled ?? false,
        dark_overlay_mode: validatedSettings.darkOverlayMode ?? 'smart',
        dark_mode_preference: validatedSettings.darkModePreference ?? 'system',
        dark_mode_schedule_start: validatedSettings.darkModeScheduleStart ?? '22:00',
        dark_mode_schedule_end: validatedSettings.darkModeScheduleEnd ?? '06:00',
        last_sync: new Date().toISOString(),
      };
```

- [ ] **Step 2: getUserSettings 返回对象加 14 字段**

在 `getUserSettings` 的 `return { ... }` 里，把

```ts
        searchBarBorderRadius: data.search_bar_border_radius !== undefined ? data.search_bar_border_radius : 12,
        lastSync: data.last_sync,
      };
```

改为：

```ts
        searchBarBorderRadius: data.search_bar_border_radius !== undefined ? data.search_bar_border_radius : 12,
        dateDisplayMode: data.date_display_mode ?? 'yearMonthDay',
        animationStyle: data.animation_style ?? 'simple',
        workCountdownEnabled:
          data.work_countdown_enabled !== undefined ? data.work_countdown_enabled : false,
        lunchTime: data.lunch_time ?? '12:00',
        offWorkTime: data.off_work_time ?? '18:00',
        aiIconDisplayMode: data.ai_icon_display_mode ?? 'circular',
        atmosphereMode: data.atmosphere_mode ?? 'auto',
        atmosphereParticleCount:
          typeof data.atmosphere_particle_count === 'number' ? data.atmosphere_particle_count : 60,
        atmosphereWindEnabled:
          data.atmosphere_wind_enabled !== undefined ? data.atmosphere_wind_enabled : true,
        darkOverlayEnabled:
          data.dark_overlay_enabled !== undefined ? data.dark_overlay_enabled : false,
        darkOverlayMode: data.dark_overlay_mode ?? 'smart',
        darkModePreference: data.dark_mode_preference ?? 'system',
        darkModeScheduleStart: data.dark_mode_schedule_start ?? '22:00',
        darkModeScheduleEnd: data.dark_mode_schedule_end ?? '06:00',
        lastSync: data.last_sync,
      };
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: 提交**

```bash
git add src/lib/supabaseSync.ts
git commit -m "$(cat <<'EOF'
feat(sync): save/get 读写 14 个新设置列

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `Settings.tsx` 手动上传/下载补 14 字段

**Files:**
- Modify: `src/pages/Settings.tsx`（`useTransparency()` 解构 约 231-239 行；`handleUploadToCloud` 约 684-705 行；`handleDownloadFromCloud` 约 740-761 行）

- [ ] **Step 1: 解构补 dateDisplayMode/darkOverlayEnabled 的值与 setter**

`Settings.tsx` 已解构了其余 12 项的值与 setter，仅缺这两项。把解构块里的

```ts
    darkOverlayMode,
    setDarkOverlayMode,
```

改为：

```ts
    dateDisplayMode,
    setDateDisplayMode,
    darkOverlayEnabled,
    setDarkOverlayEnabled,
    darkOverlayMode,
    setDarkOverlayMode,
```

- [ ] **Step 2: handleUploadToCloud 的 settings 对象加 14 字段**

把（约 703-705 行）

```ts
        searchBarBorderRadius,
        lastSync: new Date().toISOString(),
      };
```

改为：

```ts
        searchBarBorderRadius,
        dateDisplayMode,
        animationStyle,
        workCountdownEnabled,
        lunchTime,
        offWorkTime,
        aiIconDisplayMode,
        atmosphereMode,
        atmosphereParticleCount,
        atmosphereWindEnabled,
        darkOverlayEnabled,
        darkOverlayMode,
        darkModePreference,
        darkModeScheduleStart,
        darkModeScheduleEnd,
        lastSync: new Date().toISOString(),
      };
```

- [ ] **Step 3: handleDownloadFromCloud 应用 14 字段**

把（约 759-761 行）

```ts
        setSearchBarBorderRadius(cloudSettings.searchBarBorderRadius ?? 12);

        localStorage.setItem('theme', cloudSettings.theme || 'light');
```

改为：

```ts
        setSearchBarBorderRadius(cloudSettings.searchBarBorderRadius ?? 12);
        setDateDisplayMode(cloudSettings.dateDisplayMode ?? 'yearMonthDay');
        setAnimationStyle(cloudSettings.animationStyle ?? 'simple');
        setWorkCountdownEnabled(cloudSettings.workCountdownEnabled ?? false);
        setLunchTime(cloudSettings.lunchTime ?? '12:00');
        setOffWorkTime(cloudSettings.offWorkTime ?? '18:00');
        setAiIconDisplayMode(cloudSettings.aiIconDisplayMode ?? 'circular');
        setAtmosphereMode(cloudSettings.atmosphereMode ?? 'auto');
        setAtmosphereParticleCount(cloudSettings.atmosphereParticleCount ?? 60);
        setAtmosphereWindEnabled(cloudSettings.atmosphereWindEnabled ?? true);
        setDarkOverlayEnabled(cloudSettings.darkOverlayEnabled ?? false);
        setDarkOverlayMode(cloudSettings.darkOverlayMode ?? 'smart');
        setDarkModePreference(cloudSettings.darkModePreference ?? 'system');
        setDarkModeScheduleStart(cloudSettings.darkModeScheduleStart ?? '22:00');
        setDarkModeScheduleEnd(cloudSettings.darkModeScheduleEnd ?? '06:00');

        localStorage.setItem('theme', cloudSettings.theme || 'light');
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0（若报 `setDateDisplayMode`/`darkOverlayEnabled` 未使用或未定义，回查 Step 1 解构是否写对）

- [ ] **Step 5: 提交**

```bash
git add src/pages/Settings.tsx
git commit -m "$(cat <<'EOF'
feat(sync): Settings 手动上传/下载覆盖 14 个新设置

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `useAutoSync.ts` 自动同步对象 + 两处指纹 + 依赖数组

**Files:**
- Modify: `src/hooks/useAutoSync.ts`（解构 10-27；settings 对象 95-116；成功回调指纹 142-160；effect 指纹 223-241；performSync deps 182-191；effect deps 295-316）

- [ ] **Step 1: 从 useTransparency 解构 14 个新值**

把（约 26-27 行）

```ts
    showDay,
  } = useTransparency();
```

改为：

```ts
    showDay,
    dateDisplayMode,
    animationStyle,
    workCountdownEnabled,
    lunchTime,
    offWorkTime,
    aiIconDisplayMode,
    atmosphereMode,
    atmosphereParticleCount,
    atmosphereWindEnabled,
    darkOverlayEnabled,
    darkOverlayMode,
    darkModePreference,
    darkModeScheduleStart,
    darkModeScheduleEnd,
  } = useTransparency();
```

- [ ] **Step 2: performSync 内 settings 对象加 14 字段**

把（约 113-115 行）

```ts
        showDay,
        lastSync: new Date().toISOString(),
      };
```

改为：

```ts
        showDay,
        dateDisplayMode,
        animationStyle,
        workCountdownEnabled,
        lunchTime,
        offWorkTime,
        aiIconDisplayMode,
        atmosphereMode,
        atmosphereParticleCount,
        atmosphereWindEnabled,
        darkOverlayEnabled,
        darkOverlayMode,
        darkModePreference,
        darkModeScheduleStart,
        darkModeScheduleEnd,
        lastSync: new Date().toISOString(),
      };
```

- [ ] **Step 3: 成功回调里的指纹 settings 加 14 字段**

在 `onSyncSuccess` 内的 `currentDataFingerprint`（约 142-160 行）的 `settings: { ... }` 里，把结尾

```ts
              showDay,
            },
          });
```

改为：

```ts
              showDay,
              dateDisplayMode,
              animationStyle,
              workCountdownEnabled,
              lunchTime,
              offWorkTime,
              aiIconDisplayMode,
              atmosphereMode,
              atmosphereParticleCount,
              atmosphereWindEnabled,
              darkOverlayEnabled,
              darkOverlayMode,
              darkModePreference,
              darkModeScheduleStart,
              darkModeScheduleEnd,
            },
          });
```

- [ ] **Step 4: effect 里的变更指纹 settings 加 14 字段**

在 useEffect 的 `currentDataFingerprint`（约 223-241 行）的 `settings: { ... }` 里，把结尾

```ts
        showDay,
      },
    });
```

改为：

```ts
        showDay,
        dateDisplayMode,
        animationStyle,
        workCountdownEnabled,
        lunchTime,
        offWorkTime,
        aiIconDisplayMode,
        atmosphereMode,
        atmosphereParticleCount,
        atmosphereWindEnabled,
        darkOverlayEnabled,
        darkOverlayMode,
        darkModePreference,
        darkModeScheduleStart,
        darkModeScheduleEnd,
      },
    });
```

- [ ] **Step 5: performSync 的 useCallback 依赖数组补 14 项**

把（约 182-191 行）

```ts
    [
      currentUser,
      websites,
      cardOpacity,
      searchBarOpacity,
      parallaxEnabled,
      wallpaperResolution,
      updateSyncStatus,
    ]
  );
```

改为：

```ts
    [
      currentUser,
      websites,
      cardOpacity,
      searchBarOpacity,
      parallaxEnabled,
      wallpaperResolution,
      autoSyncEnabled,
      autoSyncInterval,
      searchInNewTab,
      searchBarBorderRadius,
      autoSortEnabled,
      timeComponentEnabled,
      showFullDate,
      showSeconds,
      showWeekday,
      showYear,
      showMonth,
      showDay,
      dateDisplayMode,
      animationStyle,
      workCountdownEnabled,
      lunchTime,
      offWorkTime,
      aiIconDisplayMode,
      atmosphereMode,
      atmosphereParticleCount,
      atmosphereWindEnabled,
      darkOverlayEnabled,
      darkOverlayMode,
      darkModePreference,
      darkModeScheduleStart,
      darkModeScheduleEnd,
      updateSyncStatus,
    ]
  );
```

- [ ] **Step 6: effect 的依赖数组补 14 项**

把（约 295-316 行）effect 依赖数组里的

```ts
    showDay,
    performSync,
    dataInitialized,
  ]);
```

改为：

```ts
    showDay,
    dateDisplayMode,
    animationStyle,
    workCountdownEnabled,
    lunchTime,
    offWorkTime,
    aiIconDisplayMode,
    atmosphereMode,
    atmosphereParticleCount,
    atmosphereWindEnabled,
    darkOverlayEnabled,
    darkOverlayMode,
    darkModePreference,
    darkModeScheduleStart,
    darkModeScheduleEnd,
    performSync,
    dataInitialized,
  ]);
```

- [ ] **Step 7: 类型检查 + lint（重点查 hooks 依赖告警）**

Run: `npx tsc --noEmit`
Expected: exit 0

Run: `pnpm lint`
Expected: 0 warnings（`react-hooks/exhaustive-deps` 对 useAutoSync 不再报新增缺失依赖）

- [ ] **Step 8: 提交**

```bash
git add src/hooks/useAutoSync.ts
git commit -m "$(cat <<'EOF'
feat(sync): 自动同步纳入 14 个新设置（含变更指纹与依赖）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `useSettingsManager.ts` 导出/导入补全 12 项

`dateDisplayMode`、`animationStyle` 已有；补其余 12 项。

**Files:**
- Modify: `src/hooks/useSettingsManager.ts`（`SettingsData` 4-26；`exportSettings` 42-95；`validateSettings` 99-230；`importSettings` 233-454）

- [ ] **Step 1: SettingsData 接口加 12 字段**

把（约 25-26 行）

```ts
  searchBarBorderRadius: number;
  animationStyle: 'dynamic' | 'simple';
}
```

改为：

```ts
  searchBarBorderRadius: number;
  animationStyle: 'dynamic' | 'simple';
  workCountdownEnabled: boolean;
  lunchTime: string;
  offWorkTime: string;
  aiIconDisplayMode: 'circular' | 'dropdown';
  atmosphereMode: 'auto' | 'snow' | 'leaf' | 'cherry' | 'firefly' | 'off';
  atmosphereParticleCount: number;
  atmosphereWindEnabled: boolean;
  darkOverlayEnabled: boolean;
  darkOverlayMode: 'off' | 'always' | 'smart';
  darkModePreference: 'system' | 'on' | 'off' | 'scheduled';
  darkModeScheduleStart: string;
  darkModeScheduleEnd: string;
}
```

- [ ] **Step 2: exportSettings 正常返回块加 12 字段**

把 `exportSettings` try 块里（约 66-69 行）

```ts
        animationStyle: (localStorage.getItem('animationStyle') || 'simple') as
          | 'dynamic'
          | 'simple',
      };
```

改为：

```ts
        animationStyle: (localStorage.getItem('animationStyle') || 'simple') as
          | 'dynamic'
          | 'simple',
        workCountdownEnabled: localStorage.getItem('workCountdownEnabled') === 'true',
        lunchTime: localStorage.getItem('lunchTime') || '12:00',
        offWorkTime: localStorage.getItem('offWorkTime') || '18:00',
        aiIconDisplayMode: (localStorage.getItem('aiIconDisplayMode') || 'circular') as
          | 'circular'
          | 'dropdown',
        atmosphereMode: (localStorage.getItem('atmosphereMode') || 'auto') as
          | 'auto'
          | 'snow'
          | 'leaf'
          | 'cherry'
          | 'firefly'
          | 'off',
        atmosphereParticleCount: parseInt(localStorage.getItem('atmosphereParticleCount') || '60'),
        atmosphereWindEnabled: localStorage.getItem('atmosphereWindEnabled') !== 'false',
        darkOverlayEnabled: localStorage.getItem('darkOverlayEnabled') === 'true',
        darkOverlayMode: (localStorage.getItem('darkOverlayMode') || 'smart') as
          | 'off'
          | 'always'
          | 'smart',
        darkModePreference: (localStorage.getItem('darkModePreference') || 'system') as
          | 'system'
          | 'on'
          | 'off'
          | 'scheduled',
        darkModeScheduleStart: localStorage.getItem('darkModeScheduleStart') || '22:00',
        darkModeScheduleEnd: localStorage.getItem('darkModeScheduleEnd') || '06:00',
      };
```

- [ ] **Step 3: exportSettings 的 catch 默认块加 12 字段**

把 catch 块里（约 92-94 行）

```ts
        animationStyle: 'simple',
      };
    }
  }, []);
```

改为：

```ts
        animationStyle: 'simple',
        workCountdownEnabled: false,
        lunchTime: '12:00',
        offWorkTime: '18:00',
        aiIconDisplayMode: 'circular',
        atmosphereMode: 'auto',
        atmosphereParticleCount: 60,
        atmosphereWindEnabled: true,
        darkOverlayEnabled: false,
        darkOverlayMode: 'smart',
        darkModePreference: 'system',
        darkModeScheduleStart: '22:00',
        darkModeScheduleEnd: '06:00',
      };
    }
  }, []);
```

- [ ] **Step 4: validateSettings 加 12 项校验**

把 `validateSettings` 里（约 220-224 行）

```ts
    if (settings.animationStyle !== undefined) {
      if (!['dynamic', 'simple'].includes(settings.animationStyle)) {
        errors.push('动画样式设置无效');
      }
    }

    return {
```

改为：

```ts
    if (settings.animationStyle !== undefined) {
      if (!['dynamic', 'simple'].includes(settings.animationStyle)) {
        errors.push('动画样式设置无效');
      }
    }

    if (
      settings.workCountdownEnabled !== undefined &&
      typeof settings.workCountdownEnabled !== 'boolean'
    ) {
      errors.push('下班倒计时设置无效');
    }

    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (settings.lunchTime !== undefined && !TIME_RE.test(settings.lunchTime)) {
      errors.push('午休时间格式无效');
    }
    if (settings.offWorkTime !== undefined && !TIME_RE.test(settings.offWorkTime)) {
      errors.push('下班时间格式无效');
    }

    if (
      settings.aiIconDisplayMode !== undefined &&
      !['circular', 'dropdown'].includes(settings.aiIconDisplayMode)
    ) {
      errors.push('AI 图标显示模式无效');
    }

    if (
      settings.atmosphereMode !== undefined &&
      !['auto', 'snow', 'leaf', 'cherry', 'firefly', 'off'].includes(settings.atmosphereMode)
    ) {
      errors.push('氛围效果模式无效');
    }

    if (settings.atmosphereParticleCount !== undefined) {
      if (
        typeof settings.atmosphereParticleCount !== 'number' ||
        settings.atmosphereParticleCount < 1 ||
        settings.atmosphereParticleCount > 200
      ) {
        errors.push('氛围粒子数量无效（应在 1-200 之间）');
      }
    }

    if (
      settings.atmosphereWindEnabled !== undefined &&
      typeof settings.atmosphereWindEnabled !== 'boolean'
    ) {
      errors.push('风力效果设置无效');
    }

    if (
      settings.darkOverlayEnabled !== undefined &&
      typeof settings.darkOverlayEnabled !== 'boolean'
    ) {
      errors.push('黑色遮罩开关无效');
    }

    if (
      settings.darkOverlayMode !== undefined &&
      !['off', 'always', 'smart'].includes(settings.darkOverlayMode)
    ) {
      errors.push('黑色遮罩模式无效');
    }

    if (
      settings.darkModePreference !== undefined &&
      !['system', 'on', 'off', 'scheduled'].includes(settings.darkModePreference)
    ) {
      errors.push('夜间模式偏好无效');
    }

    if (settings.darkModeScheduleStart !== undefined && !TIME_RE.test(settings.darkModeScheduleStart)) {
      errors.push('夜间模式开始时间格式无效');
    }
    if (settings.darkModeScheduleEnd !== undefined && !TIME_RE.test(settings.darkModeScheduleEnd)) {
      errors.push('夜间模式结束时间格式无效');
    }

    return {
```

- [ ] **Step 5: importSettings 的 settingsToApply 加 12 项**

把 `importSettings` 里（约 409-415 行）

```ts
      if (settings.animationStyle) {
        settingsToApply.push({
          key: 'animationStyle',
          value: settings.animationStyle,
          label: '动画样式',
        });
      }
```

之后插入：

```ts
      if (typeof settings.workCountdownEnabled === 'boolean') {
        settingsToApply.push({
          key: 'workCountdownEnabled',
          value: settings.workCountdownEnabled.toString(),
          label: '下班倒计时',
        });
      }

      if (settings.lunchTime) {
        settingsToApply.push({ key: 'lunchTime', value: settings.lunchTime, label: '午休时间' });
      }

      if (settings.offWorkTime) {
        settingsToApply.push({ key: 'offWorkTime', value: settings.offWorkTime, label: '下班时间' });
      }

      if (settings.aiIconDisplayMode) {
        settingsToApply.push({
          key: 'aiIconDisplayMode',
          value: settings.aiIconDisplayMode,
          label: 'AI 图标显示模式',
        });
      }

      if (settings.atmosphereMode) {
        settingsToApply.push({
          key: 'atmosphereMode',
          value: settings.atmosphereMode,
          label: '氛围效果模式',
        });
      }

      if (typeof settings.atmosphereParticleCount === 'number') {
        settingsToApply.push({
          key: 'atmosphereParticleCount',
          value: settings.atmosphereParticleCount.toString(),
          label: '氛围粒子数量',
        });
      }

      if (typeof settings.atmosphereWindEnabled === 'boolean') {
        settingsToApply.push({
          key: 'atmosphereWindEnabled',
          value: settings.atmosphereWindEnabled.toString(),
          label: '风力效果',
        });
      }

      if (typeof settings.darkOverlayEnabled === 'boolean') {
        settingsToApply.push({
          key: 'darkOverlayEnabled',
          value: settings.darkOverlayEnabled.toString(),
          label: '黑色遮罩开关',
        });
      }

      if (settings.darkOverlayMode) {
        settingsToApply.push({
          key: 'darkOverlayMode',
          value: settings.darkOverlayMode,
          label: '黑色遮罩模式',
        });
      }

      if (settings.darkModePreference) {
        settingsToApply.push({
          key: 'darkModePreference',
          value: settings.darkModePreference,
          label: '夜间模式偏好',
        });
      }

      if (settings.darkModeScheduleStart) {
        settingsToApply.push({
          key: 'darkModeScheduleStart',
          value: settings.darkModeScheduleStart,
          label: '夜间模式开始时间',
        });
      }

      if (settings.darkModeScheduleEnd) {
        settingsToApply.push({
          key: 'darkModeScheduleEnd',
          value: settings.darkModeScheduleEnd,
          label: '夜间模式结束时间',
        });
      }
```

- [ ] **Step 6: 类型检查 + lint**

Run: `npx tsc --noEmit`
Expected: exit 0

Run: `pnpm lint`
Expected: 0 warnings

- [ ] **Step 7: 提交**

```bash
git add src/hooks/useSettingsManager.ts
git commit -m "$(cat <<'EOF'
feat(settings): 本地导出/导入补全氛围/夜间模式/下班倒计时等 12 项

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 整体验证（类型 + lint + 真机回环）

**Files:** 无

- [ ] **Step 1: 全量类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0，无错误

- [ ] **Step 2: lint**

Run: `pnpm lint`
Expected: 0 warnings（`--max-warnings 0` 下通过）

- [ ] **Step 3: 启动本地并做真机回环**

Run: `pnpm dev`，浏览器开 `http://localhost:3000`，登录已验证邮箱的账号。

手动核对清单（A=当前设备改值上传，B=清 localStorage 或换设备下载）：
- [ ] 把「搜索在新标签页打开」关掉（false）→ 触发上传 → 在 B 端下载 → 仍为关闭（**回归重点**）
- [ ] 改搜索框圆角为非 12 的值 → 上传 → B 端下载 → 圆角一致（**回归重点**）
- [ ] 夜间模式偏好设为「定时」并改起止时间 → 上传 → B 端下载 → 偏好与时间一致
- [ ] 改氛围效果模式 + 粒子数量 + 风力开关 → 上传 → B 端下载 → 一致
- [ ] 改黑色遮罩开关/模式、AI 图标模式、下班倒计时/午休/下班时间、日期显示模式、动画样式 → 上传 → B 端下载 → 全部一致
- [ ] 设置页「导出配置」生成 JSON → 清空后「导入」→ 上述项全部还原

- [ ] **Step 4: 汇报结果**

记录 tsc / lint 输出与回环清单勾选情况。如全绿，向用户报告完成并询问是否推远端 / 开 PR（默认分支 main 推送即部署，需显式确认）。

---

## 自审记录（writing-plans self-review）

- **Spec 覆盖**：§4.1 迁移→Task1；§4.4 sanitize 修复→Task2；§3+§4.3 接口/sanitize→Task3；§4.3 save/get→Task4；§4.5 Settings→Task5；§4.6 useAutoSync（含指纹+依赖）→Task6；§4.7 导出导入→Task7；§5 验证→Task8。§4.2 deploy.sql→Task1 Step3。无遗漏。
- **占位扫描**：无 TBD/TODO；所有代码步骤均给出完整代码。
- **命名一致性**：camelCase/snake_case 全程对照「字段清单」；`sanitizeEnum`/`sanitizeTime`/`TIME_RE` 在 Task3 定义，Task7 的 `validateSettings` 内独立声明了局部 `TIME_RE`（不同文件，互不依赖）。
- **顺序安全**：Task1 先于读写新列的 Task4-7；代码对缺列有回退，万一迁移晚于代码也不崩。
