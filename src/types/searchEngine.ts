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
    iconType: 'local',
    iconValue: 'icon/baidu.svg',
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
