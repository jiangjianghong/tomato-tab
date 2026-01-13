import { useState, useRef, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import CardEditModal from '@/components/CardEditModal';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import AuthForm from '@/components/AuthForm';
import PrivacySettings from '@/components/PrivacySettings';
import AccountSecurityModal from '@/components/AccountSecurityModal';
import ConfirmModal from '@/components/ConfirmModal';
import { ColorPicker } from '@/components/ColorPicker';
import UserStatsDisplay from '@/components/UserStatsDisplay';
import { userStatsManager } from '@/hooks/useUserStats';
import { useTransparency, WallpaperResolution } from '@/contexts/TransparencyContext';
import { customWallpaperManager } from '@/lib/customWallpaperManager';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSyncStatus } from '@/contexts/SyncContext';
import AccountSettingsSection from '@/components/AccountSettingsSection';
import versionInfo from '@/version.json';

import {
  WebsiteData,
  UserSettings,
  saveUserSettings,
  getUserSettings,
  saveUserWebsites,
  getUserWebsites,
} from '@/lib/supabaseSync';
import { useDataManager } from '@/hooks/useDataManager';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { faviconCache } from '@/lib/faviconCache';

interface SettingsProps {
  onClose: () => void;
  websites: WebsiteData[];
  setWebsites: (websites: WebsiteData[]) => void;
  onSettingsClose?: () => void; // 可选的关闭回调，用于触发同步
}

const SECTIONS = [
  { id: 'account', label: '账号管理', icon: 'fa-user' },
  { id: 'sync', label: '云端同步', icon: 'fa-cloud' },
  { id: 'appearance', label: '外观设置', icon: 'fa-palette' },
  { id: 'theme', label: '主题显示', icon: 'fa-moon' },
  { id: 'wallpaper', label: '壁纸设置', icon: 'fa-image' },
  { id: 'features', label: '基础功能', icon: 'fa-cogs' },
  { id: 'interaction', label: '交互体验', icon: 'fa-wand-magic-sparkles' },
  { id: 'time', label: '时间设置', icon: 'fa-clock' },
  { id: 'cards', label: '卡片管理', icon: 'fa-layer-group' },
  { id: 'data', label: '数据管理', icon: 'fa-database' },
  { id: 'privacy', label: '隐私帮助', icon: 'fa-shield-halved' },
];

function SettingsComponent({ onClose, websites, setWebsites, onSettingsClose }: SettingsProps) {
  const { isMobile } = useResponsiveLayout();
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [showAccountSecurityModal, setShowAccountSecurityModal] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [isFixingIcons, setIsFixingIcons] = useState(false);
  const [fixIconsMessage, setFixIconsMessage] = useState('');

  // 自定义壁纸相关状态
  const [customWallpaperInfo, setCustomWallpaperInfo] = useState<{
    exists: boolean;
    size?: number;
    sizeText?: string;
  }>({ exists: false });
  const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isGlobalDragOver, setIsGlobalDragOver] = useState(false);
  const [wallpapers, setWallpapers] = useState<
    Array<{ metadata: any; thumbnailUrl: string; isActive: boolean }>
  >([]);
  const [showWallpaperGallery, setShowWallpaperGallery] = useState(false);
  const [activeSection, setActiveSection] = useState('account');
  const sectionsRef = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const isManualScrolling = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToSection = (id: string) => {
    const element = sectionsRef.current[id];
    const container = document.getElementById('settings-content-scroll-container');

    if (element && container) {
      // 设置手动滚动标志
      isManualScrolling.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // 立即更新 active 状态
      setActiveSection(id);

      // 自定义滚动逻辑
      const start = container.scrollTop;
      // 计算目标位置：元素的相对位置 + 当前滚动位置 - 顶部偏移（如果有padding）
      // 这里直接使用 offsetTop 可能不准，改用 getBoundingClientRect 计算相对差值
      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top;
      const offset = 32; // 顶部留出 32px 的间距
      const target = start + relativeTop - offset;
      const distance = target - start;
      const duration = 1200; // 更长的持续时间，1.2秒
      let startTime: number | null = null;

      // 缓动函数: easeInOutCubic (先加速后减速)
      const easeInOutCubic = (t: number) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      const animation = (currentTime: number) => {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const progress = Math.min(timeElapsed / duration, 1);
        const ease = easeInOutCubic(progress);

        container.scrollTop = start + distance * ease;

        if (timeElapsed < duration) {
          requestAnimationFrame(animation);
        } else {
          // 动画结束，稍微延迟后释放锁，防止惯性误触
          scrollTimeoutRef.current = setTimeout(() => {
            isManualScrolling.current = false;
          }, 100);
        }
      };

      requestAnimationFrame(animation);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isManualScrolling.current) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        root: document.getElementById('settings-content-scroll-container'),
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0
      }
    );

    Object.values(sectionsRef.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);
  const [previewWallpaper, setPreviewWallpaper] = useState<{
    metadata: any;
    fullImageUrl: string;
  } | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showUserStatsModal, setShowUserStatsModal] = useState(false);

  // 记录上一次选择的必应壁纸分辨率，用于切换回必应模式时恢复
  const [lastBingResolution, setLastBingResolution] = useState<WallpaperResolution>('1080p');

  // 使用统一的数据管理Hook
  const { exportAllData, importAllData, isExporting, isImporting } = useDataManager(
    websites,
    setWebsites
  );
  const {
    cardOpacity,
    searchBarOpacity,
    parallaxEnabled,
    wallpaperResolution,
    cardColor,
    searchBarColor,
    autoSyncEnabled,
    autoSyncInterval,
    searchInNewTab,
    autoSortEnabled,
    timeComponentEnabled,
    showFullDate,
    showSeconds,
    showWeekday,
    showYear,
    showMonth,
    showDay,
    searchBarBorderRadius,
    animationStyle,
    setCardOpacity,
    setSearchBarOpacity,
    setParallaxEnabled,
    setWallpaperResolution,
    setIsSettingsOpen,
    setCardColor,
    setSearchBarColor,
    setAutoSyncEnabled,
    setAutoSyncInterval,
    setSearchInNewTab,
    setAutoSortEnabled,
    setTimeComponentEnabled,
    setShowFullDate,
    setShowSeconds,
    setShowWeekday,
    setShowYear,
    setShowMonth,
    setShowDay,
    setSearchBarBorderRadius,
    setAnimationStyle,
    workCountdownEnabled,
    lunchTime,
    offWorkTime,
    setWorkCountdownEnabled,
    setLunchTime,
    setOffWorkTime,
    aiIconDisplayMode,
    setAiIconDisplayMode,
    atmosphereMode,
    setAtmosphereMode,
    atmosphereParticleCount,
    setAtmosphereParticleCount,
    atmosphereWindEnabled,
    setAtmosphereWindEnabled,
    darkOverlayMode,
    setDarkOverlayMode,
    darkMode,
    darkModePreference,
    setDarkModePreference,
    darkModeScheduleStart,
    setDarkModeScheduleStart,
    darkModeScheduleEnd,
    setDarkModeScheduleEnd,
  } = useTransparency();

  const { currentUser } = useAuth();
  const { updateSyncStatus } = useSyncStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);


  // 记录非自定义模式下的分辨率选择
  useEffect(() => {
    if (wallpaperResolution !== 'custom') {
      setLastBingResolution(wallpaperResolution);
    }
  }, [wallpaperResolution]);

  // 记录设置页面打开次数
  useEffect(() => {
    userStatsManager.recordSettingsOpen();
  }, []);

  // 加载自定义壁纸信息
  useEffect(() => {
    const loadCustomWallpaperInfo = async () => {
      const info = await customWallpaperManager.getWallpaperInfo();
      setCustomWallpaperInfo(info);
    };
    loadCustomWallpaperInfo();
    loadWallpapers(); // 同时加载壁纸列表
  }, []);

  // 加载壁纸列表
  const loadWallpapers = async () => {
    try {
      const list = await customWallpaperManager.getAllWallpapers();
      setWallpapers(list);
    } catch (error) {
      console.error('加载壁纸列表失败:', error);
    }
  };

  // 全局拖拽检测
  useEffect(() => {
    let dragCounter = 0;

    const handleGlobalDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;

      // 检查是否拖拽的是图片文件
      const items = Array.from(e.dataTransfer?.items || []);
      const hasImageFile = items.some((item) => item.type.startsWith('image/'));

      if (hasImageFile && !uploadingWallpaper) {
        setIsGlobalDragOver(true);
      }
    };

    const handleGlobalDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;

      if (dragCounter === 0) {
        setIsGlobalDragOver(false);
      }
    };

    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsGlobalDragOver(false);
    };

    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    document.addEventListener('dragenter', handleGlobalDragEnter);
    document.addEventListener('dragleave', handleGlobalDragLeave);
    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('drop', handleGlobalDrop);

    return () => {
      document.removeEventListener('dragenter', handleGlobalDragEnter);
      document.removeEventListener('dragleave', handleGlobalDragLeave);
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, [uploadingWallpaper]);

  // 处理文件上传的通用逻辑
  const processWallpaperFile = async (file: File) => {
    if (!file) return;

    setUploadingWallpaper(true);

    try {
      const result = await customWallpaperManager.uploadWallpaper(file);

      if (result.success && result.id) {
        setSyncMessage('✅ 自定义壁纸上传成功！页面即将刷新...');

        // 延迟后刷新页面以应用新壁纸
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        setSyncMessage(result.error || '上传失败');
        setTimeout(() => setSyncMessage(''), 3000);
        setUploadingWallpaper(false);
      }
    } catch (error) {
      setSyncMessage('上传失败，请重试');
      setTimeout(() => setSyncMessage(''), 3000);
      setUploadingWallpaper(false);
    }
  };

  // 处理自定义壁纸上传
  const handleWallpaperUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await processWallpaperFile(file);

    // 清空文件输入
    if (event.target) {
      event.target.value = '';
    }
  };

  // 拖拽处理函数
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploadingWallpaper) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当鼠标真正离开拖拽区域时才设置为false
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleWallpaperDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (uploadingWallpaper) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((file) => file.type.startsWith('image/'));

    if (imageFile) {
      await processWallpaperFile(imageFile);
    } else {
      setSyncMessage('请拖拽图片文件 (JPG、PNG、WebP)');
      setTimeout(() => setSyncMessage(''), 3000);
    }
  };

  // 删除指定壁纸
  const handleDeleteWallpaper = async (id: string) => {
    const success = await customWallpaperManager.deleteWallpaper(id);

    if (success) {
      // 重新加载壁纸信息
      const info = await customWallpaperManager.getWallpaperInfo();
      setCustomWallpaperInfo(info);

      // 重新加载壁纸列表
      await loadWallpapers();

      // 如果删除的是当前使用的壁纸，且没有其他自定义壁纸，切换到默认分辨率
      if (!info.exists && wallpaperResolution === 'custom') {
        setWallpaperResolution('1080p');
      }

      setSyncMessage('壁纸已删除');
      setTimeout(() => setSyncMessage(''), 3000);
    } else {
      setSyncMessage('删除失败，请重试');
      setTimeout(() => setSyncMessage(''), 3000);
    }
  };

  // 选择/激活壁纸
  const handleSelectWallpaper = async (id: string) => {
    const success = await customWallpaperManager.setCurrentWallpaper(id);

    if (success) {
      setSyncMessage('✅ 壁纸已切换，页面即将刷新...');

      // 延迟后刷新页面以应用新壁纸
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      setSyncMessage('❌ 切换失败，请重试');
      setTimeout(() => setSyncMessage(''), 3000);
    }
  };

  // 预览壁纸（加载原图）
  const handlePreviewWallpaper = async (wallpaper: { metadata: any; thumbnailUrl: string }) => {
    setLoadingPreview(true);
    setShowPreviewModal(true);

    try {
      // 获取原图URL
      const fullImageUrl = await customWallpaperManager.getWallpaperFullImage(wallpaper.metadata.id);

      if (fullImageUrl) {
        setPreviewWallpaper({
          metadata: wallpaper.metadata,
          fullImageUrl,
        });
      } else {
        setSyncMessage('❌ 加载预览失败');
        setTimeout(() => setSyncMessage(''), 3000);
        setShowPreviewModal(false);
      }
    } catch (error) {
      setSyncMessage('❌ 加载预览失败');
      setTimeout(() => setSyncMessage(''), 3000);
      setShowPreviewModal(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  // 下载壁纸
  const handleDownloadWallpaper = async (id: string) => {
    const success = await customWallpaperManager.downloadWallpaper(id);

    if (success) {
      setSyncMessage('✅ 壁纸已下载');
      setTimeout(() => setSyncMessage(''), 2000);
    } else {
      setSyncMessage('❌ 下载失败，请重试');
      setTimeout(() => setSyncMessage(''), 3000);
    }
  };






  // 取消密码���改


  // 设置页面打开时暂时关闭视差
  useEffect(() => {
    setIsSettingsOpen(true);
    return () => setIsSettingsOpen(false);
  }, [setIsSettingsOpen]);

  // ESC键关闭设置页面和键盘上下键导航（仅在没有子模态框打开时）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查是否有子模态框打开
      const hasModalOpen = showPrivacySettings || showAccountSecurityModal || showAddCardModal ||
        showImportConfirm || showWallpaperGallery || showPreviewModal || showUserStatsModal;

      if (e.key === 'Escape') {
        // 如果有子模态框打开，让子模态框处理ESC
        if (hasModalOpen) {
          return;
        }
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // 如果有子模态框打开，不处理方向键
        if (hasModalOpen) {
          return;
        }

        // 阻止默认的滚动行为
        e.preventDefault();

        // 找到当前激活分区的索引
        const currentIndex = SECTIONS.findIndex(s => s.id === activeSection);

        if (e.key === 'ArrowDown') {
          // 向下导航：移动到下一个分区
          const nextIndex = (currentIndex + 1) % SECTIONS.length;
          scrollToSection(SECTIONS[nextIndex].id);
        } else if (e.key === 'ArrowUp') {
          // 向上导航：移动到上一个分区
          const prevIndex = currentIndex === 0 ? SECTIONS.length - 1 : currentIndex - 1;
          scrollToSection(SECTIONS[prevIndex].id);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, showPrivacySettings, showAccountSecurityModal, showAddCardModal,
    showImportConfirm, showWallpaperGallery, showPreviewModal, showUserStatsModal, activeSection]);

  const handleClose = () => {
    setIsSettingsOpen(false);
    // 触发同步（如果设置了回调）
    onSettingsClose?.();
    onClose();
  };

  const handleSaveNewCard = (data: {
    id: string;
    name: string;
    url: string;
    favicon: string;
    tags: string[];
    note?: string;
  }) => {
    const newCard = {
      ...data,
      visitCount: 0,
      lastVisit: new Date().toISOString().split('T')[0],
    };
    setWebsites([...websites, newCard]);
    setShowAddCardModal(false);
  };

  // 导出所有用户数据 - 使用统一的数据管理Hook
  const exportData = async () => {
    await exportAllData();
  };

  // 导入用户数据
  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 验证文件大小 (限制为5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('文件过大！请选择小于5MB的文件。');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // 验证文件类型
    if (!file.type.includes('json') && !file.name.endsWith('.json')) {
      alert('请选择JSON格式的文件！');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // 设置待导入文件并显示确认对话框
    setPendingImportFile(file);
    setShowImportConfirm(true);

    // 清空 input 值，以便下次可以选择同一个文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 确认导入数据 - 使用统一的数据管理Hook
  const confirmImportData = async () => {
    if (!pendingImportFile || isImporting) return;

    const result = await importAllData(pendingImportFile);

    if (result.success) {
      const details = result.details;
      let message = '数据导入成功！';

      if (details?.websitesImported) {
        message += `导入了 ${details.websitesImported} 个网站。`;
      }
      if (details?.settingsApplied && details.settingsApplied.length > 0) {
        message += `应用了设置：${details.settingsApplied.join('、')}。`;
      }
      message += '页面将刷新以应用新设置。';

      alert(message);
      window.location.reload();
    } else {
      alert(result.message);
    }

    setPendingImportFile(null);
  };

  // 一键修复图标
  const handleFixIcons = async () => {
    if (isFixingIcons) return;

    setIsFixingIcons(true);
    setFixIconsMessage('正在清除图标缓存并重新下载...');

    try {
      // 清空所有favicon缓存
      await faviconCache.clearCache();
      console.log('✅ 图标缓存已清空');

      // 延迟一下让用户看到提示
      setTimeout(() => {
        setFixIconsMessage('✅ 图标缓存已清空，页面将刷新');

        // 再延迟一下后刷新页面重新加载图标
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }, 500);
    } catch (error) {
      console.error('修复图标失败:', error);
      setFixIconsMessage('❌ 修复失败，请重试');
      setTimeout(() => {
        setFixIconsMessage('');
        setIsFixingIcons(false);
      }, 3000);
    }
  };

  // 手动同步到云端
  const handleUploadToCloud = async () => {
    if (!currentUser || !currentUser.email_confirmed_at || isManualSyncing) return;

    setIsManualSyncing(true);
    setSyncMessage('正在上传数据到云端...');

    try {
      const settings: UserSettings = {
        cardOpacity,
        searchBarOpacity,
        parallaxEnabled,
        wallpaperResolution,
        theme: localStorage.getItem('theme') || 'light',
        cardColor,
        searchBarColor,
        autoSyncEnabled,
        autoSyncInterval,
        searchInNewTab,
        autoSortEnabled,
        timeComponentEnabled,
        showFullDate,
        showSeconds,
        showWeekday,
        showYear,
        showMonth,
        showDay,
        searchBarBorderRadius,
        lastSync: new Date().toISOString(),
      };

      await saveUserSettings(currentUser, settings);
      await saveUserWebsites(currentUser, websites);

      // 更新同步状态
      updateSyncStatus({
        syncInProgress: false,
        lastSyncTime: new Date(),
        syncError: null,
        pendingChanges: 0,
      });

      setSyncMessage('✅ 数据已成功上传到云端');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (error) {
      setSyncMessage('❌ 上传失败: ' + (error instanceof Error ? error.message : '未知错误'));
      setTimeout(() => setSyncMessage(''), 5000);
    } finally {
      setIsManualSyncing(false);
    }
  };

  // 手动从云端下载
  const handleDownloadFromCloud = async () => {
    if (!currentUser || !currentUser.email_confirmed_at || isManualSyncing) return;

    setIsManualSyncing(true);
    setSyncMessage('正在从云端下载数据...');

    try {
      const cloudSettings = await getUserSettings(currentUser);
      const cloudWebsites = await getUserWebsites(currentUser);

      if (cloudSettings) {
        setCardOpacity(cloudSettings.cardOpacity);
        setSearchBarOpacity(cloudSettings.searchBarOpacity);
        setParallaxEnabled(cloudSettings.parallaxEnabled);
        setWallpaperResolution(cloudSettings.wallpaperResolution);
        setCardColor(cloudSettings.cardColor);
        setSearchBarColor(cloudSettings.searchBarColor);
        setAutoSyncEnabled(cloudSettings.autoSyncEnabled);
        setAutoSyncInterval(cloudSettings.autoSyncInterval);

        // 新增设置项的同步
        setSearchInNewTab(cloudSettings.searchInNewTab ?? true);
        setAutoSortEnabled(cloudSettings.autoSortEnabled ?? false);
        setTimeComponentEnabled(cloudSettings.timeComponentEnabled ?? true);
        setShowFullDate(cloudSettings.showFullDate ?? true);
        setShowSeconds(cloudSettings.showSeconds ?? true);
        setShowWeekday(cloudSettings.showWeekday ?? true);
        setShowYear(cloudSettings.showYear ?? true);
        setShowMonth(cloudSettings.showMonth ?? true);
        setShowDay(cloudSettings.showDay ?? true);
        setSearchBarBorderRadius(cloudSettings.searchBarBorderRadius ?? 12);

        localStorage.setItem('theme', cloudSettings.theme || 'light');
      }

      if (cloudWebsites) {
        setWebsites(cloudWebsites);
      }

      // 更新同步状态
      updateSyncStatus({
        syncInProgress: false,
        lastSyncTime: new Date(),
        syncError: null,
        pendingChanges: 0,
      });

      setSyncMessage('✅ 数据已成功从云端下载');
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (error) {
      setSyncMessage('❌ 下载失败: ' + (error instanceof Error ? error.message : '未知错误'));
      setTimeout(() => setSyncMessage(''), 5000);
    } finally {
      setIsManualSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center select-none">
      {/* 背景遮罩 - 增强模糊效果 */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/50 to-black/60 backdrop-blur-sm"
        onClick={handleClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      <motion.div
        className={`${isMobile ? 'w-full h-full rounded-none' : 'w-[900px] h-[85vh] rounded-2xl'} bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-[0_35px_80px_-15px_rgba(0,0,0,0.7),0_0_40px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_35px_80px_-15px_rgba(0,0,0,0.9),0_0_50px_rgba(0,0,0,0.5)] border border-white/60 dark:border-gray-600/40 ring-1 ring-white/30 dark:ring-white/5 z-50 flex ${isMobile ? 'flex-col' : 'flex-row'} select-none overflow-hidden relative before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/20 before:via-transparent before:to-transparent before:pointer-events-none`}
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
      >
        {/* 移动端顶部导航 */}
        {isMobile && (
          <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xl font-bold bg-gradient-to-br from-gray-800 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">设置</div>
              <button
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <i className="fa-solid fa-times text-gray-500 dark:text-gray-400 text-lg"></i>
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs transition-all duration-200 whitespace-nowrap ${activeSection === section.id
                    ? 'bg-blue-500 text-white font-medium shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                >
                  <i className={`fa-solid ${section.icon} mr-1.5`}></i>
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 左侧侧边栏 - 移动端隐藏 */}
        {!isMobile && (
          <div className="w-[180px] flex-shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            {/* 标题 */}
            <div className="p-6 pb-4">
              <div className="text-2xl font-black bg-gradient-to-br from-gray-800 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent select-none mb-1 drop-shadow-sm filter">设置</div>
            </div>

            {/* 导航列表 - 使用 SECTIONS 生成 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 space-y-1 py-2">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 group relative ${activeSection === section.id
                    ? 'text-gray-900 dark:text-white font-bold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/30'
                    }`}
                >
                  {activeSection === section.id && (
                    <motion.div
                      layoutId="activeSectionBg"
                      className="absolute inset-0 bg-gradient-to-b from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 shadow-md border border-gray-100 dark:border-gray-600 rounded-xl"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 w-5 flex justify-center">
                    <i className={`fa-solid ${section.icon}`}></i>
                  </span>
                  <span className="relative z-10">{section.label}</span>
                </button>
              ))}
            </div>

            {/* 版本信息 - 左下角 */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700/50">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">版本</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">v{versionInfo.version}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">更新</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{versionInfo.buildDate}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 主要内容区域 */}
        <div
          id="settings-content-scroll-container"
          className="flex-1 overflow-y-auto select-none custom-scrollbar bg-white dark:bg-gray-900"
        >
          <div className="p-8 space-y-12 pb-[60vh]">

            {/* 账号管理部分 - 现代化设计 */}
            <div id="account" ref={(el) => (sectionsRef.current['account'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-emerald-400 to-green-500 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-user text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">账号管理</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              {currentUser ? (
                <AccountSettingsSection onClose={handleClose} onOpenSecurityModal={() => setShowAccountSecurityModal(true)} />
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <i className="fa-solid fa-cat text-white text-xl"></i>
                      </div>
                      <div className="flex-1">
                        <div className="text-lg font-semibold text-slate-800 dark:text-gray-100 mb-1 select-none">
                          账号登录
                        </div>
                        <div className="text-sm text-slate-600 dark:text-gray-400 select-none">
                          登录后可同步数据到云端
                        </div>
                      </div>
                    </div>

                    <AuthForm onSuccess={handleClose} />
                  </div>
                </div>
              )}
            </div>

            <div id="sync" ref={(el) => (sectionsRef.current['sync'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-cloud text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">云端同步</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              {/* 同步控制区域 - 现代化卡片 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-5">
                {/* 同步状态显示 */}
                <SyncStatusIndicator />

                {/* 分割线 */}
                <div className="border-t border-gray-100 dark:border-gray-700"></div>

                {/* 自动同步开关 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 select-none">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${autoSyncEnabled ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white'}`}
                      >
                        <i
                          className={`fa-solid text-sm ${autoSyncEnabled ? 'fa-sync' : 'fa-hand-paper'} select-none`}
                        ></i>
                      </div>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 select-none">
                        {autoSyncEnabled ? '自动同步模式' : '手动同步模式'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 ml-11 select-none">
                      {autoSyncEnabled
                        ? '数据变化后自动同步到云端，保持实时更新'
                        : '需要手动操作同步数据，完全由您控制'}
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${autoSyncEnabled
                      ? 'bg-gradient-to-r from-blue-400 to-cyan-500 shadow-lg shadow-cyan-300/50'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${autoSyncEnabled
                        ? 'translate-x-6 shadow-cyan-200'
                        : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                        }`}
                    />
                  </button>
                </div>

                {/* 自动同步间隔设置 */}
                {autoSyncEnabled && (
                  <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        数据变化后延迟同步
                      </label>
                      <span className="text-sm text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/50 px-2 py-1 rounded">
                        {autoSyncInterval}秒
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      数据变化后等待此时间再同步，避免频繁请求。关闭设置或保存卡片时会立即同步。
                    </p>
                    <input
                      type="range"
                      min="3"
                      max="60"
                      step="1"
                      value={autoSyncInterval}
                      onChange={(e) => setAutoSyncInterval(parseInt(e.target.value))}
                      className="w-full h-2 bg-gradient-to-r from-blue-200 to-blue-300 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((autoSyncInterval - 3) / 57) * 100}%, #e2e8f0 ${((autoSyncInterval - 3) / 57) * 100}%, #e2e8f0 100%)`,
                      }}
                    />
                    <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 select-none">
                      <span className="select-none">3秒</span>
                      <span className="text-green-600 select-none">快速</span>
                      <span className="text-blue-600 select-none">平衡</span>
                      <span className="text-purple-600 select-none">悠闲</span>
                      <span className="select-none">60秒</span>
                    </div>
                  </div>
                )}

                {/* 手动同步按钮 */}
                {!autoSyncEnabled && currentUser && currentUser.email_confirmed_at && (
                  <div className="space-y-3 pt-3 border-t border-gray-100">
                    <div className="flex space-x-3">
                      <button
                        onClick={handleUploadToCloud}
                        disabled={isManualSyncing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-400 to-cyan-500 text-white text-sm rounded-lg hover:from-blue-500 hover:to-cyan-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 shadow-lg select-none"
                      >
                        <i
                          className={`fa-solid ${isManualSyncing ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} select-none`}
                        ></i>
                        <span className="select-none">
                          {isManualSyncing ? '上传中...' : '上传到云端'}
                        </span>
                      </button>
                      <button
                        onClick={handleDownloadFromCloud}
                        disabled={isManualSyncing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-400 to-cyan-500 text-white text-sm rounded-lg hover:from-blue-500 hover:to-cyan-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 shadow-lg select-none"
                      >
                        <i
                          className={`fa-solid ${isManualSyncing ? 'fa-spinner fa-spin' : 'fa-cloud-download-alt'} select-none`}
                        ></i>
                        <span className="select-none">
                          {isManualSyncing ? '下载中...' : '从云端下载'}
                        </span>
                      </button>
                    </div>
                    {syncMessage && (
                      <div
                        className={`text-xs text-center px-3 py-2 rounded-lg ${syncMessage.includes('✅')
                          ? 'text-green-700 bg-green-50 border border-green-200'
                          : syncMessage.includes('❌')
                            ? 'text-red-700 bg-red-50 border border-red-200'
                            : 'text-blue-700 bg-blue-50 border border-blue-200'
                          }`}
                      >
                        {syncMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div id="appearance" ref={(el) => (sectionsRef.current['appearance'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-palette text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">外观设置</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              {/* 透明度控制区域 - 现代化卡片 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-5">
                {/* 搜索框不透明度控制 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-search text-blue-500 text-sm"></i>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        搜索框不透明度
                      </label>
                    </div>
                    <span className="text-sm text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/50 px-2 py-1 rounded select-none">
                      {Math.round(searchBarOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.5"
                    step="0.01"
                    value={searchBarOpacity}
                    onChange={(e) => setSearchBarOpacity(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((searchBarOpacity - 0.05) / 0.45) * 100}%, ${darkMode ? '#374151' : '#e2e8f0'} ${((searchBarOpacity - 0.05) / 0.45) * 100}%, ${darkMode ? '#374151' : '#e2e8f0'} 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 select-none">
                    <span className="select-none">5%</span>
                    <span className="text-gray-600 dark:text-gray-400 select-none">透明</span>
                    <span className="text-gray-600 dark:text-gray-400 select-none">清晰</span>
                    <span className="select-none">50%</span>
                  </div>
                </div>

                {/* 搜索框颜色选择 */}
                <div className="pt-2 border-t border-gray-100/60 dark:border-gray-700/60">
                  <ColorPicker
                    label="搜索框颜色"
                    selectedColor={searchBarColor}
                    onChange={setSearchBarColor}
                  />
                </div>

                {/* 搜索框圆角调节 */}
                <div className="space-y-3 pt-4 border-t border-gray-200/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-border-all text-blue-500 text-sm"></i>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        搜索框圆角
                      </label>
                    </div>
                    <span className="text-sm text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/50 px-2 py-1 rounded select-none">
                      {searchBarBorderRadius >= 50 ? '全圆角' : `${searchBarBorderRadius}px`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={searchBarBorderRadius >= 50 ? 50 : searchBarBorderRadius}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setSearchBarBorderRadius(value === 50 ? 9999 : value);
                    }}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(Math.min(searchBarBorderRadius, 50) / 50) * 100}%, ${darkMode ? '#374151' : '#e2e8f0'} ${(Math.min(searchBarBorderRadius, 50) / 50) * 100}%, ${darkMode ? '#374151' : '#e2e8f0'} 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 select-none">
                    <span className="select-none">直角</span>
                    <span className="text-gray-600 select-none">圆角</span>
                    <span className="text-gray-600 select-none">全圆</span>
                  </div>
                </div>

                {/* 卡片不透明度控制 */}
                <div className="space-y-3 pt-4 border-t border-gray-200/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-layer-group text-blue-500 text-sm"></i>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        卡片不透明度
                      </label>
                    </div>
                    <span className="text-sm text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/50 px-2 py-1 rounded select-none">
                      {Math.round(cardOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.5"
                    step="0.01"
                    value={cardOpacity}
                    onChange={(e) => setCardOpacity(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((cardOpacity - 0.05) / 0.45) * 100}%, ${darkMode ? '#374151' : '#e2e8f0'} ${((cardOpacity - 0.05) / 0.45) * 100}%, ${darkMode ? '#374151' : '#e2e8f0'} 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 select-none">
                    <span className="select-none">5%</span>
                    <span className="text-gray-600 dark:text-gray-400 select-none">透明</span>
                    <span className="text-gray-600 dark:text-gray-400 select-none">清晰</span>
                    <span className="select-none">50%</span>
                  </div>
                </div>

                {/* 卡片颜色选择 */}
                <div className="pt-2 border-t border-gray-100/60">
                  <ColorPicker label="卡片颜色" selectedColor={cardColor} onChange={setCardColor} />
                </div>
              </div>
            </div>
            <div id="theme" ref={(el) => (sectionsRef.current['theme'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-moon text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">主题与显示</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-4">
                {/* 夜间模式设置 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <i className={`fa-solid ${darkMode ? 'fa-moon' : 'fa-sun'} text-indigo-500 text-sm`}></i>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                      夜间模式
                    </span>
                  </div>

                  {/* 模式选择按钮组 */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: 'system', label: '跟随系统', icon: 'fa-desktop' },
                      { value: 'on', label: '始终开启', icon: 'fa-moon' },
                      { value: 'off', label: '始终关闭', icon: 'fa-sun' },
                      { value: 'scheduled', label: '定时', icon: 'fa-clock' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setDarkModePreference(option.value as 'system' | 'on' | 'off' | 'scheduled')}
                        className={`group p-2 rounded-lg border-2 transition-all duration-200 text-center select-none cursor-pointer ${darkModePreference === option.value
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                      >
                        <i
                          className={`fa-solid ${option.icon} text-sm transition-colors ${darkModePreference === option.value
                            ? 'text-indigo-500 dark:text-indigo-400'
                            : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                            } select-none`}
                        ></i>
                        <div className="font-medium text-xs mt-1 select-none">{option.label}</div>
                      </button>
                    ))}
                  </div>

                  {/* 当前状态描述 */}
                  <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                    {darkModePreference === 'system' && '跟随系统主题自动切换'}
                    {darkModePreference === 'on' && '始终使用深色主题'}
                    {darkModePreference === 'off' && '始终使用浅色主题'}
                    {darkModePreference === 'scheduled' && `${darkModeScheduleStart} - ${darkModeScheduleEnd} 自动开启深色模式`}
                  </p>

                  {/* 自定义时间设置 - 仅当选择 scheduled 时显示 */}
                  {darkModePreference === 'scheduled' && (
                    <div className="flex items-center gap-4 pt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-300">开始</span>
                        <input
                          type="time"
                          value={darkModeScheduleStart}
                          onChange={(e) => setDarkModeScheduleStart(e.target.value)}
                          className="px-2 py-1 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                      <span className="text-gray-400">-</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-300">结束</span>
                        <input
                          type="time"
                          value={darkModeScheduleEnd}
                          onChange={(e) => setDarkModeScheduleEnd(e.target.value)}
                          className="px-2 py-1 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700"></div>

                {/* 动画样式开关 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="fa-solid fa-wand-magic-sparkles text-blue-500 text-sm"></i>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        动画样式
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      {animationStyle === 'dynamic' ? '灵动弹簧动画，更多视觉反馈' : '简约平滑动画，更稳定流畅'}
                    </p>
                  </div>
                  <button
                    onClick={() => setAnimationStyle(animationStyle === 'dynamic' ? 'simple' : 'dynamic')}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${animationStyle === 'dynamic'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-purple-300/50'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${animationStyle === 'dynamic'
                        ? 'translate-x-6 shadow-purple-200'
                        : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                        }`}
                    />
                  </button>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700"></div>

                {/* 壁纸遮罩模式选择 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="fa-solid fa-circle-half-stroke text-gray-600 text-sm"></i>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        壁纸遮罩
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      {darkOverlayMode === 'off' ? '显示原始壁纸' : darkOverlayMode === 'always' ? '始终覆盖暗角遮罩' : '根据壁纸亮度自动判断'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDarkOverlayMode('off')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${darkOverlayMode === 'off'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      关闭
                    </button>
                    <button
                      onClick={() => setDarkOverlayMode('always')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${darkOverlayMode === 'always'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      始终
                    </button>
                    <button
                      onClick={() => setDarkOverlayMode('smart')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${darkOverlayMode === 'smart'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>智能
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div id="wallpaper" ref={(el) => (sectionsRef.current['wallpaper'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-image text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">壁纸设置</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              {/* 壁纸设置区域 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-5">
                {/* 模式切换 Tab */}
                <div className="flex p-1 bg-gray-100 dark:bg-gray-700 rounded-xl select-none relative">
                  <button
                    onClick={() => setWallpaperResolution(lastBingResolution)}
                    className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${wallpaperResolution !== 'custom'
                      ? 'text-pink-600 dark:text-pink-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                  >
                    {wallpaperResolution !== 'custom' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-white dark:bg-gray-600 rounded-lg shadow-sm"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <i className="fa-solid fa-image"></i>
                      每日必应
                    </span>
                  </button>
                  <button
                    onClick={() => setWallpaperResolution('custom')}
                    className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${wallpaperResolution === 'custom'
                      ? 'text-pink-600 dark:text-pink-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                  >
                    {wallpaperResolution === 'custom' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-white dark:bg-gray-600 rounded-lg shadow-sm"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <i className="fa-solid fa-upload"></i>
                      自定义壁纸
                    </span>
                  </button>
                </div>

                {/* 内容区域 */}
                <div className="min-h-[180px]">
                  {wallpaperResolution !== 'custom' ? (
                    /* 必应壁纸分辨率选择 */
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <i className="fa-solid fa-image text-blue-500 text-sm"></i>
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                            壁纸分辨率
                          </label>
                        </div>
                        <div className="relative group">
                          <i className="fa-solid fa-info-circle text-gray-400 text-xs cursor-help"></i>
                          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                            💡 更改分辨率后会重新加载壁纸并更新缓存
                            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 select-none">
                        {[
                          { value: '4k', label: '4K 超高清', desc: '大屏设备', icon: 'fa-desktop' },
                          { value: '1080p', label: '1080p 高清', desc: '推荐', icon: 'fa-laptop' },
                          { value: '720p', label: '720p 标清', desc: '网络较慢', icon: 'fa-wifi' },
                          { value: 'mobile', label: '竖屏壁纸', desc: '移动设备', icon: 'fa-mobile-alt' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setWallpaperResolution(option.value as WallpaperResolution)}
                            className={`group p-3 rounded-lg border-2 transition-all duration-200 text-left select-none cursor-pointer ${wallpaperResolution === option.value
                              ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <i
                                className={`fa-solid ${option.icon} text-sm transition-colors ${wallpaperResolution === option.value
                                  ? 'text-pink-500 dark:text-pink-400'
                                  : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                                  } select-none`}
                              ></i>
                              <div className="font-medium text-sm select-none">{option.label}</div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 select-none">{option.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* 自定义壁纸管理 */
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <i className="fa-solid fa-upload text-blue-500 text-sm"></i>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">上传壁纸</span>
                        </div>
                        <div className="relative group">
                          <i className="fa-solid fa-info-circle text-gray-400 text-xs cursor-help"></i>
                          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                            <div className="space-y-1">
                              <div>• 支持 JPG、PNG、WebP 格式</div>
                              <div>• 文件大小不超过 10MB</div>
                              <div>• 图片会自动压缩优化</div>
                              {customWallpaperInfo.exists && (
                                <div>• 当前壁纸: {customWallpaperInfo.sizeText}</div>
                              )}
                            </div>
                            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                          </div>
                        </div>
                      </div>

                      {/* 拖拽上传区域 */}
                      <div className="flex gap-3">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleWallpaperUpload}
                          className="hidden"
                          id="wallpaper-upload"
                          disabled={uploadingWallpaper}
                        />
                        <div
                          className={`flex-1 relative ${uploadingWallpaper ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          onDrop={handleWallpaperDrop}
                          onDragOver={handleDragOver}
                          onDragEnter={handleDragEnter}
                          onDragLeave={handleDragLeave}
                        >
                          <label
                            htmlFor="wallpaper-upload"
                            className={`flex items-center justify-center gap-2 px-4 py-8 text-sm font-medium rounded-lg border-2 border-dashed transition-all w-full ${uploadingWallpaper
                              ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                              : isDragOver
                                ? 'border-pink-500 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
                                : isGlobalDragOver
                                  ? 'border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 animate-pulse'
                                  : 'border-pink-300 dark:border-pink-700 bg-white dark:bg-gray-700 text-pink-600 dark:text-pink-400 hover:border-pink-400 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20'
                              }`}
                          >
                            <div className="text-center space-y-2">
                              {uploadingWallpaper ? (
                                <>
                                  <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
                                  <div>上传中...</div>
                                </>
                              ) : isDragOver ? (
                                <>
                                  <i className="fa-solid fa-hand-point-down text-2xl"></i>
                                  <div>松开鼠标上传</div>
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-cloud-upload-alt text-2xl mb-1"></i>
                                  <div>点击或拖拽上传壁纸</div>
                                  <div className="text-xs text-gray-400 font-normal">支持 JPG, PNG, WebP</div>
                                </>
                              )}
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* 壁纸管理按钮 */}
                      {wallpapers.length > 0 && (
                        <button
                          onClick={() => setShowWallpaperGallery(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02]"
                        >
                          <i className="fa-solid fa-images"></i>
                          <span>管理壁纸库 ({wallpapers.length})</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div id="features" ref={(el) => (sectionsRef.current['features'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-cogs text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">基础功能</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-4">
                {/* 视差效果开关 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="fa-solid fa-mouse text-blue-500 text-sm"></i>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        视差背景效果
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      {parallaxEnabled ? '背景会跟随鼠标轻微移动' : '背景固定不动'}
                    </p>
                  </div>
                  <button
                    onClick={() => setParallaxEnabled(!parallaxEnabled)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${parallaxEnabled
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-purple-300/50'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${parallaxEnabled
                        ? 'translate-x-6 shadow-purple-200'
                        : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                        }`}
                    />
                  </button>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700"></div>

                {/* 搜索行为开关 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="fa-solid fa-external-link-alt text-blue-500 text-sm"></i>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        链接打开方式
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      {searchInNewTab ? '在新标签页中打开搜索结果和卡片' : '在当前页面直接跳转'}
                    </p>
                  </div>
                  <button
                    onClick={() => setSearchInNewTab(!searchInNewTab)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${searchInNewTab
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-purple-300/50'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${searchInNewTab
                        ? 'translate-x-6 shadow-purple-200'
                        : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                        }`}
                    />
                  </button>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700"></div>

                {/* 自动排序开关 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="fa-solid fa-sort text-blue-500 text-sm"></i>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        卡片自动排序
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      {autoSortEnabled ? '按访问次数自动排序卡片' : '保持手动拖拽的顺序'}
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoSortEnabled(!autoSortEnabled)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${autoSortEnabled
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-purple-300/50'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${autoSortEnabled
                        ? 'translate-x-6 shadow-purple-200'
                        : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                        }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div id="interaction" ref={(el) => (sectionsRef.current['interaction'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-wand-magic-sparkles text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">交互体验</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-4">
                {/* 氛围效果模式选择 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="fa-solid fa-snowflake text-cyan-500 text-sm"></i>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        氛围效果
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      {atmosphereMode === 'auto' && '根据季节自动切换效果'}
                      {atmosphereMode === 'snow' && '显示雪花飘落效果'}
                      {atmosphereMode === 'leaf' && '显示落叶飘落效果'}
                      {atmosphereMode === 'off' && '已关闭氛围效果'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAtmosphereMode('auto')}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${atmosphereMode === 'auto'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>自动
                    </button>
                    <button
                      onClick={() => setAtmosphereMode('snow')}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${atmosphereMode === 'snow'
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      <i className="fa-solid fa-snowflake mr-1"></i>雪花
                    </button>
                    <button
                      onClick={() => setAtmosphereMode('leaf')}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${atmosphereMode === 'leaf'
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      <i className="fa-solid fa-leaf mr-1"></i>落叶
                    </button>
                    <button
                      onClick={() => setAtmosphereMode('off')}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${atmosphereMode === 'off'
                        ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      关闭
                    </button>
                  </div>
                </div>

                {/* 氛围效果粒子数量滑轨 - 未关闭时显示 */}
                {atmosphereMode !== 'off' && (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-700"></div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <i className="fa-solid fa-sliders text-indigo-500 text-sm"></i>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                              粒子数量
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 select-none">过多的粒子会消耗更多性能哦</p>
                        </div>
                        <span className="text-sm font-medium text-indigo-600">
                          {Math.round(atmosphereParticleCount / 2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        step="1"
                        value={Math.round(atmosphereParticleCount / 2)}
                        onChange={(e) => setAtmosphereParticleCount(parseInt(e.target.value, 10) * 2)}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>1</span>
                        <span>100</span>
                      </div>
                    </div>

                    {/* 风力效果开关 */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <i className="fa-solid fa-wind text-cyan-500 text-sm"></i>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                            风力效果
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                          {atmosphereWindEnabled ? '粒子会受风力影响飘动' : '粒子自然下落'}
                        </p>
                      </div>
                      <button
                        onClick={() => setAtmosphereWindEnabled(!atmosphereWindEnabled)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${atmosphereWindEnabled
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-300/50'
                          : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                          }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${atmosphereWindEnabled
                            ? 'translate-x-6 shadow-cyan-200'
                            : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                            }`}
                        />
                      </button>
                    </div>
                  </>
                )}

                <div className="border-t border-gray-100 dark:border-gray-700"></div>

                {/* AI图标显示模式 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="fa-solid fa-robot text-blue-500 text-sm"></i>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        AI图标样式
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      {aiIconDisplayMode === 'dropdown' ? '下拉面板式，网格布局展示AI服务' : '圆形布局，悬停时环绕展开'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAiIconDisplayMode('circular')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${aiIconDisplayMode === 'circular'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      <i className="fa-solid fa-circle-nodes mr-1"></i>
                      圆形
                    </button>
                    <button
                      onClick={() => setAiIconDisplayMode('dropdown')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${aiIconDisplayMode === 'dropdown'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                      <i className="fa-solid fa-grip mr-1"></i>
                      面板
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div id="time" ref={(el) => (sectionsRef.current['time'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-orange-400 to-yellow-500 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-clock text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">时间设置</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              {/* 时间设置区域 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-4">
                {/* 时间组件开关 */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="fa-solid fa-clock text-orange-500 text-sm"></i>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                        显示时间组件
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      {timeComponentEnabled ? '在搜索框上方显示当前时间和日期' : '隐藏时间和日期显示'}
                    </p>
                  </div>
                  <button
                    onClick={() => setTimeComponentEnabled(!timeComponentEnabled)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${timeComponentEnabled
                      ? 'bg-gradient-to-r from-orange-400 to-yellow-500 shadow-lg shadow-orange-300/50'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${timeComponentEnabled
                        ? 'translate-x-6 shadow-orange-200'
                        : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                        }`}
                    />
                  </button>
                </div>

                {timeComponentEnabled && (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-700"></div>

                    {/* 年月日独立开关 */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-calendar text-orange-500 text-sm"></i>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                          日期显示控制
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        {/* 年份开关 */}
                        <div className="flex flex-col items-center space-y-2">
                          <button
                            onClick={() => setShowYear(!showYear)}
                            className={`w-full p-3 rounded-lg border-2 transition-all duration-200 text-center select-none cursor-pointer ${showYear
                              ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                          >
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <i
                                className={`fa-solid fa-calendar-alt text-sm transition-colors ${showYear ? 'text-orange-400' : 'text-gray-400'
                                  } select-none`}
                              ></i>
                              <div className="font-medium text-sm select-none">年份</div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 select-none">2024年</div>
                          </button>
                        </div>

                        {/* 月份开关 */}
                        <div className="flex flex-col items-center space-y-2">
                          <button
                            onClick={() => setShowMonth(!showMonth)}
                            className={`w-full p-3 rounded-lg border-2 transition-all duration-200 text-center select-none cursor-pointer ${showMonth
                              ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                          >
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <i
                                className={`fa-solid fa-calendar-check text-sm transition-colors ${showMonth ? 'text-orange-400' : 'text-gray-400'
                                  } select-none`}
                              ></i>
                              <div className="font-medium text-sm select-none">月份</div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 select-none">8月</div>
                          </button>
                        </div>

                        {/* 日期开关 */}
                        <div className="flex flex-col items-center space-y-2">
                          <button
                            onClick={() => setShowDay(!showDay)}
                            className={`w-full p-3 rounded-lg border-2 transition-all duration-200 text-center select-none cursor-pointer ${showDay
                              ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                          >
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <i
                                className={`fa-solid fa-calendar-day text-sm transition-colors ${showDay ? 'text-orange-400' : 'text-gray-400'
                                  } select-none`}
                              ></i>
                              <div className="font-medium text-sm select-none">日期</div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 select-none">28日</div>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-700"></div>

                    {/* 显示星期开关 */}
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <i className="fa-solid fa-calendar-week text-orange-500 text-sm"></i>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                            显示星期
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                          {showWeekday ? '显示当前是星期几' : '隐藏星期信息'}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowWeekday(!showWeekday)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${showWeekday
                          ? 'bg-gradient-to-r from-orange-400 to-yellow-500 shadow-lg shadow-orange-300/50'
                          : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                          }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${showWeekday
                            ? 'translate-x-6 shadow-orange-200'
                            : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                            }`}
                        />
                      </button>
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-700"></div>

                    {/* 精确到秒设置 */}
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <i className="fa-solid fa-stopwatch text-orange-500 text-sm"></i>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                            精确到秒
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                          {showSeconds ? '显示精确的秒数时间' : '只显示时:分，冒号每秒闪烁'}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowSeconds(!showSeconds)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${showSeconds
                          ? 'bg-gradient-to-r from-orange-400 to-yellow-500 shadow-lg shadow-orange-300/50'
                          : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                          }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${showSeconds
                            ? 'translate-x-6 shadow-orange-200'
                            : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                            }`}
                        />
                      </button>
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-700"></div>

                    {/* 下班倒计时设置 */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <i className="fa-solid fa-hourglass-half text-orange-500 text-sm"></i>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 select-none">
                              下班倒计时
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                            {workCountdownEnabled
                              ? '鼠标悬停时间显示距离午休/下班时间'
                              : '禁用倒计时功能'}
                          </p>
                        </div>
                        <button
                          onClick={() => setWorkCountdownEnabled(!workCountdownEnabled)}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 hover:scale-105 ${workCountdownEnabled
                            ? 'bg-gradient-to-r from-orange-400 to-yellow-500 shadow-lg shadow-orange-300/50'
                            : 'bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-lg shadow-gray-300/50 dark:shadow-gray-900/50'
                            }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 transition-all duration-300 shadow-md ${workCountdownEnabled
                              ? 'translate-x-6 shadow-orange-200'
                              : 'translate-x-1 shadow-gray-200 dark:shadow-gray-600'
                              }`}
                          />
                        </button>
                      </div>

                      {workCountdownEnabled && (
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="space-y-2">
                            <label className="text-xs text-gray-500 font-medium ml-1">午休时间</label>
                            <input
                              type="time"
                              value={lunchTime}
                              onChange={(e) => setLunchTime(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-gray-500 font-medium ml-1">下班时间</label>
                            <input
                              type="time"
                              value={offWorkTime}
                              onChange={(e) => setOffWorkTime(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                  </>
                )}
              </div>
            </div>

            <div id="cards" ref={(el) => (sectionsRef.current['cards'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-layer-group text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">卡片管理</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-layer-group text-white text-sm"></i>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100 select-none">卡片收藏</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 select-none">
                        当前有 {websites.length} 个卡片
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowAddCardModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-b from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] select-none"
                >
                  <i className="fa-solid fa-plus select-none"></i>
                  <span className="select-none">添加新卡片</span>
                </button>
              </div>
            </div>

            <div id="data" ref={(el) => (sectionsRef.current['data'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-database text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">数据管理</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                    <i className="fa-solid fa-database text-white text-sm"></i>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 select-none">备份与恢复</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 select-none">导出或导入您的数据</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 select-none">
                  <button
                    onClick={exportData}
                    disabled={isExporting}
                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 select-none ${isExporting
                      ? 'bg-gray-400 cursor-not-allowed text-white shadow-lg shadow-gray-400/30'
                      : 'bg-gradient-to-b from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-600/40 hover:scale-[1.02]'
                      }`}
                  >
                    {isExporting ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin select-none"></i>
                        <span className="select-none">导出中</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-download select-none"></i>
                        <span className="select-none">导出数据</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 select-none ${isImporting
                      ? 'bg-gray-400 cursor-not-allowed text-white shadow-lg shadow-gray-400/30'
                      : 'bg-gradient-to-b from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-600/40 hover:scale-[1.02]'
                      }`}
                  >
                    {isImporting ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin select-none"></i>
                        <span className="select-none">导入中</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-upload select-none"></i>
                        <span className="select-none">导入数据</span>
                      </>
                    )}
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={importData}
                  className="hidden"
                />

                <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 rounded-lg p-3 select-none">
                  <div className="flex items-start gap-2 select-none">
                    <i className="fa-solid fa-exclamation-triangle text-teal-500 dark:text-teal-400 text-sm mt-0.5 select-none"></i>
                    <div className="select-none">
                      <div className="text-xs font-medium text-teal-700 dark:text-teal-300 mb-1 select-none">
                        重要提醒
                      </div>
                      <div className="text-xs text-teal-600 dark:text-teal-400 select-none">
                        导入会覆盖所有当前数据，建议先导出备份
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div id="privacy" ref={(el) => (sectionsRef.current['privacy'] = el)} className="space-y-5 select-none settings-section scroll-mt-6">
              <div className="flex items-center gap-3 select-none">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-shield-halved text-white text-xs"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 select-none">隐私与帮助</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent"></div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                    <i className="fa-solid fa-shield-halved text-white text-sm"></i>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 select-none">隐私与帮助</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      管理隐私设置和查看使用教程
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => setShowPrivacySettings(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-b from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] select-none"
                  >
                    <i className="fa-solid fa-shield-halved select-none"></i>
                    <span className="select-none">隐私设置</span>
                  </button>

                  <button
                    onClick={() => setShowUserStatsModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-b from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] select-none"
                  >
                    <i className="fa-solid fa-chart-simple select-none"></i>
                    <span className="select-none">查看使用统计</span>
                  </button>

                  <a
                    href="/help/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-b from-gray-100 to-gray-200 dark:from-gray-600 dark:to-gray-700 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-500 dark:hover:to-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] select-none"
                    style={{ textDecoration: 'none' }}
                  >
                    <i className="fa-solid fa-graduation-cap select-none"></i>
                    <span className="select-none">使用教程</span>
                    <i className="fa-solid fa-external-link-alt text-xs opacity-70 select-none"></i>
                  </a>
                </div>

                {/* 图标修复功能 */}
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-center space-y-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 select-none">
                      图标显示不正确？
                      <button
                        onClick={handleFixIcons}
                        disabled={isFixingIcons}
                        className="text-purple-500 hover:text-purple-600 underline ml-1 disabled:text-gray-400 disabled:no-underline"
                      >
                        点击修复
                      </button>
                    </p>

                    {fixIconsMessage && (
                      <div
                        className={`text-xs px-3 py-2 rounded-lg ${fixIconsMessage.includes('✅')
                          ? 'text-green-700 bg-green-50 border border-green-200'
                          : fixIconsMessage.includes('❌')
                            ? 'text-red-700 bg-red-50 border border-red-200'
                            : 'text-blue-700 bg-blue-50 border border-blue-200'
                          }`}
                      >
                        {isFixingIcons &&
                          !fixIconsMessage.includes('✅') &&
                          !fixIconsMessage.includes('❌') && (
                            <i className="fa-solid fa-spinner fa-spin mr-1"></i>
                          )}
                        {fixIconsMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {showAddCardModal && (
        <CardEditModal
          id={`new-${Date.now()}`}
          name=""
          url=""
          favicon=""
          tags={[]}
          note=""
          onClose={() => setShowAddCardModal(false)}
          onSave={handleSaveNewCard}
        />
      )
      }

      {/* 隐私设置面板 */}
      {
        showPrivacySettings && (
          <PrivacySettings
            isOpen={showPrivacySettings}
            onClose={() => setShowPrivacySettings(false)}
          />
        )
      }

      {/* 账号与安全弹窗 */}
      {
        showAccountSecurityModal && (
          <AccountSecurityModal
            isOpen={showAccountSecurityModal}
            onClose={() => setShowAccountSecurityModal(false)}
          />
        )
      }

      {/* 导入确认对话框 */}
      <ConfirmModal
        isOpen={showImportConfirm}
        onClose={() => {
          setShowImportConfirm(false);
          setPendingImportFile(null);
        }}
        onConfirm={confirmImportData}
        title="确认导入数据"
        message="⚠️ 导入数据前请注意：

• 导入会完全覆盖当前所有数据
• 包括所有网站卡片、透明度设置、主题等
• 建议先导出当前数据作为备份

确定要继续导入吗？"
        confirmText="确定导入"
        cancelText="取消"
        type="warning"
      />

      {/* 壁纸管理画廊 */}
      {
        showWallpaperGallery && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWallpaperGallery(false)}
            />
            <motion.div
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            >
              {/* 标题栏 */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center">
                    <i className="fa-solid fa-images text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">壁纸管理</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">共 {wallpapers.length} 张壁纸</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowWallpaperGallery(false)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <i className="fa-solid fa-xmark text-xl"></i>
                </button>
              </div>

              {/* 壁纸网格 */}
              <div className="flex-1 overflow-y-auto p-6">
                {wallpapers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <i className="fa-solid fa-image text-6xl mb-4"></i>
                    <p className="text-lg">暂无壁纸</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {wallpapers.map((wallpaper) => (
                      <motion.div
                        key={wallpaper.metadata.id}
                        className={`relative group rounded-xl overflow-hidden border-2 transition-all duration-200 ${wallpaper.isActive
                          ? 'border-pink-500 shadow-lg shadow-pink-200 dark:shadow-pink-900/50'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* 壁纸缩略图 */}
                        <div className="aspect-video bg-gray-100 dark:bg-gray-800 relative">
                          <img
                            src={wallpaper.thumbnailUrl}
                            alt={wallpaper.metadata.name}
                            className="w-full h-full object-cover"
                          />

                          {/* 当前使用指示器 */}
                          {wallpaper.isActive && (
                            <div className="absolute top-2 right-2 bg-pink-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                              <i className="fa-solid fa-check"></i>
                              <span>使用中</span>
                            </div>
                          )}

                          {/* 悬浮操作按钮 */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            {/* 预览 */}
                            <button
                              onClick={() => handlePreviewWallpaper(wallpaper)}
                              className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors"
                              title="预览"
                            >
                              <i className="fa-solid fa-eye"></i>
                            </button>

                            {/* 使用 */}
                            {!wallpaper.isActive && (
                              <button
                                onClick={() => handleSelectWallpaper(wallpaper.metadata.id)}
                                className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center text-white hover:bg-pink-600 transition-colors"
                                title="使用此壁纸"
                              >
                                <i className="fa-solid fa-check"></i>
                              </button>
                            )}

                            {/* 下载 */}
                            <button
                              onClick={() => handleDownloadWallpaper(wallpaper.metadata.id)}
                              className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white hover:bg-blue-600 transition-colors"
                              title="下载"
                            >
                              <i className="fa-solid fa-download"></i>
                            </button>

                            {/* 删除 */}
                            <button
                              onClick={() => handleDeleteWallpaper(wallpaper.metadata.id)}
                              className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                              title="删除"
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </div>

                        {/* 壁纸信息 */}
                        <div className="p-3 bg-white">
                          <div className="text-sm font-medium text-gray-800 truncate">
                            {wallpaper.metadata.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {wallpaper.metadata.width} × {wallpaper.metadata.height}
                          </div>
                          <div className="text-xs text-gray-400">
                            {(wallpaper.metadata.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )
      }

      {/* 壁纸预览模态框 */}
      {
        showPreviewModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center">
            <motion.div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowPreviewModal(false);
                setPreviewWallpaper(null);
              }}
            />
            <motion.div
              className="relative max-w-6xl max-h-[90vh] mx-4"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            >
              {/* 关闭按钮 */}
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewWallpaper(null);
                }}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
              >
                <i className="fa-solid fa-xmark text-3xl"></i>
              </button>

              {/* 预览图片 */}
              {loadingPreview ? (
                <div className="flex items-center justify-center w-96 h-64 bg-gray-800 rounded-xl">
                  <div className="text-center text-white">
                    <i className="fa-solid fa-spinner fa-spin text-4xl mb-4"></i>
                    <p className="text-lg">正在加载原图...</p>
                  </div>
                </div>
              ) : previewWallpaper ? (
                <>
                  <img
                    src={previewWallpaper.fullImageUrl}
                    alt={previewWallpaper.metadata.name}
                    className="max-w-full max-h-[80vh] rounded-xl shadow-2xl"
                  />

                  {/* 图片信息 */}
                  <div className="mt-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        {previewWallpaper.metadata.name}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {previewWallpaper.metadata.width} × {previewWallpaper.metadata.height} •{' '}
                        {(previewWallpaper.metadata.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSelectWallpaper(previewWallpaper.metadata.id)}
                        className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                      >
                        <i className="fa-solid fa-check"></i>
                        <span>使用此壁纸</span>
                      </button>
                      <button
                        onClick={() => handleDownloadWallpaper(previewWallpaper.metadata.id)}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                      >
                        <i className="fa-solid fa-download"></i>
                        <span>下载</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </motion.div>
          </div>
        )
      }

      {/* 使用统计模态框 */}
      {
        showUserStatsModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center">
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUserStatsModal(false)}
            />
            <motion.div
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              {/* 标题栏 */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                    <i className="fa-solid fa-chart-pie text-white text-sm"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">使用统计</h3>
                </div>
                <button
                  onClick={() => setShowUserStatsModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200/80 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <i className="fa-solid fa-xmark text-lg"></i>
                </button>
              </div>

              {/* 内容区域 */}
              <div className="p-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <UserStatsDisplay websites={websites} />
              </div>
            </motion.div>
          </div>
        )
      }
    </div >
  );
}

const Settings = memo(SettingsComponent);
export default Settings;
