import { useCallback } from 'react';
import { WallpaperResolution } from '@/contexts/TransparencyContext';

interface SettingsData {
  cardOpacity: number;
  searchBarOpacity: number;
  parallaxEnabled: boolean;
  wallpaperResolution: WallpaperResolution;
  theme: string;
  cardColor: string;
  searchBarColor: string;
  autoSyncEnabled: boolean;
  autoSyncInterval: number;
  searchInNewTab: boolean;
  autoSortEnabled: boolean;
  timeComponentEnabled: boolean;
  showFullDate: boolean;
  showSeconds: boolean;
  showWeekday: boolean;
  showYear: boolean;
  showMonth: boolean;
  showDay: boolean;
  dateDisplayMode: 'yearMonth' | 'yearMonthDay';
  searchBarBorderRadius: number;
  animationStyle: 'dynamic' | 'simple';
  workCountdownEnabled: boolean;
  lunchTime: string;
  offWorkTime: string;
  aiIconDisplayMode: 'circular' | 'dropdown';
  atmosphereMode: 'auto' | 'snow' | 'leaf' | 'cherry' | 'firefly' | 'off';
  atmosphereParticleCount: number;
  atmosphereWindEnabled: boolean;
  darkOverlayEnabled: boolean;
  darkOverlayMode: 'off' | 'always' | 'smart';
  darkModePreference: 'system' | 'on' | 'off' | 'scheduled';
  darkModeScheduleStart: string;
  darkModeScheduleEnd: string;
}

interface UseSettingsManagerReturn {
  exportSettings: () => SettingsData;
  importSettings: (settings: any) => { success: boolean; appliedSettings: string[] };
  validateSettings: (settings: any) => { valid: boolean; errors: string[] };
}

/**
 * 统一的设置管理Hook
 * 处理设置的导出、导入和验证
 */
export function useSettingsManager(): UseSettingsManagerReturn {
  // 导出当前设置
  const exportSettings = useCallback((): SettingsData => {
    try {
      return {
        cardOpacity: parseFloat(localStorage.getItem('cardOpacity') || '0.1'),
        searchBarOpacity: parseFloat(localStorage.getItem('searchBarOpacity') || '0.1'),
        parallaxEnabled: JSON.parse(localStorage.getItem('parallaxEnabled') || 'true'),
        wallpaperResolution: (localStorage.getItem('wallpaperResolution') ||
          '1080p') as WallpaperResolution,
        theme: localStorage.getItem('theme') || 'light',
        cardColor: localStorage.getItem('cardColor') || '255, 255, 255',
        searchBarColor: localStorage.getItem('searchBarColor') || '255, 255, 255',
        autoSyncEnabled: localStorage.getItem('autoSyncEnabled') === 'true',
        autoSyncInterval: parseInt(localStorage.getItem('autoSyncInterval') || '30'),
        searchInNewTab: localStorage.getItem('searchInNewTab') !== 'false', // 默认为 true
        autoSortEnabled: localStorage.getItem('autoSortEnabled') === 'true',
        timeComponentEnabled: localStorage.getItem('timeComponentEnabled') !== 'false', // 默认为 true
        showFullDate: localStorage.getItem('showFullDate') !== 'false', // 默认为 true
        showSeconds: localStorage.getItem('showSeconds') !== 'false', // 默认为 true
        showWeekday: localStorage.getItem('showWeekday') !== 'false', // 默认为 true
        showYear: localStorage.getItem('showYear') !== 'false', // 默认为 true
        showMonth: localStorage.getItem('showMonth') !== 'false', // 默认为 true
        showDay: localStorage.getItem('showDay') !== 'false', // 默认为 true
        dateDisplayMode: (localStorage.getItem('dateDisplayMode') || 'yearMonthDay') as
          | 'yearMonth'
          | 'yearMonthDay',
        searchBarBorderRadius: parseInt(localStorage.getItem('searchBarBorderRadius') || '9999'),
        animationStyle: (localStorage.getItem('animationStyle') || 'simple') as
          | 'dynamic'
          | 'simple',
        workCountdownEnabled: localStorage.getItem('workCountdownEnabled') === 'true',
        lunchTime: localStorage.getItem('lunchTime') || '12:00',
        offWorkTime: localStorage.getItem('offWorkTime') || '18:00',
        aiIconDisplayMode: (localStorage.getItem('aiIconDisplayMode') || 'circular') as
          | 'circular'
          | 'dropdown',
        atmosphereMode: (localStorage.getItem('atmosphereMode') || 'auto') as
          | 'auto'
          | 'snow'
          | 'leaf'
          | 'cherry'
          | 'firefly'
          | 'off',
        atmosphereParticleCount: parseInt(localStorage.getItem('atmosphereParticleCount') || '60'),
        atmosphereWindEnabled: localStorage.getItem('atmosphereWindEnabled') !== 'false',
        darkOverlayEnabled: localStorage.getItem('darkOverlayEnabled') === 'true',
        darkOverlayMode: (localStorage.getItem('darkOverlayMode') || 'smart') as
          | 'off'
          | 'always'
          | 'smart',
        darkModePreference: (localStorage.getItem('darkModePreference') || 'system') as
          | 'system'
          | 'on'
          | 'off'
          | 'scheduled',
        darkModeScheduleStart: localStorage.getItem('darkModeScheduleStart') || '22:00',
        darkModeScheduleEnd: localStorage.getItem('darkModeScheduleEnd') || '06:00',
      };
    } catch (error) {
      console.warn('导出设置失败，使用默认值:', error);
      return {
        cardOpacity: 0.1,
        searchBarOpacity: 0.1,
        parallaxEnabled: true,
        wallpaperResolution: '1080p',
        theme: 'light',
        cardColor: '255, 255, 255',
        searchBarColor: '255, 255, 255',
        autoSyncEnabled: true,
        autoSyncInterval: 30,
        searchInNewTab: true,
        autoSortEnabled: false,
        timeComponentEnabled: true,
        showFullDate: true,
        showSeconds: true,
        showWeekday: true,
        showYear: true,
        showMonth: true,
        showDay: true,
        dateDisplayMode: 'yearMonthDay',
        searchBarBorderRadius: 9999,
        animationStyle: 'simple',
        workCountdownEnabled: false,
        lunchTime: '12:00',
        offWorkTime: '18:00',
        aiIconDisplayMode: 'circular',
        atmosphereMode: 'auto',
        atmosphereParticleCount: 60,
        atmosphereWindEnabled: true,
        darkOverlayEnabled: false,
        darkOverlayMode: 'smart',
        darkModePreference: 'system',
        darkModeScheduleStart: '22:00',
        darkModeScheduleEnd: '06:00',
      };
    }
  }, []);

  // 验证设置数据
  const validateSettings = useCallback((settings: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (settings.cardOpacity !== undefined) {
      if (
        typeof settings.cardOpacity !== 'number' ||
        settings.cardOpacity < 0.05 ||
        settings.cardOpacity > 0.3
      ) {
        errors.push('卡片透明度值无效（应在0.05-0.3之间）');
      }
    }

    if (settings.searchBarOpacity !== undefined) {
      if (
        typeof settings.searchBarOpacity !== 'number' ||
        settings.searchBarOpacity < 0.05 ||
        settings.searchBarOpacity > 0.3
      ) {
        errors.push('搜索框透明度值无效（应在0.05-0.3之间）');
      }
    }

    if (settings.parallaxEnabled !== undefined) {
      if (typeof settings.parallaxEnabled !== 'boolean') {
        errors.push('视差效果设置值无效（应为true或false）');
      }
    }

    if (settings.wallpaperResolution !== undefined) {
      if (!['4k', '1080p', '720p', 'mobile'].includes(settings.wallpaperResolution)) {
        errors.push('壁纸分辨率值无效');
      }
    }

    if (settings.theme !== undefined) {
      if (!['light', 'dark'].includes(settings.theme)) {
        errors.push('主题值无效（应为light或dark）');
      }
    }

    if (settings.cardColor !== undefined && typeof settings.cardColor !== 'string') {
      errors.push('卡片颜色值无效');
    }

    if (settings.searchBarColor !== undefined && typeof settings.searchBarColor !== 'string') {
      errors.push('搜索框颜色值无效');
    }

    if (settings.autoSyncEnabled !== undefined && typeof settings.autoSyncEnabled !== 'boolean') {
      errors.push('自动同步设置无效');
    }

    if (settings.autoSyncInterval !== undefined) {
      if (
        typeof settings.autoSyncInterval !== 'number' ||
        settings.autoSyncInterval < 3 ||
        settings.autoSyncInterval > 60
      ) {
        errors.push('自动同步间隔无效（应在3-60秒之间）');
      }
    }

    if (settings.searchInNewTab !== undefined && typeof settings.searchInNewTab !== 'boolean') {
      errors.push('搜索新标签页设置无效');
    }

    if (settings.autoSortEnabled !== undefined && typeof settings.autoSortEnabled !== 'boolean') {
      errors.push('自动排序设置无效');
    }

    if (
      settings.timeComponentEnabled !== undefined &&
      typeof settings.timeComponentEnabled !== 'boolean'
    ) {
      errors.push('时间组件设置无效');
    }

    if (settings.showFullDate !== undefined && typeof settings.showFullDate !== 'boolean') {
      errors.push('日期显示设置无效');
    }

    if (settings.showSeconds !== undefined && typeof settings.showSeconds !== 'boolean') {
      errors.push('秒数显示设置无效');
    }

    if (settings.showWeekday !== undefined && typeof settings.showWeekday !== 'boolean') {
      errors.push('星期显示设置无效');
    }

    if (settings.showYear !== undefined && typeof settings.showYear !== 'boolean') {
      errors.push('年份显示设置无效');
    }

    if (settings.showMonth !== undefined && typeof settings.showMonth !== 'boolean') {
      errors.push('月份显示设置无效');
    }

    if (settings.showDay !== undefined && typeof settings.showDay !== 'boolean') {
      errors.push('日期显示设置无效');
    }

    if (settings.dateDisplayMode !== undefined) {
      if (!['yearMonth', 'yearMonthDay'].includes(settings.dateDisplayMode)) {
        errors.push('日期显示模式无效');
      }
    }

    if (settings.searchBarBorderRadius !== undefined) {
      if (
        typeof settings.searchBarBorderRadius !== 'number' ||
        settings.searchBarBorderRadius < 0 ||
        settings.searchBarBorderRadius > 50
      ) {
        // 9999 是特殊值，表示全圆角
        if (settings.searchBarBorderRadius !== 9999) {
          errors.push('搜索框圆角设置无效');
        }
      }
    }

    if (settings.animationStyle !== undefined) {
      if (!['dynamic', 'simple'].includes(settings.animationStyle)) {
        errors.push('动画样式设置无效');
      }
    }

    if (
      settings.workCountdownEnabled !== undefined &&
      typeof settings.workCountdownEnabled !== 'boolean'
    ) {
      errors.push('下班倒计时设置无效');
    }

    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (settings.lunchTime !== undefined && !TIME_RE.test(settings.lunchTime)) {
      errors.push('午休时间格式无效');
    }
    if (settings.offWorkTime !== undefined && !TIME_RE.test(settings.offWorkTime)) {
      errors.push('下班时间格式无效');
    }

    if (
      settings.aiIconDisplayMode !== undefined &&
      !['circular', 'dropdown'].includes(settings.aiIconDisplayMode)
    ) {
      errors.push('AI 图标显示模式无效');
    }

    if (
      settings.atmosphereMode !== undefined &&
      !['auto', 'snow', 'leaf', 'cherry', 'firefly', 'off'].includes(settings.atmosphereMode)
    ) {
      errors.push('氛围效果模式无效');
    }

    if (settings.atmosphereParticleCount !== undefined) {
      if (
        typeof settings.atmosphereParticleCount !== 'number' ||
        settings.atmosphereParticleCount < 1 ||
        settings.atmosphereParticleCount > 200
      ) {
        errors.push('氛围粒子数量无效（应在 1-200 之间）');
      }
    }

    if (
      settings.atmosphereWindEnabled !== undefined &&
      typeof settings.atmosphereWindEnabled !== 'boolean'
    ) {
      errors.push('风力效果设置无效');
    }

    if (
      settings.darkOverlayEnabled !== undefined &&
      typeof settings.darkOverlayEnabled !== 'boolean'
    ) {
      errors.push('黑色遮罩开关无效');
    }

    if (
      settings.darkOverlayMode !== undefined &&
      !['off', 'always', 'smart'].includes(settings.darkOverlayMode)
    ) {
      errors.push('黑色遮罩模式无效');
    }

    if (
      settings.darkModePreference !== undefined &&
      !['system', 'on', 'off', 'scheduled'].includes(settings.darkModePreference)
    ) {
      errors.push('夜间模式偏好无效');
    }

    if (settings.darkModeScheduleStart !== undefined && !TIME_RE.test(settings.darkModeScheduleStart)) {
      errors.push('夜间模式开始时间格式无效');
    }
    if (settings.darkModeScheduleEnd !== undefined && !TIME_RE.test(settings.darkModeScheduleEnd)) {
      errors.push('夜间模式结束时间格式无效');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }, []);

  // 导入并应用设置（原子操作）
  const importSettings = useCallback(
    (settings: any): { success: boolean; appliedSettings: string[] } => {
      const validation = validateSettings(settings);
      const appliedSettings: string[] = [];

      if (!validation.valid) {
        console.warn('设置验证失败:', validation.errors);
        return { success: false, appliedSettings: [] };
      }

      // 准备所有要应用的设置
      const settingsToApply: Array<{ key: string; value: string; label: string }> = [];

      if (typeof settings.cardOpacity === 'number') {
        settingsToApply.push({
          key: 'cardOpacity',
          value: settings.cardOpacity.toString(),
          label: '卡片透明度',
        });
      }

      if (typeof settings.searchBarOpacity === 'number') {
        settingsToApply.push({
          key: 'searchBarOpacity',
          value: settings.searchBarOpacity.toString(),
          label: '搜索框透明度',
        });
      }

      if (typeof settings.parallaxEnabled === 'boolean') {
        settingsToApply.push({
          key: 'parallaxEnabled',
          value: JSON.stringify(settings.parallaxEnabled),
          label: '视差效果',
        });
      }

      if (
        settings.wallpaperResolution &&
        ['4k', '1080p', '720p', 'mobile'].includes(settings.wallpaperResolution)
      ) {
        settingsToApply.push({
          key: 'wallpaperResolution',
          value: settings.wallpaperResolution,
          label: '壁纸分辨率',
        });
      }

      if (settings.theme && ['light', 'dark'].includes(settings.theme)) {
        settingsToApply.push({
          key: 'theme',
          value: settings.theme,
          label: '主题',
        });
      }

      if (settings.cardColor) {
        settingsToApply.push({
          key: 'cardColor',
          value: settings.cardColor,
          label: '卡片颜色',
        });
      }

      if (settings.searchBarColor) {
        settingsToApply.push({
          key: 'searchBarColor',
          value: settings.searchBarColor,
          label: '搜索框颜色',
        });
      }

      if (typeof settings.autoSyncEnabled === 'boolean') {
        settingsToApply.push({
          key: 'autoSyncEnabled',
          value: settings.autoSyncEnabled.toString(),
          label: '自动同步',
        });
      }

      if (typeof settings.autoSyncInterval === 'number') {
        settingsToApply.push({
          key: 'autoSyncInterval',
          value: settings.autoSyncInterval.toString(),
          label: '自动同步间隔',
        });
      }

      if (typeof settings.searchInNewTab === 'boolean') {
        settingsToApply.push({
          key: 'searchInNewTab',
          value: settings.searchInNewTab.toString(),
          label: '新标签页搜索',
        });
      }

      if (typeof settings.autoSortEnabled === 'boolean') {
        settingsToApply.push({
          key: 'autoSortEnabled',
          value: settings.autoSortEnabled.toString(),
          label: '自动排序',
        });
      }

      if (typeof settings.timeComponentEnabled === 'boolean') {
        settingsToApply.push({
          key: 'timeComponentEnabled',
          value: settings.timeComponentEnabled.toString(),
          label: '时间组件',
        });
      }

      if (typeof settings.showFullDate === 'boolean') {
        settingsToApply.push({
          key: 'showFullDate',
          value: settings.showFullDate.toString(),
          label: '完整日期',
        });
      }

      if (typeof settings.showSeconds === 'boolean') {
        settingsToApply.push({
          key: 'showSeconds',
          value: settings.showSeconds.toString(),
          label: '显示秒数',
        });
      }

      if (typeof settings.showWeekday === 'boolean') {
        settingsToApply.push({
          key: 'showWeekday',
          value: settings.showWeekday.toString(),
          label: '显示星期',
        });
      }

      if (typeof settings.showYear === 'boolean') {
        settingsToApply.push({
          key: 'showYear',
          value: settings.showYear.toString(),
          label: '显示年份',
        });
      }

      if (typeof settings.showMonth === 'boolean') {
        settingsToApply.push({
          key: 'showMonth',
          value: settings.showMonth.toString(),
          label: '显示月份',
        });
      }

      if (typeof settings.showDay === 'boolean') {
        settingsToApply.push({
          key: 'showDay',
          value: settings.showDay.toString(),
          label: '显示日期',
        });
      }

      if (settings.dateDisplayMode) {
        settingsToApply.push({
          key: 'dateDisplayMode',
          value: settings.dateDisplayMode,
          label: '日期显示模式',
        });
      }

      if (typeof settings.searchBarBorderRadius === 'number') {
        settingsToApply.push({
          key: 'searchBarBorderRadius',
          value: settings.searchBarBorderRadius.toString(),
          label: '搜索框圆角',
        });
      }

      if (settings.animationStyle) {
        settingsToApply.push({
          key: 'animationStyle',
          value: settings.animationStyle,
          label: '动画样式',
        });
      }

      if (typeof settings.workCountdownEnabled === 'boolean') {
        settingsToApply.push({
          key: 'workCountdownEnabled',
          value: settings.workCountdownEnabled.toString(),
          label: '下班倒计时',
        });
      }

      if (settings.lunchTime) {
        settingsToApply.push({ key: 'lunchTime', value: settings.lunchTime, label: '午休时间' });
      }

      if (settings.offWorkTime) {
        settingsToApply.push({ key: 'offWorkTime', value: settings.offWorkTime, label: '下班时间' });
      }

      if (settings.aiIconDisplayMode) {
        settingsToApply.push({
          key: 'aiIconDisplayMode',
          value: settings.aiIconDisplayMode,
          label: 'AI 图标显示模式',
        });
      }

      if (settings.atmosphereMode) {
        settingsToApply.push({
          key: 'atmosphereMode',
          value: settings.atmosphereMode,
          label: '氛围效果模式',
        });
      }

      if (typeof settings.atmosphereParticleCount === 'number') {
        settingsToApply.push({
          key: 'atmosphereParticleCount',
          value: settings.atmosphereParticleCount.toString(),
          label: '氛围粒子数量',
        });
      }

      if (typeof settings.atmosphereWindEnabled === 'boolean') {
        settingsToApply.push({
          key: 'atmosphereWindEnabled',
          value: settings.atmosphereWindEnabled.toString(),
          label: '风力效果',
        });
      }

      if (typeof settings.darkOverlayEnabled === 'boolean') {
        settingsToApply.push({
          key: 'darkOverlayEnabled',
          value: settings.darkOverlayEnabled.toString(),
          label: '黑色遮罩开关',
        });
      }

      if (settings.darkOverlayMode) {
        settingsToApply.push({
          key: 'darkOverlayMode',
          value: settings.darkOverlayMode,
          label: '黑色遮罩模式',
        });
      }

      if (settings.darkModePreference) {
        settingsToApply.push({
          key: 'darkModePreference',
          value: settings.darkModePreference,
          label: '夜间模式偏好',
        });
      }

      if (settings.darkModeScheduleStart) {
        settingsToApply.push({
          key: 'darkModeScheduleStart',
          value: settings.darkModeScheduleStart,
          label: '夜间模式开始时间',
        });
      }

      if (settings.darkModeScheduleEnd) {
        settingsToApply.push({
          key: 'darkModeScheduleEnd',
          value: settings.darkModeScheduleEnd,
          label: '夜间模式结束时间',
        });
      }

      // 备份当前设置以便回滚
      const backupSettings: Array<{ key: string; value: string | null }> = [];
      settingsToApply.forEach((setting) => {
        backupSettings.push({
          key: setting.key,
          value: localStorage.getItem(setting.key),
        });
      });

      try {
        // 原子性应用所有设置
        settingsToApply.forEach((setting) => {
          localStorage.setItem(setting.key, setting.value);
          appliedSettings.push(setting.label);
        });

        return { success: true, appliedSettings };
      } catch (error) {
        console.error('应用设置失败，正在回滚:', error);

        // 回滚到之前的状态
        try {
          backupSettings.forEach((backup) => {
            if (backup.value !== null) {
              localStorage.setItem(backup.key, backup.value);
            } else {
              localStorage.removeItem(backup.key);
            }
          });
        } catch (rollbackError) {
          console.error('回滚失败:', rollbackError);
        }

        return { success: false, appliedSettings: [] };
      }
    },
    [validateSettings]
  );

  return {
    exportSettings,
    importSettings,
    validateSettings,
  };
}
