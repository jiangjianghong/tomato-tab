// 离线优先的Service Worker
// ⚠️ 更新版本时，请同步更新 src/lib/swConfig.ts 中的 SW_VERSION
const SW_VERSION = 'vd9fda35';
const CACHE_NAME = `tomato-tab-${SW_VERSION}-offline`;
const STATIC_CACHE_NAME = `static-${SW_VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-${SW_VERSION}`;
const WALLPAPER_CACHE_NAME = `wallpaper-${SW_VERSION}`;

// 使用自定义域名，始终返回空字符串作为 base path
const getBasePath = () => {
  return '';
};

const basePath = getBasePath();
const isLocalhost = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

console.log('Service Worker 路径配置:', { basePath, hostname: self.location.hostname, pathname: self.location.pathname });

// 静态缓存URL（核心文件）
const STATIC_CACHE_URLS = [
  `${basePath}/`,
  `${basePath}/index.html`,
  // 预缓存关键资源
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css'
];

// 可选缓存URL（这些文件可能不存在）
const OPTIONAL_CACHE_URLS = [
  `${basePath}/404.html`,
  `${basePath}/icon/favicon.png`,
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-solid-900.woff2'
];

// 高优先级缓存的资源类型
const HIGH_PRIORITY_CACHE = [
  'document',
  'script',
  'style'
];

// 不应该缓存的URL模式
const SKIP_CACHE_PATTERNS = [
  /googleapis\.com/,
  /firebase/,
  /google\.com.*s2\/favicons/,
  /identitytoolkit/,
  /supabase\.co.*auth/ // 避免缓存认证请求
];

// 壁纸资源URL模式
const WALLPAPER_PATTERNS = [
  /wallpaper-service/,
  /bing\.com.*\.(jpg|jpeg|png)$/,
  /unsplash\.com.*\.(jpg|jpeg|png)$/
];

// 检查是否为壁纸请求
const isWallpaperRequest = (url) => {
  return WALLPAPER_PATTERNS.some(pattern => pattern.test(url));
};

// 带超时的 fetch
const fetchWithTimeout = (request, timeout = 10000) => {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
};

// 安装事件 - 缓存核心资源
self.addEventListener('install', (event) => {
  console.log('Service Worker: 安装中...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(async (cache) => {
        console.log('Service Worker: 缓存核心资源');

        // 先缓存核心资源（必须成功）
        try {
          await cache.addAll(STATIC_CACHE_URLS);
          console.log('Service Worker: 核心资源缓存成功');
        } catch (error) {
          console.error('Service Worker: 核心资源缓存失败', error);
          throw error;
        }

        // 再尝试缓存可选资源（允许失败）
        const optionalResults = await Promise.allSettled(
          OPTIONAL_CACHE_URLS.map(url =>
            cache.add(url).catch(error => {
              console.warn(`可选资源缓存失败: ${url}`, error);
              return null;
            })
          )
        );

        const successCount = optionalResults.filter(r => r.status === 'fulfilled').length;
        console.log(`Service Worker: 可选资源缓存完成 (${successCount}/${OPTIONAL_CACHE_URLS.length})`);

        return cache;
      })
      .then(() => {
        console.log('Service Worker: 所有资源缓存处理完成');
        self.skipWaiting(); // 强制激活新的Service Worker
      })
      .catch((error) => {
        console.error('Service Worker: 缓存失败', error);
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('Service Worker: 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 保留当前版本的缓存
          const currentCaches = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME, WALLPAPER_CACHE_NAME, CACHE_NAME];
          // 清理旧版本缓存（包括旧的 jiang-ai-web 和新的 tomato-tab）
          if (!currentCaches.includes(cacheName) &&
            (cacheName.startsWith('jiang-ai-web') || cacheName.startsWith('tomato-tab') ||
              cacheName.startsWith('static-') || cacheName.startsWith('dynamic-') || cacheName.startsWith('wallpaper-'))) {
            console.log('Service Worker: 删除旧缓存', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 拦截网络请求 - 实现缓存优先策略
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 跳过不应该缓存的URL
  if (SKIP_CACHE_PATTERNS.some(pattern => pattern.test(url))) {
    return;
  }

  // 壁纸请求使用特殊策略（每日更新）
  if (isWallpaperRequest(url)) {
    event.respondWith(wallpaperStrategy(event.request));
    return;
  }

  // 只处理同源请求（非壁纸）
  if (!url.startsWith(self.location.origin)) {
    return;
  }

  // 对于HTML文件，使用缓存优先策略(后台更新)确保快速加载
  if (event.request.destination === 'document') {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          // 后台更新缓存
          const fetchPromise = fetch(event.request)
            .then((response) => {
              if (response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, responseClone);
                });
              }
              return response;
            })
            .catch(() => {
              // 网络错误忽略
            });

          // 如果有缓存，立即返回缓存
          if (cachedResponse) {
            return cachedResponse;
          }

          // 无缓存时等待网络请求
          return fetchPromise.then((response) => {
            if (response && response.status === 200) {
              return response;
            }
            // 如果网络也失败，对于SPA路由返回index.html
            if (event.request.mode === 'navigate') {
              return caches.match(`${basePath}/index.html`);
            }
            // 其他情况返回404页面
            return caches.match(`${basePath}/404.html`);
          });
        })
    );
    return;
  }

  // 对于静态资源（JS/CSS/图片），使用缓存优先策略
  // 带哈希的文件（如 xxx-[hash].js）本身就是版本控制，缓存找不到时自动走网络
  if (event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // 验证缓存响应是否有效
            if (cachedResponse.status === 200 && cachedResponse.headers.get('content-type')) {
              // 有效缓存，后台更新
              fetch(event.request).then((response) => {
                if (response.status === 200) {
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, response.clone());
                  });
                }
              }).catch(() => {
                // 忽略后台更新的网络错误
              });
              return cachedResponse;
            }
            // 缓存无效，删除并走网络
            caches.open(CACHE_NAME).then(cache => cache.delete(event.request));
          }

          // 无缓存或缓存无效，网络请求并缓存
          return fetch(event.request).then((response) => {
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          });
        })
        .catch((error) => {
          console.error('[SW] 静态资源加载失败:', event.request.url, error);
          return new Response('Resource unavailable', { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return;
  }

  // 其他请求直接走网络
  event.respondWith(fetch(event.request));
});

// 获取本地日期字符串 (YYYY-MM-DD)
// 获取中国时间的日期字符串 (YYYY-MM-DD)
// 获取中国时间的日期字符串 (YYYY-MM-DD)
const getChinaDateString = () => {
  const now = new Date();
  // 直接使用 UTC 时间戳 + 8小时
  const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));

  const year = chinaTime.getUTCFullYear();
  const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 壁纸缓存策略 - 支持每日更新
async function wallpaperStrategy(request) {
  const cache = await caches.open(WALLPAPER_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // 获取今天的日期字符串（北京时间）
  const today = getChinaDateString();

  // 检查缓存时间是否为今天
  if (cachedResponse) {
    // 优先使用自定义头，其次使用 HTTP date 头
    let cacheDay = cachedResponse.headers.get('x-cache-date');

    if (!cacheDay) {
      const httpDate = cachedResponse.headers.get('date');
      if (httpDate) {
        cacheDay = new Date(httpDate).toISOString().split('T')[0];
      }
    }

    // 如果缓存是今天的，直接返回
    if (cacheDay === today) {
      console.log('[SW] 使用今日壁纸缓存');
      return cachedResponse;
    }

    // 如果缓存过期或无法判断日期，先返回缓存，后台更新
    console.log('[SW] 壁纸缓存过期或日期未知，后台更新中...');

    // 后台更新（不阻塞返回）
    fetchWithTimeout(request, 15000)
      .then(async networkResponse => {
        if (networkResponse && networkResponse.ok) {
          // 添加自定义缓存日期头
          const headers = new Headers(networkResponse.headers);
          headers.set('x-cache-date', today);

          const responseWithDate = new Response(await networkResponse.blob(), {
            status: networkResponse.status,
            statusText: networkResponse.statusText,
            headers: headers
          });

          cache.put(request, responseWithDate);
          console.log('[SW] 壁纸后台更新成功');
        }
      })
      .catch(error => {
        console.warn('[SW] 壁纸后台更新失败:', error);
      });

    return cachedResponse;
  }

  // 没有缓存，尝试网络请求
  try {
    console.log('[SW] 下载新壁纸...');
    const networkResponse = await fetchWithTimeout(request, 20000); // 壁纸需要更长超时

    if (networkResponse && networkResponse.ok) {
      // 添加自定义缓存日期头
      const headers = new Headers(networkResponse.headers);
      headers.set('x-cache-date', today);

      const responseWithDate = new Response(await networkResponse.clone().blob(), {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: headers
      });

      cache.put(request, responseWithDate);
      console.log('[SW] 壁纸下载并缓存成功');
      return networkResponse;
    }
  } catch (error) {
    console.warn('[SW] 壁纸网络请求失败:', error);
  }

  // 网络失败，返回过期缓存（如果有）
  if (cachedResponse) {
    console.log('[SW] 网络失败，使用过期壁纸缓存');
    return cachedResponse;
  }

  // 没有缓存也没有网络，尝试返回本地默认图片
  console.log('[SW] 壁纸不可用，尝试返回默认图片');
  const defaultImageResponse = await caches.match(`${basePath}/icon/favicon.png`);
  if (defaultImageResponse) {
    return defaultImageResponse;
  }

  // 最后回退：返回透明1x1像素图片
  const transparentPixel = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  return new Response(transparentPixel, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache'
    }
  });
}

// 监听消息事件（用于手动更新缓存）
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(STATIC_CACHE_NAME)
        .then(cache => cache.addAll(event.data.urls))
    );
  }

  if (event.data && event.data.type === 'CLEAR_WALLPAPER_CACHE') {
    event.waitUntil(
      caches.delete(WALLPAPER_CACHE_NAME)
        .then(() => console.log('[SW] 壁纸缓存已清除'))
    );
  }
});