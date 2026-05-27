# 搜索引擎管理 — 设计文档

**日期**:2026-05-27
**作者**:江江 + Claude
**状态**:待实现

## 背景

当前搜索引擎在 `src/components/SearchBar.tsx` 中硬编码:仅支持 Bing 与 Google,通过 Tab 键或点击按钮在两者间循环。引擎枚举(line 50)、`engineList` 数组(line 300)、`getSearchUrl` switch(line 498)三处全部写死。

用户希望:
1. 增加更多预设引擎(百度、DuckDuckGo)
2. 提供"搜索引擎管理"入口,可启用/停用预设
3. 支持自定义搜索引擎(用户填名称 + URL)
4. 自定义引擎自动拉取 favicon,失败时用 🍅 兜底

## 目标

把硬编码的 bing/google 二选一,改造为「数据驱动的可管理引擎列表」,内置 4 个 + 用户自定义任意数量。点击按钮 / Tab 键在用户已启用的引擎间循环切换。

## 非目标

- 不改造搜索建议 API(目前用百度 suggestion,所有引擎共用,本次不动)
- 不增加引擎排序功能(按固定顺序:内置在前,自定义按创建顺序在后)
- 不在搜索框上做引擎选择 popover(管理只在 Settings 面板)
- 不迁移现有 `bing`/`google` 状态(用户没有损失,因 4 个默认全启用)

## 架构

### 数据模型

新建 `src/types/searchEngine.ts`:

```typescript
export type SearchEngineIconType = 'fontawesome' | 'local' | 'favicon' | 'fallback';

export interface SearchEngine {
  id: string;                    // 内置:'bing'/'google'/'baidu'/'duckduckgo'
                                 // 自定义:'custom-{timestamp}'
  name: string;                  // 显示名,1-20 字符
  urlTemplate: string;           // 'https://www.bing.com/search?q={query}'
                                 // 必须包含 {query} 占位符
  iconType: SearchEngineIconType;
  iconValue?: string;            // 见下表
  isBuiltin: boolean;            // 内置项不可删除,只能 toggle enabled
  enabled: boolean;              // 是否在循环列表中
}
```

`iconType` 与 `iconValue` 对应关系:

| iconType | iconValue | 用途 |
|---|---|---|
| `fontawesome` | FA class 字符串,如 `fa-microsoft text-blue-400` | 内置 Bing / Google / 百度 |
| `local` | `icon/DuckDuckGo.svg` 等本地路径(相对 `import.meta.env.BASE_URL`) | 内置 DuckDuckGo |
| `favicon` | 域名 host,用于走 `faviconCache` 拉取 | 自定义引擎默认 |
| `fallback` | 不填,渲染为 🍅 emoji | favicon 拉取失败的兜底 |

### 内置引擎种子数据

```typescript
const BUILTIN_ENGINES: SearchEngine[] = [
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
```

### 存储

- **localStorage key**:`searchEngines`(JSON array)
- **当前选中**:`currentSearchEngineId`(string)
- 首次启动:若任一 key 不存在,seed 内置 4 个 + `currentSearchEngineId = 'bing'`
- 兼容旧数据:不迁移,直接重新 seed(用户的选择从 bing/google 之一变成 4 个全开,选中默认 bing)
- 解析失败:catch 后重新 seed

### Context

新建 `src/contexts/SearchEngineContext.tsx`:

```typescript
interface SearchEngineContextType {
  engines: SearchEngine[];               // 全列表
  currentEngineId: string;
  currentEngine: SearchEngine;           // 计算属性
  enabledEngines: SearchEngine[];        // 计算属性

  setCurrentEngineId: (id: string) => void;
  toggleEngineEnabled: (id: string) => void;
  addCustomEngine: (data: { name: string; urlTemplate: string }) => SearchEngine;
  updateCustomEngine: (id: string, patch: Partial<Pick<SearchEngine, 'name' | 'urlTemplate'>>) => void;
  deleteCustomEngine: (id: string) => void;
  cycleToNext: () => void;
}
```

**Provider 挂载位置**:在 `main.tsx` 中与 `TransparencyProvider` 同层并列。

## UI

### Settings 面板新增区块

位置:`src/pages/Settings.tsx` 中新增"搜索引擎"区块(具体放在哪个 tab 实现时再定,沿用现有 tab 结构)。

布局:

```
┌─ 搜索引擎管理 ──────────────────────────────────┐
│                                                  │
│  内置引擎                                        │
│  ┌──────────────────────────────────────┐       │
│  │ [icon] Bing            [✓ toggle]    │       │
│  │ [icon] Google          [✓ toggle]    │       │
│  │ [icon] 百度            [✓ toggle]    │       │
│  │ [icon] DuckDuckGo      [✓ toggle]    │       │
│  └──────────────────────────────────────┘       │
│                                                  │
│  自定义引擎                       [+ 添加]       │
│  ┌──────────────────────────────────────┐       │
│  │ [favicon] MDN          [✓] [✏] [🗑]  │       │
│  │ [🍅] MyEngine          [✓] [✏] [🗑]  │       │
│  │ (空状态:"还没有自定义引擎,点 + 添加")│       │
│  └──────────────────────────────────────┘       │
└──────────────────────────────────────────────────┘
```

### 添加 / 编辑表单(模态)

字段:
- **名称**(必填,1-20 字符)
- **搜索 URL**(必填)
  - placeholder:`https://example.com/search?q={query}`
  - 必须包含 `{query}`
  - 替换 `{query}` 为 `test` 后,`new URL()` 能解析

预览区:输入合法后即时显示 favicon,失败显示 🍅。

### SearchBar 改造点

`src/components/SearchBar.tsx`:

1. 删除 `useState<'bing' | 'google'>('bing')` → 改用 `useSearchEngine()`
2. 删除硬编码 `engineList`(line 300-303)
3. 删除 `getSearchUrl` switch(line 498-505),替换为:
   ```typescript
   const url = engine.urlTemplate.replace('{query}', encodeURIComponent(query));
   ```
4. 抽出图标组件 `<SearchEngineIcon engine={engine} />`,按 `iconType` 分发渲染
5. `switchEngine()` 改为调用 `cycleToNext()`
6. Tab 键 handler 改为 `cycleToNext()`
7. 彩带动画原本通过 `querySelector('.fa-brands.fa-microsoft, .fa-brands.fa-google')` 找按钮,改为用 button ref
8. tooltip 文案"切换至 Bing/Google"改为"切换至 {下一个 enabledEngine 的 name}"

彩蛋逻辑(番茄雨 / TODO / workspace / settings / help / developer)全部保留不动。

## 错误与边界处理

| 场景 | 处理 |
|---|---|
| 自定义引擎 favicon 拉取超时 / 失败 | 显示 🍅 emoji,不再重试 |
| URL 不含 `{query}` | 表单校验失败,提示"URL 必须包含 {query} 占位符" |
| URL 格式不合法 | 表单校验失败,提示"URL 格式不合法" |
| 名称为空 / 超长 | 表单校验失败,提示对应消息 |
| 删除当前选中的自定义引擎 | 自动切到 `enabledEngines[0]` |
| 关掉最后一个 enabled | 阻止操作,toast 提示"至少保留一个搜索引擎" |
| 关掉当前选中的引擎(但还有别的) | 允许,自动切到下一个 enabled |
| 重复 id | 自定义 id 用 `custom-${Date.now()}` 保证唯一;name 允许重复 |
| localStorage JSON.parse 失败 | catch 后重新 seed 内置默认 |

## 文件清单

新增:
- `src/types/searchEngine.ts` — 类型与内置种子数据
- `src/contexts/SearchEngineContext.tsx` — Provider + hook
- `src/components/SearchEngineIcon.tsx` — 统一图标渲染组件
- `src/components/SearchEngineManager/index.tsx` — Settings 中的管理区块
- `src/components/SearchEngineManager/EngineEditModal.tsx` — 添加 / 编辑模态

修改:
- `src/components/SearchBar.tsx` — 接入 Context,删除硬编码
- `src/pages/Settings.tsx` — 嵌入管理区块
- `src/main.tsx`(或 `App.tsx`) — 挂载 Provider

已有可复用:
- `public/icon/DuckDuckGo.svg` — DuckDuckGo 本地图标(已存在)
- `src/lib/faviconCache.ts` — favicon 拉取与缓存
- `src/lib/faviconUtils.ts` — `processFaviconUrl` 工具

## 测试要点

- 首次启动 → 看到 4 个内置引擎默认全启用,当前选中 Bing
- Tab / 点击按钮 → 依次循环 Bing → Google → 百度 → DuckDuckGo → Bing
- 关闭其中 2 个 → 循环只在剩 2 个之间
- 添加自定义引擎 `https://github.com/search?q={query}` → favicon 正常拉取
- 添加 URL 不含 `{query}` → 表单报错
- 删除当前选中的自定义引擎 → 自动切到首个 enabled
- 尝试关闭最后一个 enabled → 操作被拒,toast 提示
- 清空 localStorage 后刷新 → 自动 re-seed
