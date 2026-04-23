import { useState, useEffect, useCallback, useMemo } from 'react';
import { WebsiteCard } from '@/components/WebsiteCard';
import { SearchBar } from '@/components/SearchBar';
import { TimeDisplay } from '@/components/TimeDisplay';
import CardEditModal from '@/components/CardEditModal';
// 拖拽逻辑已迁移到 WebsiteCard
import { motion, AnimatePresence } from 'framer-motion';
import { useTransparency } from '@/contexts/TransparencyContext';
import { useAutoSync } from '@/hooks/useAutoSync';
import EmailVerificationBanner from '@/components/EmailVerificationBanner';
import { LazySettings, LazyWorkspaceModal, preloadWorkspaceModal, preloadSettings } from '@/utils/lazyComponents';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { faviconCache } from '@/lib/faviconCache';
import { optimizedWallpaperService } from '@/lib/optimizedWallpaperService';
import { useRAFThrottledMouseMove } from '@/hooks/useRAFThrottle';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { logger } from '@/utils/logger';
import { customWallpaperManager } from '@/lib/customWallpaperManager';
import SnowEffect from '@/components/effects/SnowEffect';
import LeafEffect from '@/components/effects/LeafEffect';
import CherryBlossom from '@/components/effects/CherryBlossom';
import FireflyEffect from '@/components/effects/Firefly';
import OfflineBanner from '@/components/OfflineBanner';
import { isWinterSeason, isAutumnSeason } from '@/utils/solarTerms';
import { shouldApplyOverlay, clearAllColorCache } from '@/utils/imageColorAnalyzer';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

// 暴露给控制台调试用
if (typeof window !== 'undefined') {
  (window as any).clearWallpaperColorCache = clearAllColorCache;
}

const isBrowserBookmark = (website: any) =>
  (typeof website?.id === 'string' && website.id.startsWith('bookmark-')) ||
  (typeof website?.note === 'string' && website.note.startsWith('来自浏览器书签：'));

interface HomeProps {
  websites: any[];
  setWebsites: (websites: any[]) => void;
  dataInitialized?: boolean;
}

export default function Home({ websites, setWebsites, dataInitialized = true }: HomeProps) {
  const {
    parallaxEnabled,
    wallpaperResolution,
    isSettingsOpen,
    autoSortEnabled,
    isSearchFocused,
    cardOpacity,
    cardColor,
    atmosphereMode,
    atmosphereParticleCount,
    atmosphereWindEnabled,
    darkOverlayMode,
    isSlowMotion,
    setIsSlowMotion,
  } = useTransparency();
  const { isWorkspaceOpen, setIsWorkspaceOpen } = useWorkspace();
  const { isMobile, getGridClasses, getSearchBarLayout } = useResponsiveLayout();
  const isOnline = useOnlineStatus(); // 检测网络状态

  // 启用自动同步（传递数据初始化状态）
  const { triggerSync } = useAutoSync(websites, dataInitialized);

  // 拖拽排序逻辑
  const moveCard = useCallback((dragIndex: number, hoverIndex: number) => {
    const newWebsites = [...websites];
    const [removed] = newWebsites.splice(dragIndex, 1);
    newWebsites.splice(hoverIndex, 0, removed);
    setWebsites(newWebsites);
  }, [websites, setWebsites]);

  const [bgImage, setBgImage] = useState('');
  const [bgOriginalUrl, setBgOriginalUrl] = useState<string | undefined>(); // 原始URL用于收藏检测
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false); // 壁纸加载状态
  const [showSettings, setShowSettings] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFavoriting, setIsFavoriting] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isAlreadyFavorited, setIsAlreadyFavorited] = useState(false);
  const [smartOverlayNeeded, setSmartOverlayNeeded] = useState(false); // 智能模式下是否需要遮罩

  // 阻止空白区域右键菜单
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // 检查是否点击在卡片上（卡片内部会处理自己的右键菜单）
      const target = e.target as HTMLElement;
      const isOnCard = target.closest('[data-website-card]');

      // 如果不是在卡片上，阻止默认右键菜单
      if (!isOnCard) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // 鼠标按住空白区域时触发粒子慢放效果
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 检查是否点击在交互元素上（卡片、按钮、输入框、链接等）
      const isInteractiveElement =
        target.closest('[data-website-card]') ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('a') ||
        target.closest('[role="button"]') ||
        target.closest('[data-interactive]');

      // 只有点击在空白区域时才触发慢放
      if (!isInteractiveElement) {
        setIsSlowMotion(true);
      }
    };

    const handleMouseUp = () => {
      setIsSlowMotion(false);
    };

    const handleMouseLeave = () => {
      setIsSlowMotion(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [setIsSlowMotion]);

  // 检查当前壁纸是否已收藏
  useEffect(() => {
    const checkIfFavorited = async () => {
      // 壁纸变化时，重置"刚刚收藏成功"的状态
      setIsFavorited(false);

      if (!bgOriginalUrl || wallpaperResolution === 'custom') {
        setIsAlreadyFavorited(false);
        return;
      }

      const favorited = await customWallpaperManager.isUrlAlreadyFavorited(bgOriginalUrl);
      setIsAlreadyFavorited(favorited);

      console.log('🔍 [收藏状态检查]', {
        bgOriginalUrl: bgOriginalUrl ? '有原始URL' : '无原始URL',
        isAlreadyFavorited: favorited,
      });
    };

    checkIfFavorited();
  }, [bgOriginalUrl, wallpaperResolution]);

  // 调试：监控状态变化
  useEffect(() => {
    console.log('🔍 [收藏按钮调试]', {
      wallpaperResolution,
      bgImage: bgImage ? '有图片' : '无图片',
      bgOriginalUrl: bgOriginalUrl ? bgOriginalUrl : '无原始URL',
      isSearchFocused,
      shouldShow: wallpaperResolution !== 'custom' && bgImage,
      isAlreadyFavorited,
    });
  }, [wallpaperResolution, bgImage, bgOriginalUrl, isSearchFocused, isAlreadyFavorited]);

  // 收藏/取消收藏当前壁纸
  const handleFavoriteWallpaper = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 如果正在操作中，或者没有URL，或者是自定义壁纸，直接返回
    if (isFavoriting || !bgOriginalUrl || wallpaperResolution === 'custom') {
      return;
    }

    setIsFavoriting(true);

    logger.debug('🖱️ 点击壁纸收藏按钮', {
      isAlreadyFavorited,
      bgOriginalUrl,
      wallpaperResolution
    });

    try {
      if (isAlreadyFavorited) {
        // 取消收藏逻辑
        logger.debug('🔄 尝试取消收藏...', { bgOriginalUrl });
        const id = await customWallpaperManager.getWallpaperIdByUrl(bgOriginalUrl);

        if (id) {
          logger.debug('🆔 找到壁纸ID，正在删除', { id });
          const success = await customWallpaperManager.deleteWallpaper(id);
          if (success) {
            setIsAlreadyFavorited(false);
            setIsFavorited(false);
            logger.debug('🗑️ 壁纸取消收藏成功', { id });
          } else {
            logger.warn('❌ 壁纸取消收藏失败');
          }
        } else {
          logger.warn('❌ 无法找到对应壁纸ID，无法取消收藏', { bgOriginalUrl });
          // 强制重置状态，避免UI卡死在已收藏状态
          setIsAlreadyFavorited(false);
          setIsFavorited(false);
        }
      } else {
        // 收藏逻辑
        // 使用原始 Unsplash URL 下载并保存壁纸
        const result = await customWallpaperManager.downloadAndSaveFromUrl(
          bgOriginalUrl, // 使用原始URL而不是Blob URL
          `unsplash-${wallpaperResolution}-${Date.now()}.jpg`
        );

        if (result.success) {
          setIsFavorited(true);
          setIsAlreadyFavorited(true); // 标记为已收藏
          logger.debug('✅ 壁纸收藏成功', { id: result.id });

          // 3秒后隐藏"收藏成功"提示（但保持已收藏状态）
          setTimeout(() => {
            setIsFavorited(false);
          }, 3000);
        } else {
          logger.warn('❌ 壁纸收藏失败', result.error);
          // 如果是重复收藏的错误，更新状态
          if (result.error?.includes('已经在你的收藏中')) {
            setIsAlreadyFavorited(true);
          }
        }
      }
    } catch (error) {
      logger.error('操作壁纸收藏状态时出错', error);
    } finally {
      setIsFavoriting(false);
    }
  };

  // 壁纸加载 - 统一处理挂载和分辨率变化
  // 注意：所有日期检测逻辑都在 optimizedWallpaperService 中统一处理
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        logger.debug('🖼️ 开始加载壁纸，分辨率:', wallpaperResolution);

        // 调用壁纸服务获取壁纸（日期检测和缓存逻辑在服务中统一处理）
        const result = await optimizedWallpaperService.getWallpaper(wallpaperResolution);

        if (result.url) {
          logger.debug(result.isFromCache ? '📦 使用缓存壁纸' : '🌐 加载新壁纸', {
            isToday: result.isToday,
            needsUpdate: result.needsUpdate,
          });

          // 重置加载状态，实现淡入效果
          setWallpaperLoaded(false);

          // 预加载图片
          const img = new Image();
          img.onload = async () => {
            setBgImage(result.url);
            setBgOriginalUrl(result.originalUrl);

            // 智能遮罩模式：分析壁纸颜色（在图片加载完成后进行）
            if (darkOverlayMode === 'smart') {
              try {
                // 自定义壁纸传递 ID，Bing 壁纸不传（使用日期作为缓存键）
                const wallpaperId = wallpaperResolution === 'custom' ? 'current-custom' : undefined;
                const needsOverlay = await shouldApplyOverlay(result.url, wallpaperId);
                setSmartOverlayNeeded(needsOverlay);
                logger.debug('🎨 智能遮罩检测结果:', needsOverlay ? '需要遮罩' : '不需要遮罩');
              } catch (error) {
                logger.warn('壁纸颜色分析失败:', error);
                setSmartOverlayNeeded(false);
              }
            }

            // 延迟一帧设置加载完成，确保transition生效
            requestAnimationFrame(() => {
              setWallpaperLoaded(true);
            });
          };
          img.onerror = () => {
            // 图片加载失败时也设置URL，让浏览器显示默认状态
            setBgImage(result.url);
            setBgOriginalUrl(result.originalUrl);
            setWallpaperLoaded(true);
          };
          img.src = result.url;

          // 如果缓存的不是今天的壁纸，记录警告
          if (!result.isToday && result.isFromCache) {
            logger.warn('⚠️ 使用的是过期壁纸缓存，后台正在更新');
          }
        } else {
          logger.warn('❌ 无法获取壁纸');
          setBgImage('');
          setBgOriginalUrl(undefined);
          setWallpaperLoaded(true); // 确保不会一直透明
        }
      } catch (error) {
        logger.warn('获取壁纸失败:', error);
        setBgImage('');
        setBgOriginalUrl(undefined);
        setWallpaperLoaded(true); // 确保不会一直透明
      }
    };

    loadWallpaper();
  }, [wallpaperResolution]); // 分辨率变化时重新加载

  // 智能遮罩模式切换时重新检测颜色
  useEffect(() => {
    // 只有在智能模式且已有壁纸时才检测
    if (darkOverlayMode === 'smart' && bgImage) {
      const checkColor = async () => {
        try {
          const wallpaperId = wallpaperResolution === 'custom' ? 'current-custom' : undefined;
          const needsOverlay = await shouldApplyOverlay(bgImage, wallpaperId);
          setSmartOverlayNeeded(needsOverlay);
          logger.debug('🎨 模式切换触发颜色检测:', needsOverlay ? '需要遮罩' : '不需要遮罩');
        } catch (error) {
          logger.warn('壁纸颜色分析失败:', error);
          setSmartOverlayNeeded(false);
        }
      };
      checkColor();
    } else if (darkOverlayMode !== 'smart') {
      // 非智能模式时重置状态
      setSmartOverlayNeeded(false);
    }
  }, [darkOverlayMode, bgImage, wallpaperResolution]);

  const regularWebsites = useMemo(
    () => websites.filter((website) => !isBrowserBookmark(website)),
    [websites]
  );

  const browserBookmarks = useMemo(
    () => websites.filter((website) => isBrowserBookmark(website)),
    [websites]
  );

  // 根据设置决定是否自动排序卡片
  const displayWebsites = useMemo(() => {
    return autoSortEnabled
      ? [...regularWebsites].sort((a, b) => {
        // 首先按访问次数降序排序
        const visitDiff = (b.visitCount || 0) - (a.visitCount || 0);
        if (visitDiff !== 0) return visitDiff;

        // 如果访问次数相同，按最后访问时间降序排序
        const dateA = new Date(a.lastVisit || '2000-01-01').getTime();
        const dateB = new Date(b.lastVisit || '2000-01-01').getTime();
        return dateB - dateA;
      })
      : regularWebsites;
  }, [regularWebsites, autoSortEnabled]);

  const bookmarkFolderGroups = useMemo(() => {
    const groups = new Map<string, any[]>();

    browserBookmarks.forEach((website) => {
      const folderName =
        Array.isArray(website.tags) && website.tags[0]?.trim()
          ? website.tags[0].trim()
          : '未分组';

      if (!groups.has(folderName)) {
        groups.set(folderName, []);
      }
      groups.get(folderName)?.push(website);
    });

    return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
  }, [browserBookmarks]);

  const handleSaveCard = useCallback((updatedCard: {
    id: string;
    name: string;
    url: string;
    favicon: string;
    tags: string[];
    note?: string;
    visitCount?: number;
    lastVisit?: string;
  }) => {
    setWebsites(
      websites.map((card) => (card.id === updatedCard.id ? { ...card, ...updatedCard } : card))
    );
  }, [websites, setWebsites]);

  const handleDelete = useCallback((id: string) => {
    setWebsites(websites.filter((card) => card.id !== id));
  }, [websites, setWebsites]);

  const openBookmark = useCallback((bookmark: any) => {
    handleSaveCard({
      ...bookmark,
      visitCount: (bookmark.visitCount || 0) + 1,
      lastVisit: new Date().toISOString().split('T')[0],
    });

    window.open(bookmark.url, '_blank');
  }, [handleSaveCard]);

  // 壁纸加载已在上方统一处理

  // 预加载当前页面的图标
  useEffect(() => {
    if (websites.length > 0) {
      // 延迟预加载，避免阻塞首屏渲染
      const timer = setTimeout(() => {
        faviconCache.preloadFavicons(websites).catch((err) => {
          console.warn('批量预加载图标失败:', err);
        });
      }, 500); // 延迟500ms，确保首屏渲染完成

      return () => clearTimeout(timer);
    }
  }, [websites]);

  // 页面空闲时预加载设置和工作空间组件
  useEffect(() => {
    const preloadComponents = () => {
      // 使用 requestIdleCallback 在浏览器空闲时预加载
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          preloadSettings();
          preloadWorkspaceModal();
        }, { timeout: 3000 }); // 最多等待3秒
      } else {
        // 降级方案：延迟2秒后预加载
        setTimeout(() => {
          preloadSettings();
          preloadWorkspaceModal();
        }, 2000);
      }
    };

    preloadComponents();
  }, []);

  // 优化的鼠标移动处理器 - 使用 RAF 节流
  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, []);

  const throttledMouseMove = useRAFThrottledMouseMove(
    handleMouseMove,
    parallaxEnabled && !isSettingsOpen && !isSearchFocused
  );

  // 监听鼠标移动 - 使用 RAF 节流优化性能
  useEffect(() => {
    // 如果视差被禁用或设置页面打开或搜索框聚焦，不添加鼠标监听器
    if (!parallaxEnabled || isSettingsOpen || isSearchFocused) {
      setMousePosition({ x: 0, y: 0 });
      return;
    }

    window.addEventListener('mousemove', throttledMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', throttledMouseMove);
    };
  }, [parallaxEnabled, isSettingsOpen, isSearchFocused, throttledMouseMove]);

  // 预加载 favicon（已移除，使用下面的 IndexedDB 批量缓存代替）

  // 批量预缓存 favicon（简化版）
  useEffect(() => {
    if (websites.length > 0) {
      // 延迟执行，避免阻塞首屏渲染
      const timer = setTimeout(() => {
        logger.debug('🚀 开始简单批量预缓存 favicon...');
        faviconCache
          .batchCacheFaviconsToIndexedDB(websites)
          .then(() => {
            logger.debug('✅ Favicon 简单批量预缓存完成');
          })
          .catch((error) => {
            logger.warn('❌ Favicon 简单批量预缓存失败:', error);
          });
      }, 2000); // 2秒后开始，确保不影响首屏渲染

      return () => clearTimeout(timer);
    }
  }, [websites]); // 当网站数据变化时触发

  // 响应式布局配置
  const getResponsiveClasses = () => {
    const searchBarLayout = getSearchBarLayout();
    const gridClasses = getGridClasses();

    return {
      container: `relative min-h-[100dvh] ${isMobile ? 'pt-[12vh]' : 'pt-[33vh]'}`,
      searchContainer: searchBarLayout.containerClass,
      cardContainer: `${isMobile ? 'pt-4 pb-4' : 'pt-12 pb-8'} px-2 max-w-7xl mx-auto`,
      gridLayout: gridClasses,
      userInfo: isMobile ? 'fixed top-2 right-2 z-40 scale-90' : 'fixed top-4 right-4 z-40',
      workspaceButton: isMobile ? 'fixed top-2 left-2 z-40 scale-90' : 'fixed top-4 left-4 z-40',
      settingsButton: isMobile
        ? 'fixed bottom-4 right-4 z-[9999] p-3'
        : 'fixed bottom-4 right-4 z-[9999]',
    };
  };

  const classes = getResponsiveClasses();

  return (
    <>
      {/* 离线检测横幅 */}
      <OfflineBanner isOffline={!isOnline} />

      {/* 邮箱验证横幅 */}
      <EmailVerificationBanner />

      {/* 壁纸背景层 - 响应式优化 */}
      <div
        className="fixed top-0 left-0 w-full h-full -z-10"
        style={{
          backgroundImage: bgImage ? `url(${bgImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: isMobile ? 'center center' : 'center top',
          backgroundRepeat: 'no-repeat',
          opacity: wallpaperLoaded ? 1 : 0,
          transform:
            !isSettingsOpen && !isSearchFocused && parallaxEnabled && !isMobile && mousePosition
              ? `translate(${-mousePosition.x * 0.02}px, ${-mousePosition.y * 0.02 + (!isOnline ? 60 : 0)}px) scale(1.05)`
              : `translate(0px, ${!isOnline ? 60 : 0}px) scale(1)`,
          transition: 'opacity 0.5s ease-out, transform 0.3s linear',
        }}
      />



      {/* 黑色遮罩层 - 暗角滤镜效果 */}
      {bgImage && (darkOverlayMode === 'always' || (darkOverlayMode === 'smart' && smartOverlayNeeded)) && (
        <div
          className="fixed top-0 left-0 w-full h-full"
          style={{
            background: 'radial-gradient(ellipse 80% 80% at center, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.15) 40%, rgba(0, 0, 0, 0.4) 70%, rgba(0, 0, 0, 0.7) 100%)',
            zIndex: -9,
            pointerEvents: 'none',
            transform: `translateY(${!isOnline ? 60 : 0}px)`,
            transition: 'opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}

      {/* 雪花氛围效果 - 粒子数 = 档位 * 6 */}
      {(atmosphereMode === 'snow' || (atmosphereMode === 'auto' && isWinterSeason())) && (
        <SnowEffect particleCount={atmosphereParticleCount * 6} windEnabled={atmosphereWindEnabled} isSlowMotion={isSlowMotion} />
      )}

      {/* 落叶氛围效果 - 粒子数 = 档位 * 4 */}
      {(atmosphereMode === 'leaf' || (atmosphereMode === 'auto' && isAutumnSeason())) && (
        <LeafEffect particleCount={atmosphereParticleCount * 4} windEnabled={atmosphereWindEnabled} isSlowMotion={isSlowMotion} />
      )}

      {/* 樱花氛围效果 */}
      {atmosphereMode === 'cherry' && (
        <CherryBlossom particleCount={atmosphereParticleCount * 5} isSlowMotion={isSlowMotion} />
      )}

      {/* 萤火虫氛围效果 */}
      {atmosphereMode === 'firefly' && (
        <FireflyEffect particleCount={atmosphereParticleCount * 2} isSlowMotion={isSlowMotion} />
      )}



      <div className={classes.container}>
        {/* SEO 导航 - 视觉上隐藏但对搜索引擎可见 */}
        <nav className="sr-only">
          <ul>
            <li>
              <a href="#main-content">主要内容</a>
            </li>
            <li>
              <a href="#search">搜索功能</a>
            </li>
            <li>
              <a href="#bookmarks">书签收藏</a>
            </li>
          </ul>
        </nav>

        <div className={`${classes.searchContainer} relative`} id="main-content">
          {/* SEO H1 标签 - 视觉上隐藏但对搜索引擎可见 */}
          <h1 className="sr-only">
            你好呀，这里是一个AI友好的个性化便签页面，创作者：江江 和 claude coze kiro coplit
            页面美观好用，有诸多彩蛋（**新标签页**，**new tab**,**AI tab**,**notion
            tab**,**个性化**，**标签页**）
          </h1>
          {/* SEO 描述段落 - 视觉上隐藏但对搜索引擎可见 */}
          <p className="sr-only">
            这是一个由江江创作的个性化便签页面，结合了 Claude、Coze、Kiro、Copilot 等AI工具的协助。
            页面设计美观实用，包含多个有趣的彩蛋功能，为用户提供优质的书签管理体验。
          </p>
          {/* 时间组件始终渲染，通过透明度控制显示，避免影响布局 */}
          <TimeDisplay />
          <SearchBar websites={websites} onOpenSettings={() => setShowSettings(true)} />
        </div>

        <div className={classes.cardContainer}>
          <motion.div
            className={classes.gridLayout}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {displayWebsites.map((website, idx) => {
              const originalIndex = autoSortEnabled
                ? websites.findIndex((w) => w.id === website.id)
                : idx;

              return (
                <WebsiteCard
                  key={website.id}
                  {...website}
                  index={originalIndex}
                  moveCard={moveCard}
                  onSave={handleSaveCard}
                  onDelete={handleDelete}
                  onCardSave={triggerSync}
                  onAddCard={() => setShowAddCardModal(true)}
                />
              );
            })}
          </motion.div>
        </div>

        <AnimatePresence>
          {showSettings && (
            <LazySettings
              onClose={() => setShowSettings(false)}
              websites={websites}
              setWebsites={setWebsites}
              onSettingsClose={triggerSync}
            />
          )}
        </AnimatePresence>

        {/* 工作空间触发按钮 - 响应式调整 */}
        <motion.div
          className={classes.workspaceButton}
          animate={{
            opacity: isSearchFocused ? 0 : 1,
            scale: isSearchFocused ? 0.8 : 1
          }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          onMouseEnter={preloadWorkspaceModal} // 鼠标悬停时预加载工作空间组件
        >
          <div className="relative min-h-10 min-w-10 group/corner">
            <button
              onClick={() => setIsWorkspaceOpen(true)}
              className="flex items-center justify-center transition-all duration-200 cursor-pointer p-2 opacity-0 group-hover/corner:opacity-100 focus-visible:opacity-100"
            >
              <i
                className={`fa-solid fa-briefcase text-white/70 group-hover/corner:text-white group-hover/corner:drop-shadow-lg transition-all duration-200 ${isMobile ? 'text-sm' : 'text-lg'}`}
              ></i>
            </button>

            {/* 自定义悬停提示 */}
            <div className="absolute left-1/2 transform -translate-x-1/2 top-full mt-2 px-2.5 py-1 bg-gray-900/90 text-white text-[0.7rem] rounded-lg shadow-lg backdrop-blur-sm border border-white/10 whitespace-nowrap opacity-0 group-hover/corner:opacity-100 transition-all duration-200 pointer-events-none z-50">
              工作空间
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900/90"></div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className={isMobile ? 'fixed top-1 right-10 z-40 scale-90' : 'fixed top-2 right-10 z-40'}
          animate={{
            opacity: isSearchFocused ? 0 : 1,
            scale: isSearchFocused ? 0.8 : 1,
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          data-interactive
        >
          <div className="group/bookmarks relative min-h-20 min-w-20">
            <button
              className="absolute right-0 top-0 flex h-14 w-14 items-center justify-center text-white/75 opacity-0 transition-all duration-200 hover:text-white group-hover/bookmarks:opacity-100 focus-visible:opacity-100"
              aria-label="浏览器书签"
            >
              <i className="fa-solid fa-bookmark text-xl drop-shadow"></i>
            </button>

            <div
              className="pointer-events-none absolute right-0 top-14 w-[min(34rem,calc(100vw-1rem))] origin-top-right translate-y-1 pt-3 text-gray-900 opacity-0 transition-all duration-200 group-hover/bookmarks:pointer-events-auto group-hover/bookmarks:translate-y-0 group-hover/bookmarks:opacity-100 group-focus-within/bookmarks:pointer-events-auto group-focus-within/bookmarks:translate-y-0 group-focus-within/bookmarks:opacity-100"
            >
              <div
                className="overflow-hidden rounded-[18px] border border-black/5 bg-[#f1f1ef] shadow-2xl shadow-black/20"
              >
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="text-lg font-medium text-gray-900">书签</div>
                  <div className="flex items-center gap-4 text-gray-600">
                    <i className="fa-solid fa-thumbtack-slash"></i>
                    <i className="fa-solid fa-xmark text-lg"></i>
                  </div>
                </div>

                <div className="px-5 pb-3">
                  <div className="flex h-14 items-center gap-3 rounded-[18px] bg-white px-4 text-gray-500 shadow-sm">
                    <i className="fa-solid fa-magnifying-glass text-lg"></i>
                    <span className="text-base">搜索书签</span>
                  </div>
                </div>

                <div className="rounded-t-[16px] bg-white px-5 py-4">
                  <div className="mb-4 flex items-center gap-5 text-sm text-gray-700">
                    <span className="mr-auto text-xl text-gray-900">所有书签</span>
                    <span>创建时间（从晚到早）</span>
                    <i className="fa-solid fa-filter"></i>
                    <i className="fa-solid fa-table-cells-large"></i>
                    <i className="fa-solid fa-pencil"></i>
                  </div>

                  <button className="mb-3 flex w-full items-center gap-5 rounded-xl px-2 py-2 text-left text-base text-gray-900 hover:bg-gray-100">
                    <i className="fa-solid fa-plus text-lg"></i>
                    <span>新建文件夹</span>
                  </button>

                  {browserBookmarks.length === 0 ? (
                    <div className="rounded-xl bg-[#f1f1ef] px-4 py-4 text-sm leading-relaxed text-gray-700">
                      当前浏览器还没有导入书签。打开设置，进入数据管理，导入浏览器书签 HTML 文件。
                    </div>
                  ) : (
                    <div className="max-h-[62vh] overflow-y-auto pr-1 custom-scrollbar">
                    {bookmarkFolderGroups.map((group) => (
                      <details
                        key={group.name}
                        className="group/folder"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-4 rounded-xl px-2 py-2.5 text-base font-medium text-gray-800 transition-colors hover:bg-[#eeeeec]">
                          <i className="fa-solid fa-chevron-right w-4 text-sm text-gray-700 transition-transform group-open/folder:rotate-90"></i>
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#dfeeda] text-gray-900">
                            <i className="fa-regular fa-folder"></i>
                          </span>
                          <span className="min-w-0 flex-1 truncate">{group.name}</span>
                          <span className="text-gray-500">({group.items.length})</span>
                          <i className="fa-solid fa-ellipsis-vertical text-gray-500 opacity-0 group-hover/folder:opacity-100"></i>
                        </summary>

                        <div className="ml-14 space-y-0.5 pb-1">
                          {group.items.map((bookmark) => (
                            <button
                              key={bookmark.id}
                              onClick={() => openBookmark(bookmark)}
                              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-gray-700 transition-colors hover:bg-[#eeeeec] focus:bg-[#eeeeec] focus:outline-none"
                            >
                              <img
                                src={bookmark.favicon}
                                alt=""
                                className="h-5 w-5 shrink-0 rounded-sm"
                                loading="lazy"
                              />
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {bookmark.name}
                              </span>
                              <i className="fa-solid fa-arrow-up-right-from-square text-xs text-gray-400"></i>
                            </button>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 收藏壁纸按钮 - 右上角，仅在搜索框聚焦且不是自定义壁纸时显示 */}
        {wallpaperResolution !== 'custom' && bgImage && (
          <motion.div
            className={isMobile ? 'fixed top-2 right-2 z-40 scale-90' : 'fixed top-4 right-4 z-40'}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: isSearchFocused ? 1 : 0,
              scale: isSearchFocused ? 1 : 0.8
            }}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="relative min-h-10 min-w-10 group/corner">
              <button
                onClick={handleFavoriteWallpaper}
                onMouseDown={(e) => e.preventDefault()} // 阻止焦点转移，保持搜索框聚焦状态
                disabled={isFavoriting}
                className="flex items-center justify-center transition-all duration-300 cursor-pointer hover:scale-110 disabled:cursor-default opacity-0 group-hover/corner:opacity-100 focus-visible:opacity-100"
              >
                {isFavoriting ? (
                  <i className="fa-solid fa-spinner fa-spin text-white/80 text-lg drop-shadow-lg"></i>
                ) : (
                  <i
                    className={`fa-${isAlreadyFavorited || isFavorited ? 'solid' : 'regular'} fa-heart transition-all duration-300 drop-shadow-lg ${isAlreadyFavorited || isFavorited
                      ? 'text-red-500 text-xl'
                      : 'text-white/70 hover:text-white text-lg'
                      }`}
                  ></i>
                )}
              </button>

              {/* hover提示文字 - 未收藏时 */}
              {!isFavoriting && !isFavorited && !isAlreadyFavorited && (
                <div className="absolute right-0 top-full mt-2 px-4 py-2 bg-gray-900/90 text-white text-sm rounded-lg shadow-lg backdrop-blur-sm border border-white/10 whitespace-nowrap opacity-0 group-hover/corner:opacity-100 transition-all duration-200 pointer-events-none z-50">
                  喜欢此壁纸？点击拿下
                  <div className="absolute bottom-full right-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900/90"></div>
                </div>
              )}

              {/* hover提示文字 - 已收藏时 */}
              {!isFavoriting && isAlreadyFavorited && !isFavorited && (
                <div className="absolute right-0 top-full mt-2 px-4 py-2 bg-red-500/90 text-white text-sm rounded-lg shadow-lg backdrop-blur-sm border border-red-400/30 whitespace-nowrap opacity-0 group-hover/corner:opacity-100 transition-all duration-200 pointer-events-none z-50">
                  ❤️ 已收藏 · 点击取消
                  <div className="absolute bottom-full right-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-red-500/90"></div>
                </div>
              )}

              {/* 收藏成功提示 */}
              {isFavorited && (
                <div className="absolute right-0 top-full mt-2 px-4 py-2 bg-green-500/90 text-white text-sm rounded-lg shadow-lg backdrop-blur-sm border border-green-400/30 whitespace-nowrap z-50">
                  ✅ 已添加到壁纸库
                  <div className="absolute bottom-full right-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-green-500/90"></div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* 设置触发按钮 - 右下角 */}
        <motion.div
          className={classes.settingsButton}
          animate={{
            opacity: isSearchFocused ? 0 : 1,
            scale: isSearchFocused ? 0.8 : 1
          }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          onMouseEnter={preloadSettings} // 鼠标悬停时预加载设置组件
        >
          <div className="relative min-h-10 min-w-10 group/corner">
            <button
              onClick={() => setShowSettings(true)}
              className={`${isMobile ? 'p-2' : 'p-2'} text-white/70 hover:text-white transition-all duration-200 opacity-0 group-hover/corner:opacity-100 focus-visible:opacity-100`}
              aria-label="设置"
            >
              <i className={`fa-solid fa-sliders ${isMobile ? 'text-base' : 'text-lg'}`}></i>
            </button>

            {/* 自定义悬停提示 */}
            <div className="absolute right-1/2 transform translate-x-1/2 bottom-full mb-2 px-2.5 py-1 bg-gray-900/90 text-white text-[0.7rem] rounded-lg shadow-lg backdrop-blur-sm border border-white/10 whitespace-nowrap opacity-0 group-hover/corner:opacity-100 transition-all duration-200 pointer-events-none z-50">
              设置
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900/90"></div>
            </div>
          </div>
        </motion.div>

        {/* 工作空间模态框 */}
        <LazyWorkspaceModal isOpen={isWorkspaceOpen} onClose={() => setIsWorkspaceOpen(false)} />

        {/* 新增卡片模态框 */}
        {showAddCardModal && (
          <CardEditModal
            id=""
            name=""
            url=""
            favicon=""
            tags={[]}
            note=""
            onClose={() => setShowAddCardModal(false)}
            onSave={(data) => {
              // 创建新卡片
              const newCard = {
                ...data,
                id: `card-${Date.now()}`,
                visitCount: 0,
                lastVisit: new Date().toISOString().split('T')[0],
              };
              setWebsites([...websites, newCard]);
              setShowAddCardModal(false);
              triggerSync();
            }}
          />
        )}
      </div>
    </>
  );
}
