import { useState, useEffect, useRef, RefObject } from 'react';
import { faviconCache } from '@/lib/faviconCache';
import { isDefaultIcon } from '@/lib/iconPath';
import { releaseManagedBlobUrl, memoryManager } from '@/lib/memoryManager';
import { processFaviconUrl } from '@/lib/faviconUtils';

interface UseLazyFaviconOptions {
  /** IntersectionObserver root margin (default: '50px') */
  rootMargin?: string;
  /** IntersectionObserver threshold (default: 0.1) */
  threshold?: number;
}

/**
 * 使用 favicon 缓存的 Hook，支持懒加载
 * @param originalUrl 网站原始 URL
 * @param faviconUrl favicon URL
 * @param elementRef 元素引用，用于 IntersectionObserver
 * @param options 懒加载选项
 * @returns { faviconUrl: string, isLoading: boolean, error: boolean }
 */
export function useLazyFavicon(
  originalUrl: string,
  faviconUrl: string,
  elementRef: RefObject<HTMLElement>,
  options: UseLazyFaviconOptions = {}
) {
  const { rootMargin = '50px', threshold = 0.1 } = options;

  const [currentFaviconUrl, setCurrentFaviconUrl] = useState<string>(() => {
    // 初始化仅做“探测”（acquire=false，不加引用），用于即时绘制；
    // Blob url 的引用所有权由下方“认领”effect 在挂载时统一获取，与卸载配对。
    const cached = faviconCache.getCachedFavicon(originalUrl);
    if (cached && !isDefaultIcon(cached)) {
      return cached;
    }
    return processFaviconUrl(faviconUrl, originalUrl, faviconUrl);
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const currentBlobUrlRef = useRef<string | null>(null);
  const hasStartedLoading = useRef(false);

  // 清理当前的 Blob URL
  const cleanupCurrentBlobUrl = () => {
    if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
      releaseManagedBlobUrl(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  };

  // 认领（获取所有权）当前展示的 Blob URL 引用：
  // 挂载时若展示的是缓存 Blob url 且尚未持有引用，则 acquire 一份（+1）记入 ref，
  // 卸载时 release 一次 → 严格“+1 配 -1”，首次挂载与 StrictMode 重挂载对称。
  useEffect(() => {
    if (!currentBlobUrlRef.current && currentFaviconUrl.startsWith('blob:')) {
      const owned = faviconCache.getCachedFavicon(originalUrl, true);
      if (owned && owned.startsWith('blob:')) {
        currentBlobUrlRef.current = owned;
        if (owned !== currentFaviconUrl) {
          setCurrentFaviconUrl(owned);
        }
      }
    }
  }, [originalUrl]);

  // IntersectionObserver effect
  useEffect(() => {
    if (!elementRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasStartedLoading.current) {
          setIsVisible(true);
          hasStartedLoading.current = true;
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [elementRef, rootMargin, threshold]);

  // 立即检查缓存的 effect（只在可见时执行）
  useEffect(() => {
    if (!isVisible) return;

    const checkImmediateCache = async () => {
      const cached = faviconCache.getCachedFavicon(originalUrl);
      if (cached && !isDefaultIcon(cached) && cached !== currentFaviconUrl) {
        const processedUrl = processFaviconUrl(cached, originalUrl, faviconUrl);
        cleanupCurrentBlobUrl();
        setCurrentFaviconUrl(processedUrl);
        if (processedUrl.startsWith('blob:')) {
          // 为新展示的 Blob url 获取一份引用（+1），与卸载 release 配对
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
  }, [originalUrl, isVisible]);

  // 主要的 favicon 加载逻辑（只在可见时执行）
  useEffect(() => {
    if (!isVisible) return;

    const timeoutId = setTimeout(() => {
      const processedFaviconUrl = processFaviconUrl(faviconUrl, originalUrl, faviconUrl);
      const isDefaultIconUrl = isDefaultIcon(faviconUrl);
      const cached = faviconCache.getCachedFavicon(originalUrl);

      if (cached && !isDefaultIcon(cached)) {
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

      if (!isDefaultIcon(currentFaviconUrl) && !cached) {
        return;
      }

      if (currentFaviconUrl !== processedFaviconUrl) {
        cleanupCurrentBlobUrl();
        setCurrentFaviconUrl(processedFaviconUrl);
        currentBlobUrlRef.current = processedFaviconUrl.startsWith('blob:')
          ? processedFaviconUrl
          : null;
      }
      setError(false);
      setIsLoading(false);

      if (isDefaultIconUrl && !cached) {
        setIsLoading(true);
        faviconCache
          // acquire=true：本 hook 会持有返回的 Blob url 并在卸载时 release，
          // 命中缓存时需 addRef 配对；新建路径 createManagedBlobUrl 自带 +1。
          .getFavicon(originalUrl, faviconUrl, true)
          .then((url: string) => {
            if (url !== faviconUrl && !isDefaultIcon(url)) {
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
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [originalUrl, faviconUrl, isVisible]);

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
    isVisible,
  };
}
