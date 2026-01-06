// 优化的壁纸服务 - 解决白屏问题，提升加载体验
// 使用浏览器原生 Blob API 处理图片数据
import { indexedDBCache } from './indexedDBCache';
import { logger } from './logger';
import { errorHandler } from './errorHandler';
import { memoryManager } from './memoryManager';
import { createWallpaperRequest } from './requestManager';
import { createTimeoutSignal } from './abortUtils';
import { customWallpaperManager } from './customWallpaperManager';
import { getLocalDateString } from './dateUtils';

// 重试相关配置 - 指数退避策略
const RETRY_DELAYS_MS = [30 * 1000, 60 * 1000, 120 * 1000, 240 * 1000]; // 30s, 60s, 120s, 240s
const MAX_RETRY_COUNT = 8;

class OptimizedWallpaperService {
  private static instance: OptimizedWallpaperService;
  private loadingPromises = new Map<
    string,
    Promise<{
      url: string;
      isFromCache: boolean;
      isToday: boolean;
      needsUpdate: boolean;
    }>
  >();
  private fallbackImage = '/icon/favicon.png'; // 本地备用图片
  private cleanupTimer: number | null = null; // 定时清理器ID
  private retryTimers = new Map<string, number>(); // 重试定时器
  private retryCounts = new Map<string, number>(); // 内存中的重试计数

  static getInstance(): OptimizedWallpaperService {
    if (!OptimizedWallpaperService.instance) {
      OptimizedWallpaperService.instance = new OptimizedWallpaperService();
      // 启动定时清理
      OptimizedWallpaperService.instance.startCleanupTimer();
    }
    return OptimizedWallpaperService.instance;
  }

  // 启动定时清理和每日检查
  private startCleanupTimer(): void {
    if (this.cleanupTimer !== null) {
      return; // 已经启动了
    }

    logger.wallpaper.info('启动定时清理任务（每6小时）和每日检查');

    // 立即执行一次清理检查
    this.performDailyCheck().catch((error) => {
      logger.wallpaper.warn('初始每日检查失败', error);
    });

    this.cleanupTimer = setInterval(
      () => {
        // 执行清理和每日检查
        Promise.all([
          this.cleanupExpiredCache(),
          this.performDailyCheck()
        ]).catch((error) => {
          logger.wallpaper.error('定期清理和检查失败', error);
        });
      },
      6 * 60 * 60 * 1000
    ) as any; // 6小时

    // 页面关闭时清理定时器
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.stopCleanupTimer();
      });

      // 页面可见时检查是否需要更新壁纸
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.onPageVisible();
        }
      });
    }
  }

  // 页面变为可见时的处理
  private onPageVisible(): void {
    // 检查今天是否有成功的壁纸更新记录
    const resolutions = ['1080p', '720p', '4k', 'mobile'];
    for (const resolution of resolutions) {
      const successKey = `wallpaper-update-success-${resolution}`;
      const lastSuccess = localStorage.getItem(successKey);
      const today = getLocalDateString();

      if (lastSuccess !== today) {
        // 今天还没成功更新过，尝试更新
        logger.wallpaper.info(`页面可见，检查 ${resolution} 壁纸是否需要更新`);
        this.updateWallpaperInBackground(resolution).catch((error) => {
          logger.wallpaper.warn(`可见性触发更新 ${resolution} 失败`, error);
        });
      }
    }
  }

  // 停止定时清理
  private stopCleanupTimer(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.wallpaper.info('停止定时清理任务');
    }
  }

  // 获取中国时间的日期字符串 (YYYY-MM-DD)
  // 已迁移到共享的 dateUtils.ts，这里保留包装方法以保持 API 兼容
  private getLocalDateString(date: Date = new Date()): string {
    return getLocalDateString(date);
  }

  // 获取今天的缓存键 - 基于本地时间
  private getTodayCacheKey(resolution: string): string {
    const today = this.getLocalDateString();
    return `wallpaper-optimized:${resolution}-${today}`;
  }

  // 检查是否需要强制刷新（跨天检查）- 只检查不设置标记
  // 标记会在成功下载后由 markUpdateSuccess 设置
  private shouldForceRefresh(resolution: string): boolean {
    const successKey = `wallpaper-update-success-${resolution}`;
    const lastSuccessDate = localStorage.getItem(successKey);
    const today = getLocalDateString();

    // 如果今天还没成功更新过，需要刷新
    if (!lastSuccessDate || lastSuccessDate !== today) {
      return true;
    }
    return false;
  }

  // 标记今天的壁纸更新成功
  private markUpdateSuccess(resolution: string): void {
    const successKey = `wallpaper-update-success-${resolution}`;
    const today = getLocalDateString();
    localStorage.setItem(successKey, today);
    logger.wallpaper.info(`标记 ${resolution} 壁纸更新成功: ${today}`);

    // 清除重试定时器和重试计数
    const retryKey = `retry-${resolution}`;
    if (this.retryTimers.has(retryKey)) {
      clearTimeout(this.retryTimers.get(retryKey));
      this.retryTimers.delete(retryKey);
    }
    // 清除内存中的重试计数
    this.retryCounts.delete(resolution);
  }

  // 安排延迟重试（指数退避策略）
  private scheduleRetry(resolution: string): void {
    const retryKey = `retry-${resolution}`;

    // 避免重复安排
    if (this.retryTimers.has(retryKey)) {
      return;
    }

    // 获取并增加重试计数（内存中）
    const retryCount = this.retryCounts.get(resolution) || 0;

    // 检查是否超过最大重试次数
    if (retryCount >= MAX_RETRY_COUNT) {
      logger.wallpaper.warn(`${resolution} 壁纸已达到最大重试次数 (${MAX_RETRY_COUNT})，停止重试`);
      return;
    }

    // 循环使用延迟数组：30s, 60s, 120s, 240s, 30s, 60s, 120s, 240s
    const delayIndex = retryCount % RETRY_DELAYS_MS.length;
    const delayMs = RETRY_DELAYS_MS[delayIndex];
    logger.wallpaper.info(`安排 ${resolution} 壁纸 ${delayMs / 1000} 秒后重试 (第 ${retryCount + 1}/${MAX_RETRY_COUNT} 次)`);

    const timerId = setTimeout(() => {
      this.retryTimers.delete(retryKey);
      // 更新重试计数
      this.retryCounts.set(resolution, retryCount + 1);
      logger.wallpaper.info(`执行 ${resolution} 壁纸延迟重试 (第 ${retryCount + 1}/${MAX_RETRY_COUNT} 次)`);
      this.updateWallpaperInBackground(resolution).catch((error) => {
        logger.wallpaper.warn(`延迟重试 ${resolution} 失败`, error);
      });
    }, delayMs) as any;

    this.retryTimers.set(retryKey, timerId);
  }

  // 执行每日检查 - 确保壁纸是最新的
  private async performDailyCheck(): Promise<void> {
    try {
      const today = this.getLocalDateString();
      const lastCheckKey = 'wallpaper-daily-check';
      const lastCheck = localStorage.getItem(lastCheckKey);

      if (lastCheck === today) {
        return; // 今天已经检查过了
      }

      logger.wallpaper.info('执行每日壁纸检查');

      // 标记今天已检查
      localStorage.setItem(lastCheckKey, today);

      // 检查所有分辨率是否需要更新
      const resolutions = ['1080p', '720p', '4k', 'mobile'];

      for (const resolution of resolutions) {
        const todayKey = this.getTodayCacheKey(resolution);
        const todayCache = await indexedDBCache.get(todayKey);

        if (!todayCache) {
          // 没有今天的缓存，触发后台下载
          logger.wallpaper.info(`后台预加载 ${resolution} 壁纸`);
          this.updateWallpaperInBackground(resolution).catch((error) => {
            logger.wallpaper.warn(`后台预加载 ${resolution} 失败`, error);
          });
        }
      }

      // 清理过期缓存
      await this.cleanupExpiredCache();

    } catch (error) {
      logger.wallpaper.warn('每日检查失败', error);
    }
  }

  // 获取昨天的缓存键（用于降级）
  private getYesterdayCacheKey(resolution: string): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return `wallpaper-optimized:${resolution}-${this.getLocalDateString(yesterday)}`;
  }

  // 移除未使用的方法

  // 获取Supabase壁纸URL
  private async getWallpaperUrl(resolution: string): Promise<string> {
    try {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');

      if (supabaseUrl) {
        const resolutionMap = {
          '4k': 'uhd',
          '1080p': '1920x1080',
          '720p': '1366x768',
          mobile: 'mobile',
        };

        const targetResolution =
          resolutionMap[resolution as keyof typeof resolutionMap] || '1920x1080';

        // 🔧 修复: 添加日期参数以避免浏览器缓存 (Edge Function 返回 12h 缓存头)
        // 使用中国时区的日期，确保每天产生一个新的 URL
        const today = this.getLocalDateString();
        return `${supabaseUrl}/functions/v1/wallpaper-service?resolution=${targetResolution}&date=${today}`;
      }
    } catch (error) {
      logger.wallpaper.warn('Supabase壁纸服务访问失败', error);
    }

    return this.fallbackImage;
  }

  // 智能获取缓存（今天 > 昨天 > 更早）
  private async getSmartCache(
    resolution: string
  ): Promise<{ url: string; isToday: boolean; originalUrl?: string } | null> {
    try {
      // 注意：BlobURL由memoryManager统一管理生命周期，不需要手动检测有效性

      // 1. 优先尝试今天的缓存
      const todayKey = this.getTodayCacheKey(resolution);
      const todayCache = (await indexedDBCache.get(todayKey)) as Blob;

      if (todayCache) {
        logger.wallpaper.info('使用今天的壁纸缓存');
        const originalUrl = await this.getOriginalUrl(todayKey);
        // 每次都重新创建BlobURL，确保有效性
        return {
          url: await memoryManager.createBlobUrl(todayCache, 'wallpaper'),
          isToday: true,
          originalUrl,
        };
      }

      // 2. 尝试昨天的缓存作为降级
      const yesterdayKey = this.getYesterdayCacheKey(resolution);
      const yesterdayCache = (await indexedDBCache.get(yesterdayKey)) as Blob;

      if (yesterdayCache) {
        logger.wallpaper.info('使用昨天的壁纸缓存作为降级');
        const originalUrl = await this.getOriginalUrl(yesterdayKey);
        return {
          url: await memoryManager.createBlobUrl(yesterdayCache, 'wallpaper'),
          isToday: false,
          originalUrl,
        };
      }

      // 3. 尝试任何可用的壁纸缓存
      const allKeys = await indexedDBCache.getAllKeys();
      const wallpaperKeys = allKeys.filter(
        (key) => key.startsWith('wallpaper-optimized:') && key.includes(resolution) && !key.includes('-metadata')
      );

      if (wallpaperKeys.length > 0) {
        // 按时间排序，使用最新的
        wallpaperKeys.sort().reverse();
        const latestKey = wallpaperKeys[0];
        const latestCache = (await indexedDBCache.get(latestKey)) as Blob;

        if (latestCache) {
          logger.wallpaper.info('使用最新可用的壁纸缓存', { key: latestKey });
          const originalUrl = await this.getOriginalUrl(latestKey);
          return {
            url: await memoryManager.createBlobUrl(latestCache, 'wallpaper'),
            isToday: false,
            originalUrl,
          };
        }
      }
    } catch (error) {
      logger.wallpaper.warn('获取智能缓存失败', error);
    }

    return null;
  }

  // 获取缓存的原始 URL
  private async getOriginalUrl(cacheKey: string): Promise<string | undefined> {
    try {
      const metadataKey = `${cacheKey}-metadata`;
      const metadataBlob = (await indexedDBCache.get(metadataKey)) as Blob;

      if (metadataBlob) {
        const text = await metadataBlob.text();
        const metadata = JSON.parse(text);
        return metadata.originalUrl;
      }
    } catch (error) {
      logger.wallpaper.debug('读取壁纸元数据失败', error);
    }
    return undefined;
  }

  // 下载并缓存壁纸
  private async downloadAndCache(
    url: string,
    resolution: string
  ): Promise<{ blobUrl: string; originalUrl: string; isFallback?: boolean }> {
    try {
      logger.wallpaper.info('开始下载壁纸', { url: url.substring(0, 50) });

      // 使用代理处理CORS
      const proxyUrl =
        url.includes('bing.com') || url.includes('unsplash.com')
          ? `https://corsproxy.io/?${encodeURIComponent(url)}`
          : url;

      // 准备请求头
      const headers: Record<string, string> = { Accept: 'image/*' };

      // 如果是Supabase边缘函数，添加Authorization头
      if (url.includes('supabase.co/functions')) {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (anonKey) {
          headers['Authorization'] = `Bearer ${anonKey}`;
          logger.wallpaper.debug('添加Supabase认证头');
        }
      }

      // 使用请求管理器下载
      const response = await createWallpaperRequest(proxyUrl, {
        mode: 'cors',
        headers,
        signal: createTimeoutSignal(12000), // 12秒超时
      });

      // 检查响应Content-Type
      const contentType = response.headers.get('Content-Type') || '';

      // 如果响应是JSON（错误响应），记录详细信息
      if (contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          logger.wallpaper.error('边缘函数返回错误响应', {
            status: response.status,
            error: errorData,
          });
          throw new Error(`边缘函数返回错误: ${errorData.error || '未知错误'}`);
        } catch (parseError) {
          logger.wallpaper.error('解析错误响应失败', parseError);
          throw new Error('边缘函数返回了无效的错误响应');
        }
      }

      // 服务端现在不再返回 fallback，获取失败会返回 503 错误
      // 保留基本的数据验证检测
      const blob = await response.blob();

      // 验证blob是否有效
      if (blob.size === 0) {
        throw new Error('下载的壁纸数据为空');
      }

      // 🔧 从响应头读取壁纸源 URL（Edge Function 返回的 X-Wallpaper-Source）
      // 注意：当 Edge Function 从 Supabase Storage 缓存返回时，值可能是 'cache' 而不是 URL
      let wallpaperSourceUrl = response.headers.get('X-Wallpaper-Source') || '';

      // 如果 X-Wallpaper-Source 不是有效的 URL（例如是 'cache'），尝试从本地元数据读取
      const isValidUrl = wallpaperSourceUrl.startsWith('http://') || wallpaperSourceUrl.startsWith('https://');
      if (!isValidUrl) {
        // 尝试读取本地缓存的元数据
        const cacheKey = this.getTodayCacheKey(resolution);
        const existingOriginalUrl = await this.getOriginalUrl(cacheKey);
        if (existingOriginalUrl) {
          logger.wallpaper.debug('从本地元数据获取 originalUrl', { existingOriginalUrl });
          wallpaperSourceUrl = existingOriginalUrl;
        } else {
          // 没有本地元数据，使用请求 URL 作为降级
          logger.wallpaper.warn('无法获取真正的壁纸源 URL，使用请求 URL 作为降级', {
            headerValue: response.headers.get('X-Wallpaper-Source'),
          });
          wallpaperSourceUrl = url;
        }
      }

      // 基本验证：4K壁纸应该至少 500KB
      if (resolution === '4k' && blob.size < 500 * 1024) {
        logger.wallpaper.warn(`4K壁纸大小异常 (${Math.round(blob.size / 1024)}KB)，跳过缓存`);
        const blobUrl = await memoryManager.createBlobUrl(blob, 'wallpaper');
        return { blobUrl, originalUrl: wallpaperSourceUrl, isFallback: true };
      }

      const blobUrl = await memoryManager.createBlobUrl(blob, 'wallpaper');

      logger.wallpaper.debug('壁纸源 URL', {
        requestUrl: url,
        actualSourceUrl: wallpaperSourceUrl,
      });

      // 异步缓存到IndexedDB（保存 Blob）
      const cacheKey = this.getTodayCacheKey(resolution);
      indexedDBCache
        .set(cacheKey, blob, 48 * 60 * 60 * 1000) // 48小时缓存
        .then(() => logger.wallpaper.info('壁纸已缓存到IndexedDB'))
        .catch((error) => logger.wallpaper.warn('缓存壁纸失败', error));

      // 保存真正的壁纸源 URL 元数据（用于收藏功能去重）
      const metadataKey = `${cacheKey}-metadata`;
      indexedDBCache
        .set(
          metadataKey,
          new Blob([JSON.stringify({ originalUrl: wallpaperSourceUrl })], { type: 'application/json' }),
          48 * 60 * 60 * 1000
        )
        .then(() => logger.wallpaper.info('壁纸元数据已缓存', { originalUrl: wallpaperSourceUrl }))
        .catch((error) => logger.wallpaper.warn('缓存元数据失败', error));

      logger.wallpaper.info('壁纸下载完成', {
        size: `${(blob.size / 1024 / 1024).toFixed(2)}MB`,
        originalUrl: wallpaperSourceUrl,
      });

      return { blobUrl, originalUrl: wallpaperSourceUrl, isFallback: false };
    } catch (error) {
      logger.wallpaper.error('下载壁纸失败', error);
      throw error;
    }
  }


  // 主要方法：获取壁纸（优化的加载策略）
  async getWallpaper(resolution: string): Promise<{
    url: string;
    isFromCache: boolean;
    isToday: boolean;
    needsUpdate: boolean;
    originalUrl?: string; // 原始 URL（非 Blob URL）
  }> {
    const cacheKey = `loading-${resolution}`;

    // 防止重复加载
    if (this.loadingPromises.has(cacheKey)) {
      const result = await this.loadingPromises.get(cacheKey)!;
      logger.wallpaper.debug('返回正在加载的壁纸结果', {
        resolution,
        isFromCache: result.isFromCache,
      });
      return result;
    }

    const loadingPromise = this._getWallpaperInternal(resolution);
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      const result = await loadingPromise;
      return result;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  private async _getWallpaperInternal(resolution: string): Promise<{
    url: string;
    isFromCache: boolean;
    isToday: boolean;
    needsUpdate: boolean;
    originalUrl?: string;
  }> {
    try {
      // 0. 如果是自定义壁纸，直接返回（每次从 IndexedDB 生成新的 Blob URL）
      if (resolution === 'custom') {
        const customUrl = await customWallpaperManager.getCurrentWallpaper();
        if (customUrl) {
          logger.wallpaper.info('使用自定义壁纸（从 IndexedDB 重新生成 Blob URL）');
          return {
            url: customUrl,
            isFromCache: true,
            isToday: true,
            needsUpdate: false,
          };
        } else {
          // 没有自定义壁纸，使用备用图片
          logger.wallpaper.warn('未找到自定义壁纸，使用备用图片');
          return {
            url: this.fallbackImage,
            isFromCache: false,
            isToday: true,
            needsUpdate: false,
          };
        }
      }

      // 0.1 检查是否需要强制刷新（跨天检查）
      const shouldRefresh = this.shouldForceRefresh(resolution);

      // 🔧 修复: 先获取旧缓存作为降级备用，不要立即删除
      // 只有成功下载新壁纸后才清理旧缓存
      let fallbackCache: { url: string; isToday: boolean; originalUrl?: string } | null = null;

      // 无论是否需要刷新，都先获取缓存（用于降级或直接使用）
      const cachedResult = await this.getSmartCache(resolution);

      if (shouldRefresh) {
        logger.wallpaper.info('检测到跨天或今天未成功更新，尝试获取新壁纸');
        // 🔧 修复: 如果有旧缓存，立即返回旧缓存，后台异步下载新壁纸
        // 这样用户不会看到黑灰色背景等待下载
        if (cachedResult) {
          logger.wallpaper.info('有旧缓存可用，先返回旧缓存，后台下载新壁纸');
          // 后台异步下载新壁纸（不等待）
          this.updateWallpaperInBackground(resolution).catch((error) => {
            logger.wallpaper.warn('后台更新壁纸失败', error);
          });
          // 立即返回旧缓存
          return {
            url: cachedResult.url,
            isFromCache: true,
            isToday: cachedResult.isToday, // 使用缓存的实际日期状态
            needsUpdate: true,
            originalUrl: cachedResult.originalUrl,
          };
        }
        // 没有旧缓存，只能等待下载（fallbackCache 保持为 null）
        logger.wallpaper.info('无旧缓存可用，需等待下载新壁纸');
      } else {
        // 1. 如果不需要刷新，尝试使用智能缓存
        if (cachedResult) {
          // 🔧 检查旧缓存是否缺少 originalUrl（旧版本的缓存）
          if (!cachedResult.originalUrl && cachedResult.isToday) {
            logger.wallpaper.warn('⚠️ 检测到今天的缓存缺少 originalUrl，清除并重新下载');
            await this.clearTodayCache(resolution);
            // 保存缓存作为降级备用，然后继续下载
            fallbackCache = cachedResult;
          } else if (cachedResult.originalUrl) {
            // 有 originalUrl 的缓存，正常返回
            const result = {
              url: cachedResult.url,
              isFromCache: true,
              isToday: cachedResult.isToday,
              needsUpdate: !cachedResult.isToday,
              originalUrl: cachedResult.originalUrl,
            };

            // 如果不是今天的缓存，后台更新
            if (!cachedResult.isToday) {
              logger.wallpaper.info('后台更新今天的壁纸');
              this.updateWallpaperInBackground(resolution).catch((error) => {
                logger.wallpaper.warn('后台更新壁纸失败', error);
              });
            }

            return result;
          } else {
            // 旧缓存但不是今天的，先用着但标记需要更新
            logger.wallpaper.warn('⚠️ 使用旧缓存壁纸（无 originalUrl），将后台更新');
            const result = {
              url: cachedResult.url,
              isFromCache: true,
              isToday: cachedResult.isToday,
              needsUpdate: true,
              originalUrl: cachedResult.originalUrl, // undefined
            };

            // 后台更新以获取新壁纸和 originalUrl
            this.updateWallpaperInBackground(resolution).catch((error) => {
              logger.wallpaper.warn('后台更新壁纸失败', error);
            });

            return result;
          }
        }
      }

      // 2. 需要下载新壁纸（无缓存或需要刷新）
      logger.wallpaper.info(shouldRefresh ? '跨天刷新，开始下载新壁纸' : '无可用缓存，开始下载新壁纸');
      const wallpaperUrl = await this.getWallpaperUrl(resolution);

      if (wallpaperUrl === this.fallbackImage) {
        // Supabase 服务不可用，尝试使用旧缓存
        if (fallbackCache) {
          logger.wallpaper.warn('壁纸服务不可用，使用旧缓存作为降级');
          return {
            url: fallbackCache.url,
            isFromCache: true,
            isToday: false,
            needsUpdate: true,
            originalUrl: fallbackCache.originalUrl,
          };
        }
        // 使用本地备用图片
        return {
          url: wallpaperUrl,
          isFromCache: false,
          isToday: true,
          needsUpdate: false,
        };
      }

      try {
        const downloaded = await this.downloadAndCache(wallpaperUrl, resolution);

        // 🔧 修复: 只有真正的 Bing 壁纸才标记成功，fallback 则安排重试
        if (!downloaded.isFallback) {
          this.markUpdateSuccess(resolution);

          // 🔧 修复: 下载成功后才清理旧缓存
          if (shouldRefresh) {
            logger.wallpaper.info('新壁纸下载成功，清理旧缓存');
            // 清理昨天的缓存
            const yesterdayKey = this.getYesterdayCacheKey(resolution);
            await indexedDBCache.delete(yesterdayKey);
            await indexedDBCache.delete(`${yesterdayKey}-metadata`);
          }
        } else {
          logger.wallpaper.warn('下载到fallback壁纸，安排后台重试');
          this.scheduleRetry(resolution);
        }

        return {
          url: downloaded.blobUrl,
          isFromCache: false,
          isToday: true,
          needsUpdate: downloaded.isFallback || false, // 如果是 fallback，标记需要更新
          originalUrl: downloaded.originalUrl,
        };
      } catch (downloadError) {
        // 🔧 修复: 下载失败时，使用旧缓存作为降级，而不是直接返回 fallbackImage
        logger.wallpaper.warn('下载新壁纸失败', downloadError);

        if (fallbackCache) {
          logger.wallpaper.info('使用旧缓存作为降级显示');
          // 安排后台重试
          this.scheduleRetry(resolution);
          return {
            url: fallbackCache.url,
            isFromCache: true,
            isToday: false,
            needsUpdate: true,
            originalUrl: fallbackCache.originalUrl,
          };
        }

        // 没有旧缓存可用，抛出错误让外层处理
        throw downloadError;
      }

    } catch (error) {
      const errorInfo = errorHandler.handleError(error as Error, 'wallpaper-load');
      logger.wallpaper.error('获取壁纸失败，使用备用图片', errorInfo);

      return {
        url: this.fallbackImage,
        isFromCache: false,
        isToday: true,
        needsUpdate: true, // 🔧 修复: 标记需要更新，后续会重试
      };
    }
  }

  // 后台更新壁纸
  private async updateWallpaperInBackground(resolution: string): Promise<void> {
    try {
      const wallpaperUrl = await this.getWallpaperUrl(resolution);
      if (wallpaperUrl !== this.fallbackImage) {
        const result = await this.downloadAndCache(wallpaperUrl, resolution);

        // 🔧 修复: 只有真正的 Bing 壁纸才标记成功
        // Fallback 壁纸不设置成功标记，允许后续重试获取真正的壁纸
        if (result.blobUrl && !result.isFallback) {
          this.markUpdateSuccess(resolution);
          logger.wallpaper.info('后台壁纸更新完成（非fallback）');
        } else if (result.isFallback) {
          logger.wallpaper.warn('后台更新获取到fallback壁纸，安排重试');
          this.scheduleRetry(resolution);
        }
      }
    } catch (error) {
      logger.wallpaper.warn('后台壁纸更新失败，安排重试', error);
      // 🔧 修复: 失败时安排延迟重试
      this.scheduleRetry(resolution);
    }
  }


  // 预加载壁纸（在空闲时间）
  async preloadWallpapers(): Promise<void> {
    if (!('requestIdleCallback' in window)) {
      return; // 不支持空闲回调的浏览器跳过预加载
    }

    const resolutions = ['1080p', '720p', '4k', 'mobile'];

    for (const resolution of resolutions) {
      await new Promise<void>((resolve) => {
        requestIdleCallback(async () => {
          try {
            const cached = await this.getSmartCache(resolution);
            if (!cached || !cached.isToday) {
              logger.wallpaper.debug(`预加载 ${resolution} 壁纸`);
              await this.getWallpaper(resolution);
            }
          } catch (error) {
            logger.wallpaper.warn(`预加载 ${resolution} 壁纸失败`, error);
          }
          resolve();
        });
      });
    }
  }

  // 清理过期缓存
  async cleanupExpiredCache(): Promise<void> {
    try {
      const allKeys = await indexedDBCache.getAllKeys();
      const wallpaperKeys = allKeys.filter((key) => key.startsWith('wallpaper-optimized:'));

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const cutoffDate = this.getLocalDateString(threeDaysAgo);

      let deletedCount = 0;

      for (const key of wallpaperKeys) {
        const dateMatch = key.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch && dateMatch[1] < cutoffDate) {
          await indexedDBCache.delete(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.wallpaper.info(`清理了 ${deletedCount} 个过期壁纸缓存`);
      }
    } catch (error) {
      logger.wallpaper.warn('清理过期缓存失败', error);
    }
  }

  // 清理特定日期的缓存
  async clearCacheForDate(resolution: string, date?: string): Promise<void> {
    try {
      const dateStr = date || this.getLocalDateString();
      const cacheKey = `wallpaper-optimized:${resolution}-${dateStr}`;

      await indexedDBCache.delete(cacheKey);
      logger.wallpaper.info('已清理指定日期的壁纸缓存', { key: cacheKey });
    } catch (error) {
      logger.wallpaper.warn('清理指定日期缓存失败', error);
    }
  }

  // 清理今天的缓存
  async clearTodayCache(resolution: string): Promise<void> {
    await this.clearCacheForDate(resolution);
  }

  // 获取缓存统计
  async getCacheStats(): Promise<{
    totalCount: number;
    todayCount: number;
    totalSize: number;
    cacheKeys: string[];
  }> {
    try {
      const allKeys = await indexedDBCache.getAllKeys();
      const wallpaperKeys = allKeys.filter((key) => key.startsWith('wallpaper-optimized:'));

      const today = this.getLocalDateString();
      const todayKeys = wallpaperKeys.filter((key) => key.includes(today));

      let totalSize = 0;
      for (const key of wallpaperKeys) {
        try {
          const blob = (await indexedDBCache.get(key)) as Blob;
          if (blob) {
            totalSize += blob.size;
          }
        } catch (error) {
          // 忽略单个文件的错误
        }
      }

      return {
        totalCount: wallpaperKeys.length,
        todayCount: todayKeys.length,
        totalSize,
        cacheKeys: wallpaperKeys,
      };
    } catch (error) {
      logger.wallpaper.warn('获取缓存统计失败', error);
      return { totalCount: 0, todayCount: 0, totalSize: 0, cacheKeys: [] };
    }
  }
}

// 导出单例
export const optimizedWallpaperService = OptimizedWallpaperService.getInstance();

// 页面空闲时预加载壁纸
if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  requestIdleCallback(() => {
    optimizedWallpaperService.preloadWallpapers().catch((error) => {
      logger.wallpaper.error('预加载壁纸失败', error);
    });
  });
}
