# 搜索引擎管理 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把硬编码的 Bing/Google 二选一改造为数据驱动的可管理搜索引擎列表(内置 4 个 + 用户自定义),Settings 提供完整管理 UI。

**Architecture:** 新建 `SearchEngineContext` 持有扁平的引擎数组,localStorage 持久化;`SearchBar` 接入 Context 删除硬编码;`Settings` 新增"搜索引擎"section,含内置列表 toggle、自定义增删改、添加/编辑模态。自定义引擎走 favicon 拉取,失败兜底 🍅 emoji。

**Tech Stack:** React 18, TypeScript 5.7, Vite 6, framer-motion, sonner (toast), localStorage, Font Awesome (CDN), 项目已有的 `faviconCache`。

**Spec reference:** `docs/superpowers/specs/2026-05-27-search-engine-management-design.md`

**测试策略:** 项目无单元测试框架,采用**手动验证**——每个任务结尾给出 `pnpm dev` 启动后在浏览器中需要观察的现象。

---

## 文件清单

**新增**:
- `src/types/searchEngine.ts` — 类型 + 内置种子数据
- `src/contexts/SearchEngineContext.tsx` — Provider + `useSearchEngine` hook
- `src/components/SearchEngineIcon.tsx` — 4 种 iconType 的统一渲染
- `src/components/SearchEngineManager/index.tsx` — Settings 中的管理区块
- `src/components/SearchEngineManager/EngineEditModal.tsx` — 添加 / 编辑模态

**修改**:
- `src/MainApp.tsx` — 挂载 `SearchEngineProvider`
- `src/components/SearchBar.tsx` — 删除硬编码,接入 Context
- `src/pages/Settings.tsx` — 在 `SECTIONS` 数组与渲染处增加 `searchEngine` section

**复用已有**:
- `public/icon/DuckDuckGo.svg`
- `src/lib/faviconCache.ts`(`getFavicon`、`getCachedFavicon`)
- `src/lib/faviconUtils.ts`(`processFaviconUrl`、`extractDomain`)
- `sonner` 的 `toast`

---

## Task 1:类型定义与内置种子数据

**Files:**
- Create: `src/types/searchEngine.ts`

- [ ] **Step 1:创建类型文件**

写入 `src/types/searchEngine.ts`:

```typescript
export type SearchEngineIconType = 'fontawesome' | 'local' | 'favicon' | 'fallback';

export interface SearchEngine {
  id: string;
  name: string;
  urlTemplate: string;
  iconType: SearchEngineIconType;
  iconValue?: string;
  isBuiltin: boolean;
  enabled: boolean;
}

export const BUILTIN_ENGINES: SearchEngine[] = [
  {
    id: 'bing',
    name: 'Bing',
    urlTemplate: 'https://www.bing.com/search?q={query}',
    iconType: 'fontawesome',
    iconValue: 'fa-microsoft text-blue-400',
    isBuiltin: true,
    enabled: true,
  },
  {
    id: 'google',
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q={query}',
    iconType: 'fontawesome',
    iconValue: 'fa-google text-blue-500',
    isBuiltin: true,
    enabled: true,
  },
  {
    id: 'baidu',
    name: '百度',
    urlTemplate: 'https://www.baidu.com/s?wd={query}',
    iconType: 'fontawesome',
    iconValue: 'fa-baidu text-[#2932E1]',
    isBuiltin: true,
    enabled: true,
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    urlTemplate: 'https://duckduckgo.com/?q={query}',
    iconType: 'local',
    iconValue: 'icon/DuckDuckGo.svg',
    isBuiltin: true,
    enabled: true,
  },
];

export const DEFAULT_ENGINE_ID = 'bing';
export const QUERY_PLACEHOLDER = '{query}';
export const STORAGE_KEY_ENGINES = 'searchEngines';
export const STORAGE_KEY_CURRENT = 'currentSearchEngineId';

export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.urlTemplate.replace(QUERY_PLACEHOLDER, encodeURIComponent(query));
}

export function validateUrlTemplate(template: string): { ok: true } | { ok: false; reason: string } {
  if (!template.includes(QUERY_PLACEHOLDER)) {
    return { ok: false, reason: 'URL 必须包含 {query} 占位符' };
  }
  try {
    const probed = template.replace(QUERY_PLACEHOLDER, 'test');
    const u = new URL(probed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, reason: 'URL 必须以 http:// 或 https:// 开头' };
    }
  } catch {
    return { ok: false, reason: 'URL 格式不合法' };
  }
  return { ok: true };
}
```

- [ ] **Step 2:TypeScript 编译验证**

Run: `pnpm lint`
Expected: 不应有新的 lint 错误(可能有现有错误,但不应增加)

如果项目根有 `tsconfig.json` 但没有独立的 type check 命令,跳过此步骤,留给 IDE 报错。

- [ ] **Step 3:Commit**

```bash
git add src/types/searchEngine.ts
git commit -m "feat(search-engine): 添加搜索引擎类型与内置种子数据"
```

---

## Task 2:SearchEngineContext 与 Provider

**Files:**
- Create: `src/contexts/SearchEngineContext.tsx`

- [ ] **Step 1:创建 Context 文件**

写入 `src/contexts/SearchEngineContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import {
  SearchEngine,
  BUILTIN_ENGINES,
  DEFAULT_ENGINE_ID,
  STORAGE_KEY_ENGINES,
  STORAGE_KEY_CURRENT,
} from '@/types/searchEngine';

interface SearchEngineContextType {
  engines: SearchEngine[];
  currentEngineId: string;
  currentEngine: SearchEngine;
  enabledEngines: SearchEngine[];

  setCurrentEngineId: (id: string) => void;
  toggleEngineEnabled: (id: string) => boolean; // 返回 false 表示被阻止(最后一个 enabled)
  addCustomEngine: (data: { name: string; urlTemplate: string }) => SearchEngine;
  updateCustomEngine: (id: string, patch: Partial<Pick<SearchEngine, 'name' | 'urlTemplate'>>) => void;
  deleteCustomEngine: (id: string) => void;
  cycleToNext: () => void;
}

const SearchEngineContext = createContext<SearchEngineContextType | undefined>(undefined);

function loadEnginesFromStorage(): SearchEngine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENGINES);
    if (!raw) return [...BUILTIN_ENGINES];
    const parsed = JSON.parse(raw) as SearchEngine[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...BUILTIN_ENGINES];
    // 完整性兜底:每个内置 id 必须存在,缺哪个补哪个
    const result = [...parsed];
    for (const builtin of BUILTIN_ENGINES) {
      if (!result.some((e) => e.id === builtin.id)) {
        result.push({ ...builtin });
      }
    }
    return result;
  } catch {
    return [...BUILTIN_ENGINES];
  }
}

function loadCurrentIdFromStorage(): string {
  return localStorage.getItem(STORAGE_KEY_CURRENT) || DEFAULT_ENGINE_ID;
}

export function SearchEngineProvider({ children }: { children: ReactNode }) {
  const [engines, setEngines] = useState<SearchEngine[]>(() => loadEnginesFromStorage());
  const [currentEngineId, setCurrentEngineIdState] = useState<string>(() => loadCurrentIdFromStorage());

  // 持久化 engines
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ENGINES, JSON.stringify(engines));
    } catch {
      // ignore
    }
  }, [engines]);

  // 持久化 currentEngineId
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT, currentEngineId);
    } catch {
      // ignore
    }
  }, [currentEngineId]);

  const enabledEngines = useMemo(() => engines.filter((e) => e.enabled), [engines]);

  const currentEngine = useMemo(() => {
    const found = engines.find((e) => e.id === currentEngineId);
    if (found && found.enabled) return found;
    // 当前选中的 disabled 或不存在 -> 自动切到首个 enabled
    return enabledEngines[0] || engines[0] || BUILTIN_ENGINES[0];
  }, [engines, currentEngineId, enabledEngines]);

  // 如果计算后的 currentEngine.id 与 state 不一致,纠正之
  useEffect(() => {
    if (currentEngine.id !== currentEngineId) {
      setCurrentEngineIdState(currentEngine.id);
    }
  }, [currentEngine.id, currentEngineId]);

  const setCurrentEngineId = useCallback((id: string) => {
    setCurrentEngineIdState(id);
  }, []);

  const toggleEngineEnabled = useCallback((id: string): boolean => {
    let blocked = false;
    setEngines((prev) => {
      const target = prev.find((e) => e.id === id);
      if (!target) return prev;
      // 关闭最后一个 enabled -> 阻止
      if (target.enabled && prev.filter((e) => e.enabled).length === 1) {
        blocked = true;
        return prev;
      }
      return prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
    });
    return !blocked;
  }, []);

  const addCustomEngine = useCallback((data: { name: string; urlTemplate: string }): SearchEngine => {
    const newEngine: SearchEngine = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: data.name,
      urlTemplate: data.urlTemplate,
      iconType: 'favicon',
      iconValue: extractHost(data.urlTemplate),
      isBuiltin: false,
      enabled: true,
    };
    setEngines((prev) => [...prev, newEngine]);
    return newEngine;
  }, []);

  const updateCustomEngine = useCallback(
    (id: string, patch: Partial<Pick<SearchEngine, 'name' | 'urlTemplate'>>) => {
      setEngines((prev) =>
        prev.map((e) => {
          if (e.id !== id || e.isBuiltin) return e;
          const next = { ...e, ...patch };
          if (patch.urlTemplate) {
            next.iconValue = extractHost(patch.urlTemplate);
          }
          return next;
        })
      );
    },
    []
  );

  const deleteCustomEngine = useCallback((id: string) => {
    setEngines((prev) => {
      const target = prev.find((e) => e.id === id);
      if (!target || target.isBuiltin) return prev;
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const cycleToNext = useCallback(() => {
    setCurrentEngineIdState((prevId) => {
      const list = engines.filter((e) => e.enabled);
      if (list.length === 0) return prevId;
      const idx = list.findIndex((e) => e.id === prevId);
      const nextIdx = (idx + 1) % list.length;
      return list[nextIdx].id;
    });
  }, [engines]);

  const value: SearchEngineContextType = {
    engines,
    currentEngineId: currentEngine.id,
    currentEngine,
    enabledEngines,
    setCurrentEngineId,
    toggleEngineEnabled,
    addCustomEngine,
    updateCustomEngine,
    deleteCustomEngine,
    cycleToNext,
  };

  return <SearchEngineContext.Provider value={value}>{children}</SearchEngineContext.Provider>;
}

export function useSearchEngine(): SearchEngineContextType {
  const ctx = useContext(SearchEngineContext);
  if (!ctx) throw new Error('useSearchEngine must be used inside SearchEngineProvider');
  return ctx;
}

function extractHost(urlTemplate: string): string {
  try {
    const probed = urlTemplate.replace('{query}', 'test');
    return new URL(probed).hostname;
  } catch {
    return '';
  }
}
```

- [ ] **Step 2:Commit**

```bash
git add src/contexts/SearchEngineContext.tsx
git commit -m "feat(search-engine): 添加 SearchEngineContext 与持久化逻辑"
```

---

## Task 3:挂载 Provider 到 MainApp

**Files:**
- Modify: `src/MainApp.tsx`

- [ ] **Step 1:导入 Provider**

在 `src/MainApp.tsx` 的 import 区(line 12 `TransparencyProvider` 旁)添加:

```typescript
import { SearchEngineProvider } from '@/contexts/SearchEngineContext';
```

- [ ] **Step 2:嵌套 Provider**

在 `MainApp` 函数 return 中,把 `SearchEngineProvider` 套在 `TransparencyProvider` 内层:

```tsx
return (
  <DndProvider backend={HTML5Backend}>
    <TransparencyProvider>
      <SearchEngineProvider>
        <AuthProvider>
          {/* ... 其他 Provider 不动 ... */}
        </AuthProvider>
      </SearchEngineProvider>
    </TransparencyProvider>
  </DndProvider>
);
```

完整改后的 MainApp 函数:

```tsx
export default function MainApp() {
  logger.debug('🎯 MainApp 开始渲染');

  return (
    <DndProvider backend={HTML5Backend}>
      <TransparencyProvider>
        <SearchEngineProvider>
          <AuthProvider>
            <SyncProvider>
              <UserProfileProvider>
                <AdminProvider>
                  <WorkspaceProvider>
                    <AppContent />
                  </WorkspaceProvider>
                </AdminProvider>
              </UserProfileProvider>
            </SyncProvider>
          </AuthProvider>
        </SearchEngineProvider>
      </TransparencyProvider>
    </DndProvider>
  );
}
```

- [ ] **Step 3:手动验证**

Run: `pnpm dev`
Expected:
- 浏览器打开 `http://localhost:3000` 页面正常渲染
- 控制台无 `useSearchEngine must be used inside SearchEngineProvider` 错误
- localStorage 中出现 `searchEngines`(4 项)与 `currentSearchEngineId`(`bing`)两个 key

在 DevTools Application → Local Storage 中验证。

- [ ] **Step 4:Commit**

```bash
git add src/MainApp.tsx
git commit -m "feat(search-engine): 挂载 SearchEngineProvider 到根组件"
```

---

## Task 4:SearchEngineIcon 统一图标组件

**Files:**
- Create: `src/components/SearchEngineIcon.tsx`

- [ ] **Step 1:创建组件**

写入 `src/components/SearchEngineIcon.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { SearchEngine } from '@/types/searchEngine';
import { faviconCache } from '@/lib/faviconCache';

interface Props {
  engine: SearchEngine;
  size?: number; // 像素,默认 18
  className?: string;
}

export function SearchEngineIcon({ engine, size = 18, className = '' }: Props) {
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    if (engine.iconType !== 'favicon' || !engine.iconValue) {
      setFaviconUrl(null);
      setFaviconFailed(false);
      return;
    }
    let cancelled = false;
    const probeUrl = engine.urlTemplate.replace('{query}', 'test');
    let host = '';
    try {
      host = new URL(probeUrl).hostname;
    } catch {
      setFaviconFailed(true);
      return;
    }
    const candidateFaviconUrl = `https://${host}/favicon.ico`;
    faviconCache
      .getFavicon(probeUrl, candidateFaviconUrl)
      .then((url) => {
        if (cancelled) return;
        // 项目的 getFavicon 在网络/拉取失败时会返回默认占位 '/icon/favicon.png'
        // 这种情况我们当作"自定义引擎拉不到 favicon",走 🍅 兜底
        if (!url || url.endsWith('/icon/favicon.png')) {
          setFaviconFailed(true);
          setFaviconUrl(null);
        } else {
          setFaviconUrl(url);
          setFaviconFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFaviconFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [engine.iconType, engine.iconValue, engine.urlTemplate]);

  const style: React.CSSProperties = { width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

  if (engine.iconType === 'fontawesome' && engine.iconValue) {
    return (
      <span style={style} className={className}>
        <i className={`fa-brands ${engine.iconValue}`} style={{ fontSize: size }} />
      </span>
    );
  }

  if (engine.iconType === 'local' && engine.iconValue) {
    return (
      <span style={style} className={className}>
        <img
          src={import.meta.env.BASE_URL + engine.iconValue}
          alt={engine.name}
          style={{ width: size, height: size, objectFit: 'contain' }}
          draggable={false}
        />
      </span>
    );
  }

  if (engine.iconType === 'favicon' && faviconUrl && !faviconFailed) {
    return (
      <span style={style} className={className}>
        <img
          src={faviconUrl}
          alt={engine.name}
          style={{ width: size, height: size, objectFit: 'contain' }}
          onError={() => setFaviconFailed(true)}
          draggable={false}
        />
      </span>
    );
  }

  // fallback:🍅
  return (
    <span style={{ ...style, fontSize: size }} className={className} role="img" aria-label={engine.name}>
      🍅
    </span>
  );
}
```

> **faviconCache API 确认**:已核对 `src/lib/faviconCache.ts:387` —— `getFavicon(originalUrl, faviconUrl): Promise<string>` 总是返回字符串,网络失败时返回项目默认 `/icon/favicon.png`,因此上面代码检测到这个默认值时强制走 🍅 fallback。

- [ ] **Step 2:手动验证(临时挂载到 Home)**

为快速预览,在 `src/pages/Home.tsx` 顶部临时加一行:

```tsx
import { SearchEngineIcon } from '@/components/SearchEngineIcon';
import { BUILTIN_ENGINES } from '@/types/searchEngine';
```

并在 `<div className={classes.container}>` 内最顶上临时插入:

```tsx
<div style={{ position: 'fixed', top: 60, left: 8, zIndex: 9999, background: '#0008', padding: 8, display: 'flex', gap: 8 }}>
  {BUILTIN_ENGINES.map(e => <SearchEngineIcon key={e.id} engine={e} size={20} />)}
</div>
```

Run: `pnpm dev`
Expected: 浏览器左上角看到 4 个图标,4 个都能渲染(Bing 微软方块、Google 彩色 G、百度蓝色 fa、DuckDuckGo 鸭子 SVG)。

验证完**记得删除这段临时代码**。

- [ ] **Step 3:Commit**

```bash
git add src/components/SearchEngineIcon.tsx
git commit -m "feat(search-engine): 添加统一的 SearchEngineIcon 渲染组件"
```

---

## Task 5:SearchBar 接入 Context(删除硬编码)

**Files:**
- Modify: `src/components/SearchBar.tsx`

- [ ] **Step 1:导入 hook 与组件**

在 `src/components/SearchBar.tsx` 顶部 import 区添加:

```typescript
import { useSearchEngine } from '@/contexts/SearchEngineContext';
import { SearchEngineIcon } from '@/components/SearchEngineIcon';
import { buildSearchUrl } from '@/types/searchEngine';
```

- [ ] **Step 2:替换 engine state**

删除 line 50 附近:

```typescript
const [engine, setEngine] = useState<'bing' | 'google'>('bing');
```

在组件函数顶部(其他 hook 之后)添加:

```typescript
const { currentEngine, enabledEngines, cycleToNext } = useSearchEngine();
```

之后正文中所有 `engine` 引用替换为 `currentEngine.id`(string 比较的地方)或直接用 `currentEngine` 对象。

- [ ] **Step 3:删除硬编码 engineList**

删除 line 300-303(原文):

```typescript
const engineList = [
  { key: 'bing', label: 'Bing', icon: <i className="fa-brands fa-microsoft text-blue-400"></i> },
  { key: 'google', label: 'Google', icon: <i className="fa-brands fa-google text-blue-500"></i> },
];
```

- [ ] **Step 4:替换 switchEngine 函数**

把原 `switchEngine` 函数体改为:

```typescript
const switchEngine = () => {
  cycleToNext();

  // 触发彩带动画 - 从搜索引擎按钮位置
  const engineButton = engineButtonRef.current;
  if (engineButton) {
    const rect = engineButton.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    createFireworkEffect(centerX, centerY);
  }
};
```

并在组件顶部声明 ref:

```typescript
const engineButtonRef = useRef<HTMLButtonElement>(null);
```

- [ ] **Step 5:替换 getSearchUrl**

删除原 `getSearchUrl` 函数(line 498-505),把所有调用点改为:

```typescript
// 原:openUrl(getSearchUrl(engine, query));
openUrl(buildSearchUrl(currentEngine, query));
```

同样改 `performSearchWithStats`:

```typescript
const performSearchWithStats = (query: string) => {
  userStatsManager.recordSearch();
  openUrl(buildSearchUrl(currentEngine, query));
};
```

把所有 `performSearchWithStats(engine, queryToSearch)` 改为 `performSearchWithStats(queryToSearch)`。

- [ ] **Step 6:替换 Tab 键 handler 中的引擎切换**

原 line 230-258 的 Tab 处理段,把 `setEngine(...)` 替换为 `cycleToNext()`,并把彩带 querySelector 改为 ref:

```typescript
if (e.key === 'Tab' && !e.shiftKey) {
  const active = document.activeElement;
  const isInput =
    active &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      (active as HTMLElement).isContentEditable);

  const isOurSearchInput = active === inputRef.current;
  if (!isInput || isOurSearchInput) {
    e.preventDefault();
    cycleToNext();

    const engineButton = engineButtonRef.current;
    if (engineButton) {
      const rect = engineButton.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      createFireworkEffect(centerX, centerY);
    }
    return;
  }
}
```

同时把 `useEffect` 依赖数组里的 `engine`(如果存在)替换为 `cycleToNext`。

- [ ] **Step 7:替换按钮渲染**

找到 line 1556-1580 的引擎切换按钮:

```tsx
<motion.button
  type="button"
  ref={engineButtonRef}                              {/* 新增 ref */}
  whileTap={{ scale: 0.9, filter: 'brightness(0.8)' }}
  className="flex items-center gap-2 px-1.5 py-1 text-white/80 hover:text-white bg-transparent border-none outline-none text-lg select-none relative z-20"
  style={{
    pointerEvents: 'auto',
    height: 36,
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    display: 'flex',
  }}
  tabIndex={-1}
  onClick={() => {
    switchEngine();
  }}
  onMouseEnter={() => setShowEngineTooltip(true)}
  onMouseLeave={() => setShowEngineTooltip(false)}
>
  <SearchEngineIcon engine={currentEngine} size={20} />
  <span className="hidden sm:inline text-base font-semibold select-none">
    {currentEngine.name}
  </span>
</motion.button>
```

- [ ] **Step 8:替换 tooltip 文案**

原:

```tsx
切换至 {engine === 'bing' ? 'Google' : 'Bing'}
```

改为:

```tsx
{(() => {
  const idx = enabledEngines.findIndex(e => e.id === currentEngine.id);
  const next = enabledEngines[(idx + 1) % enabledEngines.length];
  return `切换至 ${next?.name || currentEngine.name}`;
})()}
```

- [ ] **Step 9:lint 检查**

Run: `pnpm lint`
Expected: 无新增错误。常见问题:遗漏的 `engine` 残留引用 → 改为 `currentEngine.id`。

- [ ] **Step 10:手动验证**

Run: `pnpm dev`
Expected:
- 搜索框上的引擎按钮显示 Bing 与微软方块图标
- 点击按钮 → 切换到 Google,再点 → 百度,再点 → DuckDuckGo,再点 → 回到 Bing
- Tab 键效果同上
- Hover tooltip 显示"切换至 {下一个的 name}"
- 在搜索框输入 `test` 回车 → 按当前引擎跳转(各 url 应正确,百度用 `wd=`,其他用 `q=`)
- localStorage `currentSearchEngineId` 随切换更新

- [ ] **Step 11:Commit**

```bash
git add src/components/SearchBar.tsx
git commit -m "feat(search-engine): SearchBar 接入 Context,删除硬编码引擎"
```

---

## Task 6:SearchEngineManager 内置列表 UI

**Files:**
- Create: `src/components/SearchEngineManager/index.tsx`

- [ ] **Step 1:创建组件**

写入 `src/components/SearchEngineManager/index.tsx`:

```typescript
import { useState } from 'react';
import { toast } from 'sonner';
import { useSearchEngine } from '@/contexts/SearchEngineContext';
import { SearchEngineIcon } from '@/components/SearchEngineIcon';
import { SearchEngine } from '@/types/searchEngine';
import { EngineEditModal } from './EngineEditModal';

export function SearchEngineManager() {
  const {
    engines,
    toggleEngineEnabled,
    deleteCustomEngine,
  } = useSearchEngine();
  const [editingEngine, setEditingEngine] = useState<SearchEngine | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const builtins = engines.filter((e) => e.isBuiltin);
  const customs = engines.filter((e) => !e.isBuiltin);

  const handleToggle = (id: string) => {
    const ok = toggleEngineEnabled(id);
    if (!ok) {
      toast.error('至少保留一个搜索引擎');
    }
  };

  const handleDelete = (engine: SearchEngine) => {
    if (window.confirm(`确认删除"${engine.name}"?`)) {
      deleteCustomEngine(engine.id);
      toast.success(`已删除 ${engine.name}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* 内置引擎 */}
      <div>
        <h3 className="text-sm font-medium text-white/80 mb-3">内置引擎</h3>
        <div className="space-y-2">
          {builtins.map((engine) => (
            <EngineRow
              key={engine.id}
              engine={engine}
              onToggle={() => handleToggle(engine.id)}
            />
          ))}
        </div>
      </div>

      {/* 自定义引擎 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white/80">自定义引擎</h3>
          <button
            onClick={() => setIsAdding(true)}
            className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-md text-white/90 transition-colors"
          >
            <i className="fa-solid fa-plus mr-1"></i>添加
          </button>
        </div>
        {customs.length === 0 ? (
          <div className="text-xs text-white/40 italic py-4 text-center bg-white/5 rounded-md">
            还没有自定义引擎,点 + 添加
          </div>
        ) : (
          <div className="space-y-2">
            {customs.map((engine) => (
              <EngineRow
                key={engine.id}
                engine={engine}
                onToggle={() => handleToggle(engine.id)}
                onEdit={() => setEditingEngine(engine)}
                onDelete={() => handleDelete(engine)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑模态 */}
      {(isAdding || editingEngine) && (
        <EngineEditModal
          engine={editingEngine}
          onClose={() => {
            setIsAdding(false);
            setEditingEngine(null);
          }}
        />
      )}
    </div>
  );
}

interface EngineRowProps {
  engine: SearchEngine;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function EngineRow({ engine, onToggle, onEdit, onDelete }: EngineRowProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-md transition-colors">
      <SearchEngineIcon engine={engine} size={20} />
      <span className="flex-1 text-sm text-white/90">{engine.name}</span>
      {!engine.isBuiltin && onEdit && (
        <button
          onClick={onEdit}
          className="p-1 text-white/60 hover:text-white/90 transition-colors"
          title="编辑"
        >
          <i className="fa-solid fa-pencil text-xs"></i>
        </button>
      )}
      {!engine.isBuiltin && onDelete && (
        <button
          onClick={onDelete}
          className="p-1 text-white/60 hover:text-red-400 transition-colors"
          title="删除"
        >
          <i className="fa-solid fa-trash text-xs"></i>
        </button>
      )}
      <button
        onClick={onToggle}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          engine.enabled ? 'bg-blue-500' : 'bg-white/20'
        }`}
        title={engine.enabled ? '已启用' : '已禁用'}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
            engine.enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 2:Commit**

```bash
git add src/components/SearchEngineManager/index.tsx
git commit -m "feat(search-engine): SearchEngineManager 列表 UI"
```

---

## Task 7:EngineEditModal 添加/编辑模态

**Files:**
- Create: `src/components/SearchEngineManager/EngineEditModal.tsx`

- [ ] **Step 1:创建模态组件**

写入 `src/components/SearchEngineManager/EngineEditModal.tsx`:

```typescript
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { SearchEngine, validateUrlTemplate } from '@/types/searchEngine';
import { useSearchEngine } from '@/contexts/SearchEngineContext';
import { SearchEngineIcon } from '@/components/SearchEngineIcon';

interface Props {
  engine: SearchEngine | null; // null = 添加,非 null = 编辑
  onClose: () => void;
}

export function EngineEditModal({ engine, onClose }: Props) {
  const { addCustomEngine, updateCustomEngine } = useSearchEngine();
  const [name, setName] = useState(engine?.name || '');
  const [urlTemplate, setUrlTemplate] = useState(engine?.urlTemplate || '');
  const [touched, setTouched] = useState(false);

  const nameError = useMemo(() => {
    if (!touched && !engine) return '';
    const trimmed = name.trim();
    if (trimmed.length === 0) return '名称不能为空';
    if (trimmed.length > 20) return '名称不能超过 20 字符';
    return '';
  }, [name, touched, engine]);

  const urlError = useMemo(() => {
    if (!touched && !engine) return '';
    if (!urlTemplate.trim()) return 'URL 不能为空';
    const v = validateUrlTemplate(urlTemplate.trim());
    return v.ok ? '' : v.reason;
  }, [urlTemplate, touched, engine]);

  // 预览引擎对象
  const previewEngine: SearchEngine = useMemo(() => {
    return {
      id: engine?.id || 'preview',
      name: name.trim() || '预览',
      urlTemplate: urlTemplate.trim() || 'https://example.com/?q={query}',
      iconType: urlError || !urlTemplate ? 'fallback' : 'favicon',
      iconValue: urlError ? undefined : (() => {
        try {
          return new URL(urlTemplate.replace('{query}', 'test')).hostname;
        } catch {
          return undefined;
        }
      })(),
      isBuiltin: false,
      enabled: true,
    };
  }, [name, urlTemplate, urlError, engine]);

  const handleSubmit = () => {
    setTouched(true);
    if (nameError || urlError) return;
    const trimmedName = name.trim();
    const trimmedUrl = urlTemplate.trim();
    if (engine) {
      updateCustomEngine(engine.id, { name: trimmedName, urlTemplate: trimmedUrl });
      toast.success(`已更新 ${trimmedName}`);
    } else {
      addCustomEngine({ name: trimmedName, urlTemplate: trimmedUrl });
      toast.success(`已添加 ${trimmedName}`);
    }
    onClose();
  };

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 border border-white/10 rounded-lg p-6 w-[90vw] max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-white mb-4">
          {engine ? '编辑搜索引擎' : '添加搜索引擎'}
        </h3>

        {/* 预览 */}
        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-md mb-4">
          <SearchEngineIcon engine={previewEngine} size={24} />
          <span className="text-sm text-white/80">{previewEngine.name}</span>
        </div>

        {/* 名称 */}
        <div className="mb-3">
          <label className="block text-xs text-white/70 mb-1">名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setTouched(true);
            }}
            placeholder="例如:GitHub"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white text-sm outline-none focus:border-white/30"
            maxLength={20}
            autoFocus
          />
          {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
        </div>

        {/* URL */}
        <div className="mb-4">
          <label className="block text-xs text-white/70 mb-1">搜索 URL(用 {'{query}'} 占位)</label>
          <input
            type="text"
            value={urlTemplate}
            onChange={(e) => {
              setUrlTemplate(e.target.value);
              setTouched(true);
            }}
            placeholder="https://example.com/search?q={query}"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white text-sm font-mono outline-none focus:border-white/30"
          />
          {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
        </div>

        {/* 按钮 */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!!nameError || !!urlError || !name.trim() || !urlTemplate.trim()}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed rounded-md text-white transition-colors"
          >
            {engine ? '保存' : '添加'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2:Commit**

```bash
git add src/components/SearchEngineManager/EngineEditModal.tsx
git commit -m "feat(search-engine): 添加 / 编辑搜索引擎模态框"
```

---

## Task 8:Settings 集成新 section

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1:导入新组件**

在 `src/pages/Settings.tsx` import 区添加:

```typescript
import { SearchEngineManager } from '@/components/SearchEngineManager';
```

- [ ] **Step 2:在 SECTIONS 数组中插入**

把 `SECTIONS` 数组(line 39-51)改为(在 `features` 后插入 `searchEngine`):

```typescript
const SECTIONS = [
  { id: 'account', label: '账号管理', icon: 'fa-user' },
  { id: 'sync', label: '云端同步', icon: 'fa-cloud' },
  { id: 'appearance', label: '外观设置', icon: 'fa-palette' },
  { id: 'theme', label: '主题显示', icon: 'fa-moon' },
  { id: 'wallpaper', label: '壁纸设置', icon: 'fa-image' },
  { id: 'features', label: '基础功能', icon: 'fa-cogs' },
  { id: 'searchEngine', label: '搜索引擎', icon: 'fa-magnifying-glass' },
  { id: 'interaction', label: '交互体验', icon: 'fa-wand-magic-sparkles' },
  { id: 'time', label: '时间设置', icon: 'fa-clock' },
  { id: 'cards', label: '卡片管理', icon: 'fa-layer-group' },
  { id: 'data', label: '数据管理', icon: 'fa-database' },
  { id: 'privacy', label: '隐私帮助', icon: 'fa-shield-halved' },
];
```

- [ ] **Step 3:在 render 中添加 section 块**

定位到 `features` section 的渲染 JSX(用 `grep -n 'features' src/pages/Settings.tsx` 找到对应的 `<div ref={...}` 块)。在 `features` section 渲染块之后、`interaction` section 之前插入:

```tsx
{/* 搜索引擎管理 section */}
<div
  ref={(el) => { sectionsRef.current['searchEngine'] = el; }}
  data-section-id="searchEngine"
  className="space-y-4"
>
  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
    <i className="fa-solid fa-magnifying-glass"></i>
    搜索引擎
  </h2>
  <p className="text-sm text-white/60">
    管理可用的搜索引擎,内置项可启用 / 禁用,自定义项可增删改
  </p>
  <SearchEngineManager />
</div>
```

> **若现有 section 的 ref / wrapper 结构不同**,以现有 `features` section 为模板复制——保持与现有风格一致(class、margin、ref 注册方式)。

- [ ] **Step 4:手动验证**

Run: `pnpm dev`
Expected:
- 打开 Settings(右下角齿轮)
- 左侧导航出现"搜索引擎"项(在"基础功能"和"交互体验"之间)
- 点击 → 滚动到对应 section
- 看到 4 个内置引擎的开关行 + "添加"按钮
- 自定义区显示空状态文字

- [ ] **Step 5:Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat(search-engine): 在 Settings 嵌入搜索引擎管理 section"
```

---

## Task 9:端到端手动测试

- [ ] **Step 1:启动**

```bash
pnpm dev
```

- [ ] **Step 2:验证场景**

按顺序测试以下 8 个场景,每个 PASS / FAIL 都记录下来。如发现 bug,**在本任务返工修复后再走下一项**——不要标 Task 完成直到全部 PASS。

1. **首次启动初态**:清空 localStorage(DevTools → Application → Clear site data)→ 刷新 → 搜索按钮显示 Bing → localStorage 中 `searchEngines` 是 4 项,`currentSearchEngineId` 是 `bing`
2. **循环切换(click)**:依次点击搜索按钮 → Bing → Google → 百度 → DuckDuckGo → Bing。tooltip 文案对应"切换至 X"
3. **循环切换(Tab)**:同上,但用 Tab 键。在搜索框未聚焦/已聚焦两种状态下都能切
4. **搜索执行**:输入 `test`,4 个引擎分别回车 → 跳转 URL 正确(百度 `wd=test`,Bing/Google/DuckDuckGo `q=test`)
5. **禁用引擎**:打开 Settings → 搜索引擎 section → 关掉 Google → 循环切换跳过 Google
6. **禁用最后一个**:依次关闭引擎,只剩 1 个时再尝试关 → toast 提示"至少保留一个搜索引擎",开关回弹
7. **添加自定义**:点 + 添加 → 填 `GitHub` / `https://github.com/search?q={query}` → 预览显示 GitHub favicon → 确定 → 列表出现,循环切到它能用
8. **添加失败用例**:留空名称、不含 `{query}`、非法 URL 三种情况各试一遍 → 都被表单挡住,无法保存
9. **删除自定义**:点垃圾桶 → 确认 → 列表移除。若当前选中正是它 → 自动切到首个 enabled
10. **localStorage 损坏**:在 DevTools 中把 `searchEngines` 改为 `not-json` → 刷新 → 仍能正常工作(重新 seed),4 个内置引擎都在

- [ ] **Step 3:无 commit**

本 Task 不产生新代码,只是验证 + 补救。

---

## 验收清单

实施完成时,以下全部为 true:

- [ ] `SearchBar.tsx` 中已无 `'bing' | 'google'` 字面量
- [ ] `getSearchUrl` 函数已删除,搜索 URL 经 `buildSearchUrl` 生成
- [ ] Settings 左侧导航出现"搜索引擎"项
- [ ] 内置 4 个引擎默认 enabled,可单独 toggle
- [ ] 最后一个 enabled 不能被关
- [ ] 自定义引擎可增 / 删 / 改,持久化到 localStorage
- [ ] 自定义引擎 favicon 拉取失败显示 🍅
- [ ] Tab 键 / 点击循环切换 enabled 列表
- [ ] localStorage 数据损坏时能 fallback 到内置 4 项
- [ ] `pnpm lint` 通过
- [ ] `pnpm build` 通过
