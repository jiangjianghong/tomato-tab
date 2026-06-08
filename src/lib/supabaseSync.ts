// Supabase 数据同步工具
import { supabase, TABLES } from '@/lib/supabase';
export { supabase };
import { User } from '@supabase/supabase-js';
import { WallpaperResolution } from '@/types/settings';
import { logger } from './logger';
import {
  sanitizeWebsiteArray,
  sanitizeUserSettings,
  isDataSafeToSync,
  checkDataIntegrity,
  sanitizeCardClicks,
  sanitizeHourlyDistribution,
} from './dataValidator';

// 用户设置接口
export interface UserSettings {
  cardOpacity: number;
  searchBarOpacity: number;
  parallaxEnabled: boolean;
  wallpaperResolution: WallpaperResolution;
  theme: string;
  cardColor: string; // 卡片颜色 (RGB字符串)
  searchBarColor: string; // 搜索框颜色 (RGB字符串)
  autoSyncEnabled: boolean; // 自动同步开关
  autoSyncInterval: number; // 自动同步间隔（秒）
  searchInNewTab?: boolean; // 搜索打开方式（可选，向后兼容）
  autoSortEnabled?: boolean; // 自动排序开关（可选，向后兼容）
  timeComponentEnabled?: boolean; // 时间组件显示开关
  showFullDate?: boolean; // 是否显示完整日期
  showSeconds?: boolean; // 是否精确到秒
  showWeekday?: boolean; // 是否显示星期
  showYear?: boolean; // 是否显示年份
  showMonth?: boolean; // 是否显示月份
  showDay?: boolean; // 是否显示日期
  searchBarBorderRadius?: number; // 搜索框圆角大小（可选，向后兼容）
  dateDisplayMode?: 'yearMonth' | 'yearMonthDay';
  animationStyle?: 'dynamic' | 'simple';
  workCountdownEnabled?: boolean;
  lunchTime?: string; // HH:mm
  offWorkTime?: string; // HH:mm
  aiIconDisplayMode?: 'circular' | 'dropdown';
  aiIconOrder?: string[];
  atmosphereMode?: 'auto' | 'snow' | 'leaf' | 'cherry' | 'firefly' | 'off';
  atmosphereParticleCount?: number;
  atmosphereWindEnabled?: boolean;
  darkOverlayEnabled?: boolean;
  darkOverlayMode?: 'off' | 'always' | 'smart';
  darkModePreference?: 'system' | 'on' | 'off' | 'scheduled';
  darkModeScheduleStart?: string; // HH:mm
  darkModeScheduleEnd?: string; // HH:mm
  lastSync: string;
}

// 网站数据接口
export interface WebsiteData {
  id: string;
  name: string;
  url: string;
  favicon: string;
  tags: string[];
  visitCount: number;
  lastVisit: string;
  note?: string;
  // 新增字段用于高级同步
  updatedAt?: number; // 最后修改时间戳 (毫秒)
  deleted?: boolean;  // 软删除标记
}

// 同步状态回调接口
export interface SyncStatusCallback {
  onSyncStart?: () => void;
  onSyncSuccess?: (message: string) => void;
  onSyncError?: (error: string) => void;
}

// 用户资料接口
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// 网络重试工具函数
const retryAsync = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i === maxRetries) {
        throw lastError;
      }

      // 指数退避延迟
      const waitTime = delay * Math.pow(2, i);
      logger.sync.info(`同步失败，${waitTime} ms后重试(${i + 1}/${maxRetries + 1})`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError!;
};

// 保存用户设置到 Supabase - 带重试机制
export const saveUserSettings = async (
  user: User,
  settings: UserSettings,
  callbacks?: SyncStatusCallback
) => {
  try {
    callbacks?.onSyncStart?.();

    // 使用统一的数据验证和清理工具
    const validatedSettings = sanitizeUserSettings(settings);

    await retryAsync(async () => {
      // 尝试同步所有字段，如果新字段不可用则回退到基本字段
      const fullData = {
        id: user.id,
        card_opacity: validatedSettings.cardOpacity,
        search_bar_opacity: validatedSettings.searchBarOpacity,
        parallax_enabled: validatedSettings.parallaxEnabled,
        wallpaper_resolution: validatedSettings.wallpaperResolution,
        theme: validatedSettings.theme,
        card_color: validatedSettings.cardColor,
        search_bar_color: validatedSettings.searchBarColor,
        auto_sync_enabled: validatedSettings.autoSyncEnabled,
        auto_sync_interval: validatedSettings.autoSyncInterval,
        search_in_new_tab: validatedSettings.searchInNewTab ?? true,
        auto_sort_enabled: validatedSettings.autoSortEnabled ?? false,
        time_component_enabled: validatedSettings.timeComponentEnabled ?? true,
        show_full_date: validatedSettings.showFullDate ?? true,
        show_seconds: validatedSettings.showSeconds ?? true,
        show_weekday: validatedSettings.showWeekday ?? true,
        show_year: validatedSettings.showYear ?? true,
        show_month: validatedSettings.showMonth ?? true,
        show_day: validatedSettings.showDay ?? true,
        search_bar_border_radius: validatedSettings.searchBarBorderRadius ?? 12,
        date_display_mode: validatedSettings.dateDisplayMode ?? 'yearMonthDay',
        animation_style: validatedSettings.animationStyle ?? 'simple',
        work_countdown_enabled: validatedSettings.workCountdownEnabled ?? false,
        lunch_time: validatedSettings.lunchTime ?? '12:00',
        off_work_time: validatedSettings.offWorkTime ?? '18:00',
        ai_icon_display_mode: validatedSettings.aiIconDisplayMode ?? 'circular',
        atmosphere_mode: validatedSettings.atmosphereMode ?? 'auto',
        atmosphere_particle_count: validatedSettings.atmosphereParticleCount ?? 60,
        atmosphere_wind_enabled: validatedSettings.atmosphereWindEnabled ?? true,
        dark_overlay_enabled: validatedSettings.darkOverlayEnabled ?? false,
        dark_overlay_mode: validatedSettings.darkOverlayMode ?? 'smart',
        dark_mode_preference: validatedSettings.darkModePreference ?? 'system',
        dark_mode_schedule_start: validatedSettings.darkModeScheduleStart ?? '22:00',
        dark_mode_schedule_end: validatedSettings.darkModeScheduleEnd ?? '06:00',
        last_sync: new Date().toISOString(),
      };

      const { error } = await supabase.from(TABLES.USER_SETTINGS).upsert(fullData);

      if (error) {
        // 如果新字段导致错误，回退到基本字段
        if (
          error.code === '42703' ||
          error.message?.includes('column') ||
          error.message?.includes('does not exist')
        ) {
          logger.sync.warn('新字段暂不可用，使用基本字段同步', { error: error.message });

          const basicData = {
            id: user.id,
            card_opacity: settings.cardOpacity,
            search_bar_opacity: settings.searchBarOpacity,
            parallax_enabled: settings.parallaxEnabled,
            wallpaper_resolution: settings.wallpaperResolution,
            theme: settings.theme,
            last_sync: new Date().toISOString(),
          };

          const { error: basicError } = await supabase.from(TABLES.USER_SETTINGS).upsert(basicData);

          if (basicError) throw basicError;

          logger.sync.info('基本字段同步成功，新字段将在数据库迁移后可用');
        } else {
          throw error;
        }
      } else {
        logger.sync.info('所有字段同步成功，包括新添加的字段');
      }
    });

    logger.sync.info('用户设置已同步到云端');
    callbacks?.onSyncSuccess?.('设置已同步到云端');
    return true;
  } catch (error) {
    logger.sync.error('保存用户设置失败', error);
    callbacks?.onSyncError?.('设置同步失败: ' + (error as Error).message);
    return false;
  }
};

// 从 Supabase 获取用户设置
export const getUserSettings = async (user: User): Promise<UserSettings | null> => {
  try {
    // 添加超时机制，避免长时间等待
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('连接超时')), 5000)
    );

    const dataPromise = supabase.from(TABLES.USER_SETTINGS).select('*').eq('id', user.id).single();

    const { data, error } = await Promise.race([dataPromise, timeoutPromise]);

    if (error && error.code !== 'PGRST116') {
      // PGRST116 表示没有找到记录
      throw error;
    }

    if (data) {
      logger.sync.info('从云端获取用户设置成功');
      return {
        cardOpacity: data.card_opacity,
        searchBarOpacity: data.search_bar_opacity,
        parallaxEnabled: data.parallax_enabled,
        wallpaperResolution: data.wallpaper_resolution,
        theme: data.theme,
        // 新字段处理，如果数据库中存在则使用，否则使用默认值
        cardColor: data.card_color || '255, 255, 255',
        searchBarColor: data.search_bar_color || '255, 255, 255',
        autoSyncEnabled: data.auto_sync_enabled !== undefined ? data.auto_sync_enabled : true,
        autoSyncInterval:
          data.auto_sync_interval && data.auto_sync_interval >= 3 && data.auto_sync_interval <= 300
            ? data.auto_sync_interval
            : 30,
        // 新增的设置项
        searchInNewTab: data.search_in_new_tab !== undefined ? data.search_in_new_tab : true,
        autoSortEnabled: data.auto_sort_enabled !== undefined ? data.auto_sort_enabled : false,
        timeComponentEnabled: data.time_component_enabled !== undefined ? data.time_component_enabled : true,
        showFullDate: data.show_full_date !== undefined ? data.show_full_date : true,
        showSeconds: data.show_seconds !== undefined ? data.show_seconds : true,
        showWeekday: data.show_weekday !== undefined ? data.show_weekday : true,
        showYear: data.show_year !== undefined ? data.show_year : true,
        showMonth: data.show_month !== undefined ? data.show_month : true,
        showDay: data.show_day !== undefined ? data.show_day : true,
        searchBarBorderRadius: data.search_bar_border_radius !== undefined ? data.search_bar_border_radius : 12,
        dateDisplayMode: data.date_display_mode ?? 'yearMonthDay',
        animationStyle: data.animation_style ?? 'simple',
        workCountdownEnabled:
          data.work_countdown_enabled !== undefined ? data.work_countdown_enabled : false,
        lunchTime: data.lunch_time ?? '12:00',
        offWorkTime: data.off_work_time ?? '18:00',
        aiIconDisplayMode: data.ai_icon_display_mode ?? 'circular',
        atmosphereMode: data.atmosphere_mode ?? 'auto',
        atmosphereParticleCount:
          typeof data.atmosphere_particle_count === 'number' ? data.atmosphere_particle_count : 60,
        atmosphereWindEnabled:
          data.atmosphere_wind_enabled !== undefined ? data.atmosphere_wind_enabled : true,
        darkOverlayEnabled:
          data.dark_overlay_enabled !== undefined ? data.dark_overlay_enabled : false,
        darkOverlayMode: data.dark_overlay_mode ?? 'smart',
        darkModePreference: data.dark_mode_preference ?? 'system',
        darkModeScheduleStart: data.dark_mode_schedule_start ?? '22:00',
        darkModeScheduleEnd: data.dark_mode_schedule_end ?? '06:00',
        lastSync: data.last_sync,
      };
    } else {
      logger.sync.debug('用户设置不存在，将使用默认设置');
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    logger.sync.error('获取用户设置失败', error);

    // 提供更详细的错误信息，但仍然返回 null 保持兼容性
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      logger.sync.warn('网络连接问题，将使用本地设置');
    } else if (errorMessage.includes('auth') || errorMessage.includes('JWT')) {
      logger.sync.warn('认证问题，可能需要重新登录');
    }

    // 离线模式下直接返回 null，不阻塞界面
    return null;
  }
};

// 保存用户网站数据到 Supabase - 增强数据验证
export const saveUserWebsites = async (
  user: User,
  websites: WebsiteData[],
  callbacks?: SyncStatusCallback
) => {
  try {
    callbacks?.onSyncStart?.();

    // 使用统一的数据验证和清理工具
    const sanitizedWebsites = sanitizeWebsiteArray(websites);

    // 检查数据完整性
    const integrityCheck = checkDataIntegrity(sanitizedWebsites);

    if (!integrityCheck.isValid || !isDataSafeToSync(sanitizedWebsites)) {
      logger.sync.warn('数据完整性检查失败，跳过同步以保护云端数据', {
        issues: integrityCheck.issues,
        validCount: integrityCheck.validCount,
        totalCount: integrityCheck.totalCount,
      });
      callbacks?.onSyncError?.(`数据验证失败：${integrityCheck.issues.join(', ')} `);
      return false;
    }

    // 如果有效数据少于原数据的50%，记录警告但继续同步
    if (websites.length > 0 && sanitizedWebsites.length < websites.length * 0.5) {
      logger.sync.warn('检测到大量无效数据，已过滤后同步', {
        original: websites.length,
        sanitized: sanitizedWebsites.length,
      });
    }

    await retryAsync(async () => {
      const { error } = await supabase.from(TABLES.USER_WEBSITES).upsert({
        id: user.id,
        websites: sanitizedWebsites,
        last_sync: new Date().toISOString(),
      });

      if (error) throw error;
    });

    logger.sync.info('网站数据已同步到云端', {
      original: websites.length,
      sanitized: sanitizedWebsites.length,
    });
    callbacks?.onSyncSuccess?.(`网站数据已同步到云端(${sanitizedWebsites.length}个有效网站)`);
    return true;
  } catch (error) {
    logger.sync.error('保存网站数据失败', error);
    callbacks?.onSyncError?.('网站数据同步失败: ' + (error as Error).message);
    return false;
  }
};

// 从 Supabase 获取用户网站数据
export const getUserWebsites = async (user: User): Promise<WebsiteData[] | null> => {
  try {
    // 添加超时机制，避免长时间等待
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('连接超时')), 5000)
    );

    const dataPromise = supabase.from(TABLES.USER_WEBSITES).select('*').eq('id', user.id).single();

    const { data, error } = await Promise.race([dataPromise, timeoutPromise]);

    if (error) {
      if (error.code === 'PGRST116') {
        // PGRST116 表示没有找到记录
        logger.sync.debug('用户网站数据不存在');
        return null;
      } else {
        logger.sync.error('获取网站数据时发生错误:', error);
        throw error;
      }
    }

    if (data && data.websites) {
      // 验证数据格式，确保类型安全
      if (Array.isArray(data.websites)) {
        logger.sync.info('从云端获取网站数据成功', { count: data.websites.length });
        return data.websites as WebsiteData[];
      } else {
        logger.sync.warn('云端网站数据格式异常，不是数组格式');
        return null;
      }
    } else {
      logger.sync.debug('用户网站数据不存在');
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    logger.sync.error('获取网站数据失败', error);

    // 提供更详细的错误信息，但仍然返回 null 保持兼容性
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      logger.sync.warn('网络连接问题，将使用本地数据');
    } else if (errorMessage.includes('auth') || errorMessage.includes('JWT')) {
      logger.sync.warn('认证问题，可能需要重新登录');
    }

    // 离线模式下直接返回 null，不阻塞界面
    return null;
  }
};

// 合并本地和云端数据 - 改进版本，基于时间戳的冲突解决
export const mergeWebsiteData = (
  localData: WebsiteData[],
  cloudData: WebsiteData[]
): WebsiteData[] => {
  const merged: { [key: string]: WebsiteData } = {};

  // 1. 先处理本地数据
  localData.forEach((item) => {
    merged[item.id] = { ...item };
  });

  // 2. 合并云端数据
  cloudData.forEach((cloudItem) => {
    const localItem = merged[cloudItem.id];

    if (!localItem) {
      // 2.1 本地不存在，直接添加云端数据
      merged[cloudItem.id] = { ...cloudItem };
    } else {
      // 2.2 本地存在，处理冲突

      // 确保都有 updatedAt (兼容旧数据)
      const localTime = typeof localItem.updatedAt === 'number'
        ? localItem.updatedAt
        : new Date(localItem.lastVisit || '2000-01-01').getTime();

      const cloudTime = typeof cloudItem.updatedAt === 'number'
        ? cloudItem.updatedAt
        : new Date(cloudItem.lastVisit || '2000-01-01').getTime();

      let finalData: WebsiteData;

      // 核心原则：最后写入者胜 (Last Write Wins)
      if (cloudTime > localTime) {
        // 云端数据更新 -> 使用云端数据
        finalData = { ...cloudItem };
      } else if (localTime > cloudTime) {
        // 本地数据更新 -> 使用本地数据
        finalData = { ...localItem };
      } else {
        // 时间戳相同（极少见），使用访问次数多的那个作为兜底
        // 这里需要特别注意 deleted 状态，如果时间相同，优先选择非删除状态
        if (localItem.deleted !== cloudItem.deleted) {
          finalData = localItem.deleted ? { ...cloudItem } : { ...localItem }; // 存疑保活? 不，时间相同无法判断。
          // 策略修正：时间戳完全相同，优先保留"未删除"的状态，或者 ID 字母序?
          // 简单起见，既然时间戳相同，认为数据一致，取访问次数多的
          finalData = cloudItem.visitCount > localItem.visitCount ? { ...cloudItem } : { ...localItem };
        } else {
          finalData = cloudItem.visitCount > localItem.visitCount ? { ...cloudItem } : { ...localItem };
        }
      }

      // 所有的"累积型"数据（如访问次数）需要特殊处理?
      // 不，我们现在完全信任 updatedAt。
      // 但是为了防止数据丢失，我们可以取两者的最大访问次数?
      // 是的，访问次数是累加的，不应该因为回滚而减少。
      if (!finalData.deleted) {
        finalData.visitCount = Math.max(localItem.visitCount || 0, cloudItem.visitCount || 0);
      }

      merged[cloudItem.id] = finalData;
    }
  });

  return Object.values(merged);
};

// 同步管理器类 - 避免全局变量冲突
class SyncManager {
  private syncTimeout: NodeJS.Timeout | null = null;
  private retryCount: number = 0;
  private readonly maxRetries: number = 3;

  async performSync(
    user: User,
    websites: WebsiteData[],
    settings: UserSettings,
    callbacks?: SyncStatusCallback,
    delay: number = 0 // 移除硬编码延迟，由调用方决定
  ): Promise<void> {
    // 清除之前的延迟
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    // 如果没有延迟，立即执行
    if (delay === 0) {
      return this.executSync(user, websites, settings, callbacks);
    }

    // 设置延迟执行
    return new Promise((resolve, reject) => {
      this.syncTimeout = setTimeout(async () => {
        try {
          await this.executSync(user, websites, settings, callbacks);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }

  private async executSync(
    user: User,
    websites: WebsiteData[],
    settings: UserSettings,
    callbacks?: SyncStatusCallback
  ): Promise<void> {
    callbacks?.onSyncStart?.();

    try {
      const results = await Promise.allSettled([
        saveUserWebsites(user, websites),
        saveUserSettings(user, settings),
      ]);

      const failed = results.filter((result) => result.status === 'rejected');

      if (failed.length === 0) {
        this.retryCount = 0; // 重置重试计数器
        callbacks?.onSyncSuccess?.('数据已静默同步到云端');
      } else {
        await this.handleSyncFailure(user, websites, settings, callbacks, failed.length);
      }
    } catch (error) {
      await this.handleSyncError(user, websites, settings, callbacks, error as Error);
    }
  }

  private async handleSyncFailure(
    user: User,
    websites: WebsiteData[],
    settings: UserSettings,
    callbacks: SyncStatusCallback | undefined,
    failedCount: number
  ): Promise<void> {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      logger.sync.warn(`同步部分失败，${this.retryCount}/${this.maxRetries} 次重试中`);

      // 指数退避重试
      const retryDelay = 1000 * Math.pow(2, this.retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));

      return this.executSync(user, websites, settings, callbacks);
    } else {
      this.retryCount = 0;
      callbacks?.onSyncError?.(`${failedCount} 个数据同步失败，已重试 ${this.maxRetries} 次`);
    }
  }

  private async handleSyncError(
    user: User,
    websites: WebsiteData[],
    settings: UserSettings,
    callbacks: SyncStatusCallback | undefined,
    error: Error
  ): Promise<void> {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      logger.sync.warn(`同步异常，${this.retryCount}/${this.maxRetries} 次重试中`);

      // 指数退避重试
      const retryDelay = 1000 * Math.pow(2, this.retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));

      return this.executSync(user, websites, settings, callbacks);
    } else {
      this.retryCount = 0;
      callbacks?.onSyncError?.('同步过程中发生错误: ' + error.message);
    }
  }

  // 清理资源
  cleanup(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    this.retryCount = 0;
  }
}

// 创建同步管理器实例的工厂函数
export const createSyncManager = (): SyncManager => new SyncManager();

// 保持向后兼容的autoSync函数
export const autoSync = (
  user: User,
  websites: WebsiteData[],
  settings: UserSettings,
  callbacks?: SyncStatusCallback
): Promise<void> => {
  const syncManager = createSyncManager();
  return syncManager.performSync(user, websites, settings, callbacks, 0); // 立即执行，不延迟
};

// 保存用户资料到 Supabase
export const saveUserProfile = async (
  user: User,
  displayName: string,
  callbacks?: SyncStatusCallback
) => {
  return updateUserProfile(user, { displayName }, callbacks);
};

// 更新用户资料 (支持部分更新)
export const updateUserProfile = async (
  user: User,
  updates: { displayName?: string; avatarUrl?: string },
  callbacks?: SyncStatusCallback
) => {
  try {
    callbacks?.onSyncStart?.();

    const updateData: any = {
      id: user.id,
      email: user.email || '',
      updated_at: new Date().toISOString(),
    };

    if (updates.displayName !== undefined) {
      updateData.display_name = updates.displayName;
    }

    if (updates.avatarUrl !== undefined) {
      updateData.avatar_url = updates.avatarUrl;
    }

    const { error } = await supabase.from(TABLES.USER_PROFILES).upsert(updateData);

    if (error) throw error;

    logger.sync.info('用户资料已同步到云端');
    callbacks?.onSyncSuccess?.('用户资料已保存');
    return true;
  } catch (error) {
    logger.sync.error('保存用户资料失败', error);
    callbacks?.onSyncError?.('用户资料保存失败: ' + (error as Error).message);
    return false;
  }
};

// 获取用户资料
export const getUserProfile = async (user: User): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from(TABLES.USER_PROFILES)
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // PGRST116 表示没有找到记录 - 这是唯一返回 null 的情况
        logger.sync.debug('用户资料不存在');
        return null;
      }
      // 其他错误直接抛出，由调用者处理（避免被误判为不存在而覆盖）
      throw error;
    }

    if (data) {
      logger.sync.info('从云端获取用户资料成功');
      return {
        id: data.id,
        email: data.email,
        displayName: data.display_name,
        avatarUrl: data.avatar_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    return null;
  } catch (error) {
    logger.sync.error('获取用户资料失败', error);
    // 抛出错误，防止上层误判
    throw error;
  }
};

// 用户统计数据接口
export interface UserStatsData {
  totalSiteVisits: number;
  totalSearches: number;
  settingsOpened: number;
  appOpened: number;
  cardClicks: Record<string, number>;
  firstUseDate: string;
  lastVisitDate: string;
  lastActiveAt?: string; // 精确活跃时间戳 (ISO 格式)
  hourlyDistribution?: number[]; // 24 小时活跃分布（新增）
  streakDays?: number; // 连续使用天数（新增）
}

// 保存用户统计数据到 Supabase
export const saveUserStats = async (
  user: User,
  stats: UserStatsData,
  callbacks?: SyncStatusCallback
): Promise<boolean> => {
  try {
    callbacks?.onSyncStart?.();

    const { error } = await retryAsync(
      async () =>
        supabase.from(TABLES.USER_STATS).upsert(
          {
            id: user.id,
            total_site_visits: stats.totalSiteVisits,
            total_searches: stats.totalSearches,
            settings_opened: stats.settingsOpened,
            app_opened: stats.appOpened,
            card_clicks: stats.cardClicks,
            first_use_date: stats.firstUseDate,
            last_visit_date: stats.lastVisitDate,
            last_active_at: stats.lastActiveAt || new Date().toISOString(),
            hourly_distribution: stats.hourlyDistribution || new Array(24).fill(0),
            streak_days: stats.streakDays ?? 0,
            last_sync: new Date().toISOString(),
          },
          { onConflict: 'id' }
        ),
      3,
      1000
    );

    if (error) {
      // 如果新字段导致错误，回退到基本字段
      // 注：PostgREST upsert 遇未知列返回 PGRST204；Postgres 直接报 42703
      if (
        error.code === '42703' ||
        error.code === 'PGRST204' ||
        error.message?.includes('column') ||
        error.message?.includes('does not exist')
      ) {
        logger.sync.warn('user_stats 新字段暂不可用，使用基本字段同步');

        const basicData = {
          id: user.id,
          total_site_visits: stats.totalSiteVisits,
          total_searches: stats.totalSearches,
          settings_opened: stats.settingsOpened,
          app_opened: stats.appOpened,
          card_clicks: stats.cardClicks,
          first_use_date: stats.firstUseDate,
          last_visit_date: stats.lastVisitDate,
          last_active_at: stats.lastActiveAt || new Date().toISOString(),
          last_sync: new Date().toISOString(),
        };

        const { error: basicError } = await supabase
          .from(TABLES.USER_STATS)
          .upsert(basicData, { onConflict: 'id' });

        if (basicError) throw basicError;
      } else {
        throw error;
      }
    }

    logger.sync.info('用户统计数据同步成功');
    callbacks?.onSyncSuccess?.('统计数据已同步');
    return true;
  } catch (error) {
    logger.sync.error('保存用户统计数据失败', error);
    callbacks?.onSyncError?.('统计数据同步失败: ' + (error as Error).message);
    return false;
  }
};

// 从 Supabase 获取用户统计数据
export const getUserStats = async (user: User): Promise<UserStatsData | null> => {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('连接超时')), 5000)
    );

    const dataPromise = supabase.from(TABLES.USER_STATS).select('*').eq('id', user.id).single();

    const { data, error } = await Promise.race([dataPromise, timeoutPromise]);

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data) {
      logger.sync.info('从云端获取用户统计数据成功');
      return {
        totalSiteVisits: data.total_site_visits || 0,
        totalSearches: data.total_searches || 0,
        settingsOpened: data.settings_opened || 0,
        appOpened: data.app_opened || 0,
        cardClicks: sanitizeCardClicks(data.card_clicks),
        firstUseDate: data.first_use_date || new Date().toISOString().split('T')[0],
        lastVisitDate: data.last_visit_date || new Date().toISOString().split('T')[0],
        lastActiveAt: data.last_active_at || undefined,
        hourlyDistribution: sanitizeHourlyDistribution(data.hourly_distribution),
        streakDays: typeof data.streak_days === 'number' && data.streak_days > 0 ? data.streak_days : 0,
      };
    } else {
      logger.sync.debug('用户统计数据不存在');
      return null;
    }
  } catch (error) {
    logger.sync.error('获取用户统计数据失败', error);
    return null;
  }
};

// 合并本地和云端统计数据（取较大值）
export const mergeUserStats = (local: UserStatsData, cloud: UserStatsData): UserStatsData => {
  // 合并卡片点击数据
  const mergedCardClicks: Record<string, number> = { ...local.cardClicks };
  for (const [cardId, clicks] of Object.entries(cloud.cardClicks)) {
    mergedCardClicks[cardId] = Math.max(mergedCardClicks[cardId] || 0, clicks);
  }

  return {
    totalSiteVisits: Math.max(local.totalSiteVisits, cloud.totalSiteVisits),
    totalSearches: Math.max(local.totalSearches, cloud.totalSearches),
    settingsOpened: Math.max(local.settingsOpened, cloud.settingsOpened),
    appOpened: Math.max(local.appOpened, cloud.appOpened),
    cardClicks: sanitizeCardClicks(mergedCardClicks),
    // 使用较早的首次使用日期
    firstUseDate: local.firstUseDate < cloud.firstUseDate ? local.firstUseDate : cloud.firstUseDate,
    // 使用较晚的最后访问日期
    lastVisitDate: local.lastVisitDate > cloud.lastVisitDate ? local.lastVisitDate : cloud.lastVisitDate,
    // 24 小时分布逐元素取最大值，多设备同步不丢数据
    hourlyDistribution: Array.from({ length: 24 }, (_, i) =>
      Math.max(local.hourlyDistribution?.[i] || 0, cloud.hourlyDistribution?.[i] || 0)
    ),
    streakDays: Math.max(local.streakDays || 0, cloud.streakDays || 0),
  };
};

// 更新用户活跃时间（轻量级，仅更新 last_active_at 字段）
// 用于应用启动时静默更新，让后台能正确显示在线状态
export const updateUserActiveTime = async (user: User): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from(TABLES.USER_STATS)
      .upsert(
        {
          id: user.id,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) {
      logger.sync.debug('更新活跃时间失败:', error);
      return false;
    }

    logger.sync.debug('用户活跃时间已更新');
    return true;
  } catch (error) {
    logger.sync.debug('更新活跃时间异常:', error);
    return false;
  }
};
