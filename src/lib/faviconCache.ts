/**
 * Favicon 文件缓存管理工具
 * 使用 IndexedDB 缓存真正的图标文件，而非 URL
 */

import { indexedDBCache } from './indexedDBCache';
import { createManagedBlobUrl, releaseManagedBlobUrl } from './memoryManager';

interface FaviconMetadata {
  domain: string;
  originalUrl: string;
  timestamp: number;
  expiry: number;
  size: number;
  type: string;
}

interface FaviconCacheStorage {
  [domain: string]: FaviconMetadata;
}

class FaviconCacheManager {
  private metadataKey = 'favicon-metadata';
  private defaultExpiry = 30 * 24 * 60 * 60 * 1000; // 30天缓存（图标很少变化）
  private metadata: FaviconCacheStorage = {};
  private loadingPromises: Map<string, Promise<string>> = new Map();
  private blobUrlCache = new Map<string, string>(); // domain -> blobUrl 映射

  constructor() {
    this.loadMetadata();

    // 预加载所有有效缓存的 Blob URL
    this.preloadBlobUrls();
  }

  /**
   * 从 localStorage 加载元数据
   */
  private loadMetadata(): void {
    try {
      const cached = localStorage.getItem(this.metadataKey);
      if (cached) {
        this.metadata = JSON.parse(cached);
        this.cleanExpiredMetadata();
      }
    } catch (error) {
      console.warn('加载 favicon 元数据失败:', error);
      this.metadata = {};
    }
  }

  /**
   * 预加载所有有效缓存的 Blob URL
   */
  private async preloadBlobUrls(): Promise<void> {
    const now = Date.now();
    const validDomains = Object.entries(this.metadata)
      .filter(([, meta]) => now < meta.expiry)
      .map(([domain]) => domain);

    console.log(`🚀 开始预加载 ${validDomains.length} 个 favicon Blob URL`);

    // 批量预加载，避免阻塞
    const batchSize = 5;
    for (let i = 0; i < validDomains.length; i += batchSize) {
      const batch = validDomains.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (domain) => {
          try {
            // 如果已有 Blob URL 缓存，跳过
            if (this.blobUrlCache.has(domain)) {
              return;
            }

            const cacheKey = this.getFaviconCacheKey(domain);
            const blob = await indexedDBCache.get(cacheKey);

            if (blob) {
              const blobUrl = await createManagedBlobUrl(blob, 'favicon');
              this.blobUrlCache.set(domain, blobUrl);
              console.log(`✅ 预加载 Blob URL: ${domain}`);
            }
          } catch (error) {
            console.warn(`预加载 Blob URL 失败: ${domain}`, error);
          }
        })
      );

      // 小延迟避免阻塞主线程
      if (i + batchSize < validDomains.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    console.log(`🎉 预加载完成，共 ${this.blobUrlCache.size} 个 Blob URL`);
  }

  /**
   * 保存元数据到 localStorage
   */
  private saveMetadata(): void {
    try {
      localStorage.setItem(this.metadataKey, JSON.stringify(this.metadata));
    } catch (error) {
      console.warn('保存 favicon 元数据失败:', error);
    }
  }

  /**
   * 清理过期的元数据
   */
  private cleanExpiredMetadata(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [domain, item] of Object.entries(this.metadata)) {
      if (now > item.expiry) {
        toDelete.push(domain);
        // 同时清理 IndexedDB 中的文件
        this.deleteFaviconFile(domain).catch(console.warn);
      }
    }

    toDelete.forEach((domain) => {
      delete this.metadata[domain];
    });

    if (toDelete.length > 0) {
      this.saveMetadata();
    }
  }

  /**
   * 从 URL 提取域名
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    }
  }

  /**
   * 生成 favicon 缓存键
   */
  private getFaviconCacheKey(domain: string): string {
    return `favicon-file:${domain}`;
  }

  /**
   * 获取 favicon 的备用 URL 列表
   * 首选自建 Supabase Edge Function（带 Storage 缓存 + CORS 头），失败再降级到公共代理。
   */
  private getFaviconUrls(originalUrl: string, domain: string): string[] {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const edgeFunctionUrls = supabaseUrl
      ? [
          `${supabaseUrl}/functions/v1/favicon-service?domain=${encodeURIComponent(domain)}&size=64`,
          `${supabaseUrl}/functions/v1/favicon-service?domain=${encodeURIComponent(domain)}&size=32`,
        ]
      : [];

    return [
      ...edgeFunctionUrls,

      // Fallback：公共 CORS 代理（Edge Function 不可用时兜底）
      `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://favicon.im/${domain}?larger=true&size=64`)}`,
      `https://corsproxy.io/?${encodeURIComponent(`https://favicon.im/${domain}?larger=true&size=64`)}`,

      // 最后使用原始 URL（如果提供）
      ...(originalUrl && !originalUrl.includes('favicon.im') ? [originalUrl] : []),
    ];
  }

  /**
   * 下载并缓存 favicon 文件
   */
  private async downloadAndCacheFavicon(urls: string[], domain: string): Promise<string> {
    for (const url of urls) {
      try {
        console.log(`🔄 尝试下载 favicon: ${domain} -> ${url}`);

        // 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

        const response = await fetch(url, {
          mode: 'cors',
          credentials: 'omit',
          headers: {
            Accept: 'image/*,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (compatible; FaviconBot/1.0)',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();

        // 验证是否为有效图片
        if (!blob.type.startsWith('image/') || blob.size < 100) {
          throw new Error('无效的图片文件');
        }

        // 保存到 IndexedDB
        const cacheKey = this.getFaviconCacheKey(domain);
        await indexedDBCache.set(cacheKey, blob, this.defaultExpiry);

        // 保存元数据
        this.metadata[domain] = {
          domain,
          originalUrl: url,
          timestamp: Date.now(),
          expiry: Date.now() + this.defaultExpiry,
          size: blob.size,
          type: blob.type,
        };
        this.saveMetadata();

        // 释放旧的 Blob URL（如果存在）- 增强安全检查
        const oldBlobUrl = this.blobUrlCache.get(domain);
        if (oldBlobUrl && oldBlobUrl.startsWith('blob:')) {
          try {
            releaseManagedBlobUrl(oldBlobUrl);
            this.blobUrlCache.delete(domain);
            console.log(`🗑️ 安全释放旧的 Blob URL: ${domain}`);
          } catch (error) {
            console.warn(`释放旧 Blob URL 失败: ${domain}`, error);
            // 即使释放失败，也要从缓存中删除引用
            this.blobUrlCache.delete(domain);
          }
        }

        // 创建新的 Blob URL 并使用内存管理器
        const blobUrl = await createManagedBlobUrl(blob, 'favicon');
        this.blobUrlCache.set(domain, blobUrl);
        console.log(`✅ Favicon 文件缓存成功: ${domain} (${(blob.size / 1024).toFixed(1)}KB)`);

        return blobUrl;
      } catch (error) {
        console.log(`❌ Favicon 下载失败: ${domain} -> ${url} (${error})`);

        // 如果是代理URL失败，记录并继续尝试直接URL
        if (url.includes('api.allorigins.win')) {
          console.log(`🔄 代理服务失败，将尝试直接访问`);
        }
        continue;
      }
    }

    // 所有尝试失败，返回默认图标
    console.log(`🔄 所有 favicon 尝试失败，使用默认图标: ${domain}`);
    return '/icon/favicon.png';
  }

  /**
   * 从缓存中获取 favicon 文件 - 增强错误处理
   */
  private async getCachedFaviconFile(domain: string): Promise<string | null> {
    try {
      // 检查元数据
      const meta = this.metadata[domain];
      if (!meta || Date.now() > meta.expiry) {
        return null;
      }

      // 从 IndexedDB 获取文件
      const cacheKey = this.getFaviconCacheKey(domain);
      const blob = await indexedDBCache.get(cacheKey);

      if (blob) {
        console.log(`📁 使用缓存 favicon 文件: ${domain} (${(blob.size / 1024).toFixed(1)}KB)`);

        // 检查是否已有 Blob URL 缓存
        const existingBlobUrl = this.blobUrlCache.get(domain);
        if (existingBlobUrl && existingBlobUrl.startsWith('blob:')) {
          return existingBlobUrl;
        }

        // 创建新的 Blob URL 并使用内存管理器
        try {
          const blobUrl = await createManagedBlobUrl(blob, 'favicon');
          this.blobUrlCache.set(domain, blobUrl);
          return blobUrl;
        } catch (blobError) {
          console.warn(`创建 Blob URL 失败: ${domain}`, blobError);
          return null;
        }
      }
    } catch (error) {
      console.warn(`读取 favicon 缓存失败: ${domain}`, error);

      // 如果是 IndexedDB 错误，尝试清理损坏的元数据
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        (error as Error).name === 'InvalidStateError'
      ) {
        try {
          delete this.metadata[domain];
          this.saveMetadata();
          console.log(`清理损坏的元数据: ${domain}`);
        } catch (cleanupError) {
          console.warn(`清理元数据失败: ${domain}`, cleanupError);
        }
      }
    }

    return null;
  }

  /**
   * 安全地释放 Blob URL
   */
  private safeBlobUrlCleanup(domain: string): void {
    const blobUrl = this.blobUrlCache.get(domain);
    if (blobUrl && blobUrl.startsWith('blob:')) {
      try {
        releaseManagedBlobUrl(blobUrl);
        this.blobUrlCache.delete(domain);
        console.log(`🗑️ 安全清理 Blob URL: ${domain}`);
      } catch (error) {
        console.warn(`清理 Blob URL 失败: ${domain}`, error);
        // 强制从缓存中删除，避免内存泄漏
        this.blobUrlCache.delete(domain);
      }
    }
  }

  /**
   * 删除 favicon 文件缓存
   */
  private async deleteFaviconFile(domain: string): Promise<void> {
    try {
      // 安全地释放 Blob URL
      this.safeBlobUrlCleanup(domain);

      const cacheKey = this.getFaviconCacheKey(domain);
      await indexedDBCache.delete(cacheKey);
      console.log(`🗑️ 删除过期 favicon 缓存: ${domain}`);
    } catch (error) {
      console.warn(`删除 favicon 缓存失败: ${domain}`, error);
    }
  }

  /**
   * 获取缓存的 favicon URL（同步检查，优先返回 Blob URL）
   */
  getCachedFavicon(url: string): string | null {
    const domain = this.extractDomain(url);

    // 优先检查 Blob URL 缓存
    const blobUrl = this.blobUrlCache.get(domain);
    if (blobUrl) {
      console.log(`🚀 使用 Blob URL 缓存: ${domain}`);
      return blobUrl;
    }

    // 检查元数据缓存
    const meta = this.metadata[domain];
    if (meta && Date.now() < meta.expiry) {
      // 有有效的缓存元数据，返回原始URL表示已缓存
      return meta.originalUrl;
    }

    return null;
  }

  /**
   * 异步获取 favicon（文件缓存优先版）
   */
  async getFavicon(originalUrl: string, faviconUrl: string): Promise<string> {
    const domain = this.extractDomain(originalUrl);

    // 优先检查文件缓存
    const cached = await this.getCachedFaviconFile(domain);
    if (cached) {
      return cached;
    }

    // 如果网络不可用，直接返回默认图标
    if (!navigator.onLine) {
      console.log(`🔌 网络不可用，使用默认图标: ${domain}`);
      return '/icon/favicon.png';
    }

    // 检查是否正在加载
    if (this.loadingPromises.has(domain)) {
      return this.loadingPromises.get(domain)!;
    }

    // 开始下载和缓存
    const loadingPromise = this.loadAndCacheFavicon(faviconUrl, domain);
    this.loadingPromises.set(domain, loadingPromise);

    try {
      const result = await loadingPromise;
      return result;
    } finally {
      this.loadingPromises.delete(domain);
    }
  }

  /**
   * 下载并缓存 favicon（简化版）
   */
  private async loadAndCacheFavicon(faviconUrl: string, domain: string): Promise<string> {
    const urls = this.getFaviconUrls(faviconUrl, domain);

    try {
      const result = await this.downloadAndCacheFavicon(urls, domain);
      return result;
    } catch (error) {
      console.warn(`获取 favicon 失败: ${domain}`, error);
      return '/icon/favicon.png';
    }
  }

  /**
   * 增强的获取 favicon 方法（使用文件缓存）
   */
  async getFaviconWithIndexedDB(originalUrl: string, faviconUrl: string): Promise<string> {
    return this.getFavicon(originalUrl, faviconUrl);
  }

  /**
   * 文件缓存策略
   */
  async getFaviconWithHybridCache(originalUrl: string, faviconUrl: string): Promise<string> {
    return this.getFavicon(originalUrl, faviconUrl);
  }

  /**
   * 轻量级预加载方法 - 只预加载没有缓存的图标
   */
  async preloadFavicons(websites: Array<{ url: string; favicon: string }>): Promise<void> {
    const uncachedWebsites = websites.filter((website) => {
      const cached = this.getCachedFavicon(website.url);
      return !cached;
    });

    if (uncachedWebsites.length === 0) {
      console.log('📦 所有图标都已缓存，跳过预加载');
      return;
    }

    console.log(`🚀 开始预加载 ${uncachedWebsites.length} 个未缓存的图标`);

    // 分批预加载，避免同时发起太多请求
    const batchSize = 3;
    for (let i = 0; i < uncachedWebsites.length; i += batchSize) {
      const batch = uncachedWebsites.slice(i, i + batchSize);

      // 并行处理当前批次
      await Promise.allSettled(
        batch.map(async (website) => {
          try {
            await this.getFavicon(website.url, website.favicon);
          } catch (error) {
            console.warn(`预加载图标失败: ${website.url}`, error);
          }
        })
      );

      // 批次间延迟，避免过度占用网络资源
      if (i + batchSize < uncachedWebsites.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log('✅ 图标预加载完成');
  }

  /**
   * 批量缓存 favicon（文件缓存版）
   */
  async batchCacheFaviconsToIndexedDB(
    websites: Array<{ url: string; favicon: string }>
  ): Promise<void> {
    console.log(`🚀 开始批量文件缓存 ${websites.length} 个 favicon`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    const BATCH_SIZE = 3; // 减少并发数，避免过多网络请求

    for (let i = 0; i < websites.length; i += BATCH_SIZE) {
      const batch = websites.slice(i, i + BATCH_SIZE);

      const promises = batch.map(async (site, index) => {
        const domain = this.extractDomain(site.url);

        try {
          // 检查是否已有文件缓存
          const cached = await this.getCachedFaviconFile(domain);
          if (cached) {
            skipCount++;
            return;
          }

          // 添加延迟避免请求过于频繁，减少429错误
          const delay = (index + 1) * 1200; // 增加延迟到1.2秒
          await new Promise((resolve) => setTimeout(resolve, delay));

          console.log(`🔄 [${i + index + 1}/${websites.length}] 处理: ${domain}`);

          const result = await this.getFavicon(site.url, site.favicon);
          if (result && result !== '/icon/favicon.png') {
            successCount++;
            console.log(`✅ 文件缓存成功: ${domain}`);
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
          console.warn(`❌ 批量文件缓存失败: ${domain}`, error);
        }
      });

      await Promise.allSettled(promises);

      // 批次间停顿
      if (i + BATCH_SIZE < websites.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    console.log(`✅ 批量 favicon 文件缓存完成:`);
    console.log(`   成功: ${successCount}, 跳过: ${skipCount}, 失败: ${errorCount}`);
  }

  /**
   * 清理过期的 Blob URL - 增强安全性
   */
  cleanupExpiredBlobUrls(): void {
    const now = Date.now();
    const expiredDomains: string[] = [];

    for (const [domain, meta] of Object.entries(this.metadata)) {
      if (now > meta.expiry) {
        expiredDomains.push(domain);
      }
    }

    let cleanedCount = 0;
    for (const domain of expiredDomains) {
      try {
        this.safeBlobUrlCleanup(domain);
        cleanedCount++;
      } catch (error) {
        console.warn(`清理过期域名失败: ${domain}`, error);
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 清理完成，删除 ${cleanedCount} 个过期 Blob URL`);
    }
  }

  /**
   * 清理所有缓存 - 增强安全性
   */
  async clearCache(): Promise<void> {
    console.log('🧹 开始清理所有 favicon 缓存...');

    // 清理所有文件缓存
    const domains = Object.keys(this.metadata);
    let cleanedFiles = 0;
    let cleanedBlobs = 0;

    for (const domain of domains) {
      try {
        await this.deleteFaviconFile(domain);
        cleanedFiles++;
      } catch (error) {
        console.warn(`清理域名缓存失败: ${domain}`, error);
      }
    }

    // 清理所有 Blob URL 缓存
    for (const [domain] of this.blobUrlCache) {
      try {
        this.safeBlobUrlCleanup(domain);
        cleanedBlobs++;
      } catch (error) {
        console.warn(`清理 Blob URL 失败: ${domain}`, error);
      }
    }

    // 清理内存数据结构
    this.metadata = {};
    this.loadingPromises.clear();
    this.blobUrlCache.clear();

    // 清理 localStorage
    try {
      localStorage.removeItem(this.metadataKey);
    } catch (error) {
      console.warn('清理 localStorage 失败:', error);
    }

    console.log(`✅ favicon 缓存清理完成: 文件=${cleanedFiles}, Blob=${cleanedBlobs}`);
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { total: number; expired: number; totalSize: string } {
    const now = Date.now();
    const total = Object.keys(this.metadata).length;
    const expired = Object.values(this.metadata).filter((item) => now > item.expiry).length;

    const totalSize = Object.values(this.metadata).reduce((sum, item) => sum + (item.size || 0), 0);

    const sizeStr =
      totalSize > 1024 * 1024
        ? `${(totalSize / 1024 / 1024).toFixed(1)} MB`
        : `${(totalSize / 1024).toFixed(1)} KB`;

    return { total, expired, totalSize: sizeStr };
  }
}

// 导出单例实例
export const faviconCache = new FaviconCacheManager();
