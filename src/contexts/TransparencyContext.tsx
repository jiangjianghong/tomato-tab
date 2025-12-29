import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { WallpaperResolution, ColorOption } from '@/types/settings';

export type { WallpaperResolution, ColorOption };

export const colorOptions: ColorOption[] = [
  { name: '黑色', rgb: '0, 0, 0', preview: '#000000' },
  { name: '白色', rgb: '255, 255, 255', preview: '#ffffff' },
  { name: '红色', rgb: '239, 68, 68', preview: '#ef4444' },
  { name: '黄色', rgb: '245, 158, 11', preview: '#f59e0b' },
  { name: '蓝色', rgb: '59, 130, 246', preview: '#3b82f6' },
  { name: '绿色', rgb: '34, 197, 94', preview: '#22c55e' },
  { name: '紫色', rgb: '147, 51, 234', preview: '#9333ea' },
  { name: '粉色', rgb: '236, 72, 153', preview: '#ec4899' },
];

interface TransparencyContextType {
  cardOpacity: number;
  searchBarOpacity: number;
  parallaxEnabled: boolean;
  wallpaperResolution: WallpaperResolution;
  isSettingsOpen: boolean;
  isSearchFocused: boolean;
  cardColor: string; // RGB字符串
  searchBarColor: string; // RGB字符串
  autoSyncEnabled: boolean; // 自动同步开关
  autoSyncInterval: number; // 自动同步间隔（秒）
  searchInNewTab: boolean; // 搜索是否在新标签页打开
  autoSortEnabled: boolean; // 自动排序开关
  timeComponentEnabled: boolean; // 时间组件显示开关
  showFullDate: boolean; // 是否显示完整日期（年月日周）
  showSeconds: boolean; // 是否精确到秒
  showWeekday: boolean; // 是否显示星期
  showYear: boolean; // 是否显示年份
  showMonth: boolean; // 是否显示月份
  showDay: boolean; // 是否显示日期
  dateDisplayMode: 'yearMonth' | 'yearMonthDay'; // 日期显示模式
  searchBarBorderRadius: number; // 搜索框圆角大小（像素）
  animationStyle: 'dynamic' | 'simple'; // 动画样式：灵动或简约
  workCountdownEnabled: boolean; // 下班倒计时开关
  lunchTime: string; // 午休时间 HH:mm
  offWorkTime: string; // 下班时间 HH:mm
  aiIconDisplayMode: 'circular' | 'dropdown'; // AI图标显示模式：圆形布局或下拉面板
  atmosphereMode: 'auto' | 'snow' | 'leaf' | 'off'; // 氛围效果模式
  atmosphereParticleCount: number; // 氛围效果粒子数量
  atmosphereWindEnabled: boolean; // 风力效果开关
  darkOverlayEnabled: boolean; // 黑色遮罩开关
  darkOverlayMode: 'off' | 'always' | 'smart'; // 黑色遮罩模式：关闭/始终/智能
  isSlowMotion: boolean; // 粒子慢放状态（鼠标按住空白区域时激活）
  darkMode: boolean; // 夜间模式开关（计算属性）
  darkModePreference: 'system' | 'on' | 'off' | 'scheduled'; // 夜间模式偏好
  darkModeScheduleStart: string; // 定时开始时间 HH:mm
  darkModeScheduleEnd: string; // 定时结束时间 HH:mm
  setCardOpacity: (opacity: number) => void;
  setSearchBarOpacity: (opacity: number) => void;
  setParallaxEnabled: (enabled: boolean) => void;
  setWallpaperResolution: (resolution: WallpaperResolution) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsSearchFocused: (focused: boolean) => void;
  setCardColor: (color: string) => void;
  setSearchBarColor: (color: string) => void;
  setAutoSyncEnabled: (enabled: boolean) => void;
  setAutoSyncInterval: (interval: number) => void;
  setSearchInNewTab: (enabled: boolean) => void;
  setAutoSortEnabled: (enabled: boolean) => void;
  setTimeComponentEnabled: (enabled: boolean) => void;
  setShowFullDate: (enabled: boolean) => void;
  setShowSeconds: (enabled: boolean) => void;
  setShowWeekday: (enabled: boolean) => void;
  setShowYear: (enabled: boolean) => void;
  setShowMonth: (enabled: boolean) => void;
  setShowDay: (enabled: boolean) => void;
  setDateDisplayMode: (mode: 'yearMonth' | 'yearMonthDay') => void;
  setSearchBarBorderRadius: (radius: number) => void;
  setAnimationStyle: (style: 'dynamic' | 'simple') => void;
  setWorkCountdownEnabled: (enabled: boolean) => void;
  setLunchTime: (time: string) => void;
  setOffWorkTime: (time: string) => void;
  setAiIconDisplayMode: (mode: 'circular' | 'dropdown') => void;
  setAtmosphereMode: (mode: 'auto' | 'snow' | 'leaf' | 'off') => void;
  setAtmosphereParticleCount: (count: number) => void;
  setAtmosphereWindEnabled: (enabled: boolean) => void;
  setDarkOverlayEnabled: (enabled: boolean) => void;
  setDarkOverlayMode: (mode: 'off' | 'always' | 'smart') => void;
  setDarkModePreference: (preference: 'system' | 'on' | 'off' | 'scheduled') => void;
  setDarkModeScheduleStart: (time: string) => void;
  setDarkModeScheduleEnd: (time: string) => void;
  setIsSlowMotion: (value: boolean) => void;
}

const TransparencyContext = createContext<TransparencyContextType | undefined>(undefined);

export function TransparencyProvider({ children }: { children: ReactNode }) {
  const [cardOpacity, setCardOpacity] = useState(() => {
    const saved = localStorage.getItem('cardOpacity');
    let value = saved ? parseFloat(saved) : 0.1; // 默认值设置为 0.1
    if (value > 1) value = value / 100; // 兼容旧数据
    return Math.max(0.05, Math.min(1, value)); // 限制范围
  });

  const [searchBarOpacity, setSearchBarOpacity] = useState(() => {
    const saved = localStorage.getItem('searchBarOpacity');
    let value = saved ? parseFloat(saved) : 0.1; // 默认值设置为 0.1
    if (value > 1) value = value / 100; // 兼容旧数据
    return Math.max(0.05, Math.min(1, value)); // 限制范围
  });

  const [parallaxEnabled, setParallaxEnabled] = useState(() => {
    const saved = localStorage.getItem('parallaxEnabled');
    return saved ? JSON.parse(saved) : true;
  });

  // 颜色状态管理
  const [cardColor, setCardColor] = useState(() => {
    const saved = localStorage.getItem('cardColor');
    return saved || '255, 255, 255'; // 默认白色
  });

  const [searchBarColor, setSearchBarColor] = useState(() => {
    const saved = localStorage.getItem('searchBarColor');
    return saved || '255, 255, 255'; // 默认白色
  });

  // 获取默认壁纸分辨率（根据宽高比判断）
  const getDefaultResolution = (): WallpaperResolution => {
    // 使用宽高比判断：ratio < 1 表示竖屏，使用mobile壁纸；ratio >= 1 表示横屏，使用1080p壁纸
    const aspectRatio = window.innerWidth / window.innerHeight;
    if (aspectRatio < 1) {
      return 'mobile';
    }

    // 横屏设备，默认使用1080p
    return '1080p';
  };

  const [wallpaperResolution, setWallpaperResolution] = useState<WallpaperResolution>(() => {
    const saved = localStorage.getItem('wallpaperResolution') as WallpaperResolution;
    return saved || getDefaultResolution();
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // 自动同步设置
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => {
    const saved = localStorage.getItem('autoSyncEnabled');
    return saved ? saved === 'true' : true; // 默认开启
  });

  const [autoSyncInterval, setAutoSyncInterval] = useState(() => {
    const saved = localStorage.getItem('autoSyncInterval');
    const value = saved ? parseInt(saved) : 10; // 默认10秒
    return Math.max(3, Math.min(60, value)); // 限制在3-60秒之间
  });

  // 搜索行为设置
  const [searchInNewTab, setSearchInNewTab] = useState(() => {
    const saved = localStorage.getItem('searchInNewTab');
    return saved ? saved === 'true' : true; // 默认在新标签页打开
  });

  // 自动排序设置
  const [autoSortEnabled, setAutoSortEnabled] = useState<boolean>(false);

  // 时间组件显示开关
  const [timeComponentEnabled, setTimeComponentEnabled] = useState(() => {
    const saved = localStorage.getItem('timeComponentEnabled');
    return saved ? saved === 'true' : true; // 默认开启
  });

  // 时间显示格式设置
  const [showFullDate, setShowFullDate] = useState(() => {
    const saved = localStorage.getItem('showFullDate');
    return saved ? saved === 'true' : true; // 默认显示完整日期
  });

  const [showSeconds, setShowSeconds] = useState(() => {
    const saved = localStorage.getItem('showSeconds');
    return saved ? saved === 'true' : true; // 默认精确到秒
  });

  const [showWeekday, setShowWeekday] = useState(() => {
    const saved = localStorage.getItem('showWeekday');
    return saved ? saved === 'true' : true; // 默认显示星期
  });

  const [showYear, setShowYear] = useState(() => {
    const saved = localStorage.getItem('showYear');
    return saved ? saved === 'true' : true; // 默认显示年份
  });

  const [showMonth, setShowMonth] = useState(() => {
    const saved = localStorage.getItem('showMonth');
    return saved ? saved === 'true' : true; // 默认显示月份
  });

  const [showDay, setShowDay] = useState(() => {
    const saved = localStorage.getItem('showDay');
    return saved ? saved === 'true' : true; // 默认显示日期
  });

  const [dateDisplayMode, setDateDisplayMode] = useState<'yearMonth' | 'yearMonthDay'>(() => {
    const saved = localStorage.getItem('dateDisplayMode') as 'yearMonth' | 'yearMonthDay';
    return saved || 'yearMonthDay'; // 默认显示年月日
  });

  const [searchBarBorderRadius, setSearchBarBorderRadius] = useState(() => {
    const saved = localStorage.getItem('searchBarBorderRadius');
    const value = saved ? parseInt(saved) : 9999; // 默认全圆角
    return Math.max(0, Math.min(50, value)); // 限制在0-50px之间
  });

  // 动画样式设置
  const [animationStyle, setAnimationStyle] = useState<'dynamic' | 'simple'>(() => {
    const saved = localStorage.getItem('animationStyle') as 'dynamic' | 'simple';
    return saved || 'simple'; // 默认简约
  });

  // 下班倒计时设置
  const [workCountdownEnabled, setWorkCountdownEnabled] = useState(() => {
    const saved = localStorage.getItem('workCountdownEnabled');
    return saved ? saved === 'true' : false; // 默认关闭
  });

  const [lunchTime, setLunchTime] = useState(() => {
    const saved = localStorage.getItem('lunchTime');
    return saved || '12:00'; // 默认午休时间
  });

  const [offWorkTime, setOffWorkTime] = useState(() => {
    const saved = localStorage.getItem('offWorkTime');
    return saved || '18:00'; // 默认下班时间
  });

  // AI图标显示模式
  const [aiIconDisplayMode, setAiIconDisplayMode] = useState<'circular' | 'dropdown'>(() => {
    const saved = localStorage.getItem('aiIconDisplayMode') as 'circular' | 'dropdown';
    return saved || 'circular'; // 默认圆形布局
  });

  // 氛围效果模式（自动/雪花/落叶/关闭）
  const [atmosphereMode, setAtmosphereMode] = useState<'auto' | 'snow' | 'leaf' | 'off'>(() => {
    const saved = localStorage.getItem('atmosphereMode');
    // 兼容旧的 atmosphereEnabled 配置
    if (!saved) {
      const oldEnabled = localStorage.getItem('atmosphereEnabled');
      return oldEnabled === 'false' ? 'off' : 'auto';
    }
    return (saved as 'auto' | 'snow' | 'leaf' | 'off') || 'auto';
  });

  // 氛围效果粒子数量（1-200，滑轨档位1-100对应粒子数2-200）
  const [atmosphereParticleCount, setAtmosphereParticleCount] = useState(() => {
    const saved = localStorage.getItem('atmosphereParticleCount');
    const value = saved ? parseInt(saved, 10) : 60; // 默认30档对应60个粒子
    return Math.min(Math.max(value, 1), 200); // 限制在 1-200 范围内
  });

  // 风力效果开关
  const [atmosphereWindEnabled, setAtmosphereWindEnabled] = useState(() => {
    const saved = localStorage.getItem('atmosphereWindEnabled');
    return saved ? saved === 'true' : true; // 默认开启
  });

  // 黑色遮罩开关（壁纸暗角效果）
  const [darkOverlayEnabled, setDarkOverlayEnabled] = useState(() => {
    const saved = localStorage.getItem('darkOverlayEnabled');
    return saved ? saved === 'true' : false; // 默认关闭
  });

  // 黑色遮罩模式：关闭/始终/智能
  const [darkOverlayMode, setDarkOverlayMode] = useState<'off' | 'always' | 'smart'>(() => {
    const saved = localStorage.getItem('darkOverlayMode') as 'off' | 'always' | 'smart';
    return saved || 'smart'; // 默认智能模式
  });

  // 粒子慢放状态（鼠标按住空白区域时激活，不需要持久化）
  const [isSlowMotion, setIsSlowMotion] = useState(false);

  // 夜间模式偏好设置
  const [darkModePreference, setDarkModePreference] = useState<'system' | 'on' | 'off' | 'scheduled'>(() => {
    const saved = localStorage.getItem('darkModePreference') as 'system' | 'on' | 'off' | 'scheduled';
    return saved || 'system'; // 默认跟随系统
  });

  // 定时开始时间
  const [darkModeScheduleStart, setDarkModeScheduleStart] = useState(() => {
    const saved = localStorage.getItem('darkModeScheduleStart');
    return saved || '22:00'; // 默认晚上10点
  });

  // 定时结束时间
  const [darkModeScheduleEnd, setDarkModeScheduleEnd] = useState(() => {
    const saved = localStorage.getItem('darkModeScheduleEnd');
    return saved || '06:00'; // 默认早上6点
  });

  // 用于触发定时模式更新的时间状态
  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // 每分钟更新一次，用于定时模式
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentMinute(now.getHours() * 60 + now.getMinutes());
    }, 60000); // 每分钟检查一次
    return () => clearInterval(interval);
  }, []);

  // 判断当前时间是否在定时范围内
  const isInScheduledTime = (start: string, end: string): boolean => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // 处理跨天情况（如 22:00 - 06:00）
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    // 同一天内
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  };

  // 监听系统主题变化
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 计算当前是否应该启用深色模式
  const darkMode = useMemo(() => {
    switch (darkModePreference) {
      case 'on':
        return true;
      case 'off':
        return false;
      case 'scheduled':
        return isInScheduledTime(darkModeScheduleStart, darkModeScheduleEnd);
      case 'system':
      default:
        return systemPrefersDark;
    }
  }, [darkModePreference, darkModeScheduleStart, darkModeScheduleEnd, systemPrefersDark, currentMinute]);

  // 初始化autoSortEnabled从localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('autoSortEnabled');
      if (saved !== null) {
        setAutoSortEnabled(saved === 'true');
      }
    } catch (error) {
      console.warn('Failed to read autoSortEnabled from localStorage:', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cardOpacity', cardOpacity.toString());
  }, [cardOpacity]);

  useEffect(() => {
    localStorage.setItem('searchBarOpacity', searchBarOpacity.toString());
  }, [searchBarOpacity]);

  useEffect(() => {
    localStorage.setItem('parallaxEnabled', JSON.stringify(parallaxEnabled));
  }, [parallaxEnabled]);

  useEffect(() => {
    localStorage.setItem('wallpaperResolution', wallpaperResolution);
  }, [wallpaperResolution]);

  useEffect(() => {
    localStorage.setItem('autoSyncEnabled', autoSyncEnabled.toString());
  }, [autoSyncEnabled]);

  useEffect(() => {
    localStorage.setItem('autoSyncInterval', autoSyncInterval.toString());
  }, [autoSyncInterval]);

  useEffect(() => {
    localStorage.setItem('cardColor', cardColor);
  }, [cardColor]);

  useEffect(() => {
    localStorage.setItem('searchBarColor', searchBarColor);
  }, [searchBarColor]);

  useEffect(() => {
    localStorage.setItem('searchInNewTab', searchInNewTab.toString());
  }, [searchInNewTab]);

  useEffect(() => {
    localStorage.setItem('autoSortEnabled', autoSortEnabled.toString());
  }, [autoSortEnabled]);

  useEffect(() => {
    localStorage.setItem('timeComponentEnabled', timeComponentEnabled.toString());
  }, [timeComponentEnabled]);

  useEffect(() => {
    localStorage.setItem('showFullDate', showFullDate.toString());
  }, [showFullDate]);

  useEffect(() => {
    localStorage.setItem('showSeconds', showSeconds.toString());
  }, [showSeconds]);

  useEffect(() => {
    localStorage.setItem('showWeekday', showWeekday.toString());
  }, [showWeekday]);

  useEffect(() => {
    localStorage.setItem('showYear', showYear.toString());
  }, [showYear]);

  useEffect(() => {
    localStorage.setItem('showMonth', showMonth.toString());
  }, [showMonth]);

  useEffect(() => {
    localStorage.setItem('showDay', showDay.toString());
  }, [showDay]);

  useEffect(() => {
    localStorage.setItem('dateDisplayMode', dateDisplayMode);
  }, [dateDisplayMode]);

  useEffect(() => {
    localStorage.setItem('searchBarBorderRadius', searchBarBorderRadius.toString());
  }, [searchBarBorderRadius]);

  useEffect(() => {
    localStorage.setItem('animationStyle', animationStyle);
  }, [animationStyle]);

  useEffect(() => {
    localStorage.setItem('workCountdownEnabled', workCountdownEnabled.toString());
  }, [workCountdownEnabled]);

  useEffect(() => {
    localStorage.setItem('lunchTime', lunchTime);
  }, [lunchTime]);

  useEffect(() => {
    localStorage.setItem('offWorkTime', offWorkTime);
  }, [offWorkTime]);

  useEffect(() => {
    localStorage.setItem('aiIconDisplayMode', aiIconDisplayMode);
  }, [aiIconDisplayMode]);

  useEffect(() => {
    localStorage.setItem('atmosphereMode', atmosphereMode);
  }, [atmosphereMode]);

  useEffect(() => {
    localStorage.setItem('atmosphereParticleCount', atmosphereParticleCount.toString());
  }, [atmosphereParticleCount]);

  useEffect(() => {
    localStorage.setItem('atmosphereWindEnabled', atmosphereWindEnabled.toString());
  }, [atmosphereWindEnabled]);

  useEffect(() => {
    localStorage.setItem('darkOverlayEnabled', darkOverlayEnabled.toString());
  }, [darkOverlayEnabled]);

  useEffect(() => {
    localStorage.setItem('darkOverlayMode', darkOverlayMode);
  }, [darkOverlayMode]);

  // 夜间模式偏好设置持久化
  useEffect(() => {
    localStorage.setItem('darkModePreference', darkModePreference);
  }, [darkModePreference]);

  useEffect(() => {
    localStorage.setItem('darkModeScheduleStart', darkModeScheduleStart);
  }, [darkModeScheduleStart]);

  useEffect(() => {
    localStorage.setItem('darkModeScheduleEnd', darkModeScheduleEnd);
  }, [darkModeScheduleEnd]);

  // 夜间模式主题应用
  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [darkMode]);

  const contextValue = React.useMemo(() => ({
    cardOpacity,
    searchBarOpacity,
    parallaxEnabled,
    wallpaperResolution,
    isSettingsOpen,
    isSearchFocused,
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
    dateDisplayMode,
    searchBarBorderRadius,
    animationStyle,
    workCountdownEnabled,
    lunchTime,
    offWorkTime,
    aiIconDisplayMode,
    atmosphereMode,
    atmosphereParticleCount,
    atmosphereWindEnabled,
    darkOverlayEnabled,
    darkOverlayMode,
    darkMode,
    darkModePreference,
    darkModeScheduleStart,
    darkModeScheduleEnd,
    isSlowMotion,
    setCardOpacity,
    setSearchBarOpacity,
    setParallaxEnabled,
    setWallpaperResolution,
    setIsSettingsOpen,
    setIsSearchFocused,
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
    setDateDisplayMode,
    setSearchBarBorderRadius,
    setAnimationStyle,
    setWorkCountdownEnabled,
    setLunchTime,
    setOffWorkTime,
    setAiIconDisplayMode,
    setAtmosphereMode,
    setAtmosphereParticleCount,
    setAtmosphereWindEnabled,
    setDarkOverlayEnabled,
    setDarkOverlayMode,
    setDarkModePreference,
    setDarkModeScheduleStart,
    setDarkModeScheduleEnd,
    setIsSlowMotion,
  }), [
    cardOpacity, searchBarOpacity, parallaxEnabled, wallpaperResolution, isSettingsOpen, isSearchFocused, cardColor, searchBarColor,
    autoSyncEnabled, autoSyncInterval, searchInNewTab, autoSortEnabled, timeComponentEnabled, showFullDate, showSeconds, showWeekday,
    showYear, showMonth, showDay, dateDisplayMode, searchBarBorderRadius, animationStyle, workCountdownEnabled, lunchTime, offWorkTime, aiIconDisplayMode, atmosphereMode, atmosphereParticleCount, atmosphereWindEnabled, darkOverlayEnabled, darkOverlayMode, darkMode, darkModePreference, darkModeScheduleStart, darkModeScheduleEnd, isSlowMotion
  ]);

  return (
    <TransparencyContext.Provider value={contextValue}>
      {children}
    </TransparencyContext.Provider>
  );
}

export function useTransparency() {
  const context = useContext(TransparencyContext);
  if (context === undefined) {
    throw new Error('useTransparency must be used within a TransparencyProvider');
  }
  return context;
}
