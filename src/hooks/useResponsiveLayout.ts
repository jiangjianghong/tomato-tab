import { useState, useEffect } from 'react';

export interface ResponsiveBreakpoints {
  mobile: number;
  tablet: number;
  desktop: number;
  wide: number;
}

export interface ResponsiveLayoutConfig {
  columns: {
    mobile: number;
    tablet: number;
    tabletLandscape: number;
    desktop: number;
    wide: number;
  };
  gaps: {
    mobile: string;
    tablet: string;
    desktop: string;
  };
  cardSizes: {
    mobile: string;
    tablet: string;
    desktop: string;
  };
}

const DEFAULT_BREAKPOINTS: ResponsiveBreakpoints = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
};

const DEFAULT_LAYOUT: ResponsiveLayoutConfig = {
  columns: {
    mobile: 4,  // 移动端改为4列紧凑布局
    tablet: 3,
    tabletLandscape: 4,
    desktop: 6,
    wide: 8,
  },
  gaps: {
    mobile: 'gap-x-3 gap-y-5',
    tablet: 'gap-x-5 gap-y-10',
    desktop: 'gap-x-6 gap-y-12',
  },
  cardSizes: {
    mobile: 'w-full',
    tablet: 'w-full max-w-[180px]',
    desktop: 'w-full max-w-[200px]',
  },
};

export function useResponsiveLayout(customConfig?: Partial<ResponsiveLayoutConfig>) {
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet' | 'desktop' | 'wide'>('desktop');

  const config = { ...DEFAULT_LAYOUT, ...customConfig };

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      setScreenSize({ width, height });
      setOrientation(width > height ? 'landscape' : 'portrait');

      // 设备类型检测
      if (width < DEFAULT_BREAKPOINTS.mobile) {
        setDeviceType('mobile');
      } else if (width < DEFAULT_BREAKPOINTS.tablet) {
        setDeviceType('mobile');
      } else if (width < DEFAULT_BREAKPOINTS.desktop) {
        setDeviceType('tablet');
      } else if (width < DEFAULT_BREAKPOINTS.wide) {
        setDeviceType('desktop');
      } else {
        setDeviceType('wide');
      }
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    window.addEventListener('orientationchange', updateLayout);

    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('orientationchange', updateLayout);
    };
  }, []);

  // 获取当前布局配置
  const getCurrentLayout = () => {
    const isTabletLandscape = deviceType === 'tablet' && orientation === 'landscape';

    return {
      columns: isTabletLandscape ? config.columns.tabletLandscape : config.columns[deviceType],
      gap: config.gaps[deviceType === 'wide' ? 'desktop' : deviceType],
      cardSize: config.cardSizes[deviceType === 'wide' ? 'desktop' : deviceType],
      deviceType,
      orientation,
      screenSize,
      isMobile: deviceType === 'mobile',
      isTablet: deviceType === 'tablet',
      isDesktop: deviceType === 'desktop' || deviceType === 'wide',
      isTabletLandscape,
    };
  };

  // 获取网格类名
  const getGridClasses = () => {
    const layout = getCurrentLayout();
    const baseClasses = 'grid';

    if (layout.isMobile) {
      return `${baseClasses} grid-cols-3 ${layout.gap} px-3`;
    } else if (layout.isTablet) {
      return layout.isTabletLandscape
        ? `${baseClasses} grid-cols-4 ${layout.gap} px-4`
        : `${baseClasses} grid-cols-3 ${layout.gap} px-4`;
    } else {
      return `${baseClasses} grid-cols-4 lg:grid-cols-6 ${layout.gap} px-6`;
    }
  };

  // 获取卡片容器类名
  const getCardClasses = () => {
    const layout = getCurrentLayout();
    const baseClasses = 'relative group';

    if (layout.isMobile) {
      return `${baseClasses} ${layout.cardSize} mx-auto`;
    } else if (layout.isTablet) {
      return `${baseClasses} ${layout.cardSize} mx-auto transform transition-transform duration-200 hover:scale-105`;
    } else {
      return `${baseClasses} ${layout.cardSize} mx-auto transform transition-all duration-300 hover:scale-110 hover:z-10`;
    }
  };

  // 获取搜索栏布局
  const getSearchBarLayout = () => {
    const layout = getCurrentLayout();

    if (layout.isMobile) {
      return {
        containerClass: 'px-2 py-3',
        searchClass: 'w-full max-w-[280px] mx-auto',  // 移动端更窄的搜索框
        buttonSize: 'text-xs px-2 py-1.5',
      };
    } else if (layout.isTablet) {
      return {
        containerClass: 'px-6 py-6',
        searchClass: 'w-full max-w-2xl mx-auto',
        buttonSize: 'text-base px-4 py-2',
      };
    } else {
      return {
        containerClass: 'px-8 py-8',
        searchClass: 'w-full max-w-3xl mx-auto',
        buttonSize: 'text-lg px-6 py-3',
      };
    }
  };

  return {
    ...getCurrentLayout(),
    getGridClasses,
    getCardClasses,
    getSearchBarLayout,
  };
}
