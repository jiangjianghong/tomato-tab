import { useState, useEffect, useRef } from 'react';
import { faviconCache } from '@/lib/faviconCache';
import { isDefaultIcon } from '@/lib/iconPath';
import { releaseManagedBlobUrl, memoryManager } from '@/lib/memoryManager';
import { processFaviconUrl } from '@/lib/faviconUtils';

/**
 * 使用 favicon 缓存的 Hook（极简版 - 防止切换）
 * @param originalUrl 网站原始 URL
 * @param faviconUrl favicon URL
 * @returns { faviconUrl: string, isLoading: boolean, error: boolean }
 */
export function useFavicon(originalUrl: string, faviconUrl: string) {
  const [currentFaviconUrl, setCurrentFaviconUrl] = useState<string>(() => {
    // 初始化仅做“探测”（acquire=false，不加引用），用于首屏即时绘制；
    // 该 Blob url 的引用所有权由下方“认领”effect 在挂载时统一获取，确保与卸载配对。
    const cached = faviconCache.getCachedFavicon(originalUrl);
    if (cached && !isDefaultIcon(cached)) {
      console.log(`🚀 初始化使用缓存图标: ${originalUrl} -> ${cached.substring(0, 50)}...`);
      return cached;
    }
    return processFaviconUrl(faviconUrl, originalUrl, faviconUrl);
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const currentBlobUrlRef = useRef<string | null>(null);

  // 清理当前的 Blob URL
  const cleanupCurrentBlobUrl = () => {
    if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
      releaseManagedBlobUrl(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  };

  // 认领（获取所有权）当前展示的 Blob URL 引用：
  // 挂载时，若当前展示的是来自缓存的 Blob url 且尚未持有引用，则向缓存
  // 重新“acquire”一份（getCachedFavicon(_, true) 会 addRef +1）并记入 ref，
  // 卸载时由 cleanup effect release 一次 → 严格“+1 配 -1”。
  // 这样首次挂载与 StrictMode 卸载后重挂载完全对称，无需特殊标记。
  useEffect(() => {
    if (!currentBlobUrlRef.current && currentFaviconUrl.startsWith('blob:')) {
      const owned = faviconCache.getCachedFavicon(originalUrl, true);
      if (owned && owned.startsWith('blob:')) {
        currentBlobUrlRef.current = owned;
        // 极少数情况下重挂载后缓存里的 url 已变（重新下载），同步展示
        if (owned !== currentFaviconUrl) {
          setCurrentFaviconUrl(owned);
        }
      }
    }
    // 仅依赖 originalUrl：切换网站时重新认领
  }, [originalUrl]);

  // 立即检查缓存的 effect（无防抖）
  useEffect(() => {
    const checkImmediateCache = async () => {
      // 探测（不加引用）判断是否有更优缓存
      const cached = faviconCache.getCachedFavicon(originalUrl);
      if (cached && !isDefaultIcon(cached) && cached !== currentFaviconUrl) {
        console.log(`⚡ 立即使用缓存图标: ${originalUrl}`);
        const processedUrl = processFaviconUrl(cached, originalUrl, faviconUrl);
        // 先释放旧引用，再为新展示的 Blob url 获取一份引用（+1），与卸载配对
        cleanupCurrentBlobUrl();
        setCurrentFaviconUrl(processedUrl);
        if (processedUrl.startsWith('blob:')) {
          memoryManager.addRef(processedUrl);
          currentBlobUrlRef.current = processedUrl;
        } else {
          currentBlobUrlRef.current = null;
        }
        setError(false);
        setIsLoading(false);
      }
    };

    checkImmediateCache();
  }, [originalUrl]); // 只依赖 originalUrl，避免频繁触发

  useEffect(() => {
    // 防抖：避免在短时间内频繁更新
    const timeoutId = setTimeout(() => {
      // 处理传入的 faviconUrl，如果是有 CORS 问题的 URL 则使用代理
      const processedFaviconUrl = processFaviconUrl(faviconUrl, originalUrl, faviconUrl);

      // 智能缓存策略：只有在以下情况才尝试缓存优化
      // 1. faviconUrl 是默认图标（需要替换）
      // 2. 或者是 Google favicon 服务但没有时间戳参数（说明是旧的自动生成的）
      const isDefaultIconUrl = isDefaultIcon(faviconUrl);

      // 先检查是否有缓存（探测，不加引用）
      const cached = faviconCache.getCachedFavicon(originalUrl);

      if (cached && !isDefaultIcon(cached)) {
        // 有有效缓存，直接使用
        console.log('📦 使用缓存图标:', originalUrl);
        const cachedProcessedUrl = processFaviconUrl(cached, originalUrl, faviconUrl);
        if (currentFaviconUrl !== cachedProcessedUrl) {
          cleanupCurrentBlobUrl();
          setCurrentFaviconUrl(cachedProcessedUrl);
          if (cachedProcessedUrl.startsWith('blob:')) {
            // 为新展示的 Blob url 获取一份引用（+1），与卸载 release 配对
            memoryManager.addRef(cachedProcessedUrl);
            currentBlobUrlRef.current = cachedProcessedUrl;
          } else {
            currentBlobUrlRef.current = null;
          }
        }
        setError(false);
        setIsLoading(false);
        return;
      }

      // 如果当前URL已经不是默认图标，且没有更好的缓存，就不要改变
      if (!isDefaultIcon(currentFaviconUrl) && !cached) {
        return;
      }

      // 更新当前URL（如果需要）
      if (currentFaviconUrl !== processedFaviconUrl) {
        cleanupCurrentBlobUrl();
        setCurrentFaviconUrl(processedFaviconUrl);
        currentBlobUrlRef.current = processedFaviconUrl.startsWith('blob:')
          ? processedFaviconUrl
          : null;
      }
      setError(false);
      setIsLoading(false);

      // 只有默认图标才尝试异步获取更好的图标（避免过度请求）
      if (isDefaultIconUrl && !cached) {
        setIsLoading(true);
        faviconCache
          // acquire=true：本 hook 会持有返回的 Blob url 并在卸载时 release，
          // 命中缓存时需 addRef 配对；新建路径 createManagedBlobUrl 自带 +1。
          .getFavicon(originalUrl, faviconUrl, true)
          .then((url: string) => {
            if (url !== faviconUrl && !isDefaultIcon(url)) {
              console.log('✅ 获取到更好的图标:', url);
              const processedUrl = processFaviconUrl(url, originalUrl, faviconUrl);
              cleanupCurrentBlobUrl();
              setCurrentFaviconUrl(processedUrl);
              currentBlobUrlRef.current = processedUrl.startsWith('blob:') ? processedUrl : null;
            } else {
              // 未采用返回结果：若拿到的是带引用的 Blob url，需释放，避免泄漏
              if (url && url.startsWith('blob:')) {
                releaseManagedBlobUrl(url);
              }
            }
            setError(false);
          })
          .catch((err: any) => {
            console.warn('Favicon 优化失败:', err);
            setError(true);
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }, 100); // 100ms 防抖

    return () => clearTimeout(timeoutId);
  }, [originalUrl, faviconUrl]);

  // 组件卸载时清理 Blob URL
  useEffect(() => {
    return () => {
      cleanupCurrentBlobUrl();
    };
  }, []);

  return {
    faviconUrl: currentFaviconUrl,
    isLoading,
    error,
  };
}
