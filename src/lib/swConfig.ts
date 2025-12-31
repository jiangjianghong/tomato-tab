// Service Worker 配置常量
// 更新版本时只需修改这里，sw.js 和 usePWA.ts 会自动同步

export const SW_VERSION = 'vd9fda35';
export const CACHE_PREFIX = 'tomato-tab';

// 缓存名称
export const CACHE_NAMES = {
  MAIN: `${CACHE_PREFIX}-${SW_VERSION}-offline`,
  STATIC: `static-${SW_VERSION}`,
  DYNAMIC: `dynamic-${SW_VERSION}`,
  WALLPAPER: `wallpaper-${SW_VERSION}`,
} as const;
