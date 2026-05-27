import { useCallback, useEffect, useState, useRef } from 'react';
import { storageManager } from '@/lib/storageManager';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  saveUserStats,
  getUserStats,
  mergeUserStats,
  UserStatsData,
} from '@/lib/supabaseSync';

// 用户统计数据接口
export interface UserStats {
  // 网站访问统计
  totalSiteVisits: number; // 总打开网站次数
  todaySiteVisits: number; // 今日打开网站次数

  // 搜索统计
  totalSearches: number; // 总搜索次数
  todaySearches: number; // 今日搜索次数

  // 设置页面统计
  settingsOpened: number; // 设置页面打开次数

  // 应用使用统计
  appOpened: number; // 应用打开次数
  lastVisitDate: string; // 最后访问日期

  // 卡片点击详情 (cardId -> 点击次数)
  cardClicks: Record<string, number>;

  // 首次使用日期
  firstUseDate: string;

  // 24 小时活跃分布（索引 = 小时），仅本地累计
  hourlyDistribution: number[];

  // 连续使用天数（基于自然日跨天判断），仅本地累计
  streakDays: number;
}

const STATS_KEY = 'user-stats';
const SYNC_DEBOUNCE_MS = 5000; // 5秒防抖，避免频繁同步

// 获取今天的日期字符串
const getTodayString = () => new Date().toISOString().split('T')[0];

// 获取昨天的日期字符串（用于 streak 连续判定）
const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

// 默认统计数据
const getDefaultStats = (): UserStats => ({
  totalSiteVisits: 0,
  todaySiteVisits: 0,
  totalSearches: 0,
  todaySearches: 0,
  settingsOpened: 0,
  appOpened: 0,
  lastVisitDate: getTodayString(),
  cardClicks: {},
  firstUseDate: getTodayString(),
  hourlyDistribution: new Array(24).fill(0),
  streakDays: 1,
});

// 加载本地统计数据
const loadLocalStats = (): UserStats => {
  try {
    const saved = storageManager.getItem(STATS_KEY, false);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<UserStats>;
      // 旧数据兼容：补齐新增字段的默认值
      const hourlyDistribution =
        Array.isArray(parsed.hourlyDistribution) && parsed.hourlyDistribution.length === 24
          ? parsed.hourlyDistribution
          : new Array(24).fill(0);
      let streakDays = typeof parsed.streakDays === 'number' && parsed.streakDays > 0 ? parsed.streakDays : 1;

      const base: UserStats = {
        ...getDefaultStats(),
        ...parsed,
        hourlyDistribution,
        streakDays,
      };

      // 检查是否是新的一天，重置今日统计并更新 streak
      const today = getTodayString();
      if (base.lastVisitDate !== today) {
        if (base.lastVisitDate === getYesterdayString()) {
          streakDays = base.streakDays + 1;
        } else {
          // 跨天断了
          streakDays = 1;
        }
        return {
          ...base,
          todaySiteVisits: 0,
          todaySearches: 0,
          lastVisitDate: today,
          streakDays,
        };
      }
      return base;
    }
  } catch (error) {
    console.error('加载用户统计失败:', error);
  }
  return getDefaultStats();
};

// 保存本地统计数据
const saveLocalStats = (stats: UserStats): void => {
  try {
    storageManager.setItem(STATS_KEY, JSON.stringify(stats), false);
  } catch (error) {
    console.error('保存用户统计失败:', error);
  }
};

// 转换为云端格式
const toCloudFormat = (stats: UserStats, includeActiveAt = false): UserStatsData => ({
  totalSiteVisits: stats.totalSiteVisits,
  totalSearches: stats.totalSearches,
  settingsOpened: stats.settingsOpened,
  appOpened: stats.appOpened,
  cardClicks: stats.cardClicks,
  firstUseDate: stats.firstUseDate,
  lastVisitDate: stats.lastVisitDate,
  ...(includeActiveAt ? { lastActiveAt: new Date().toISOString() } : {}),
});

// 从云端格式转换
const fromCloudFormat = (cloud: UserStatsData, local: UserStats): UserStats => ({
  ...cloud,
  todaySiteVisits: local.todaySiteVisits, // 今日数据只保存在本地
  todaySearches: local.todaySearches,
  // 24h 分布与连续天数不上云，保留本地值（避免被云端覆盖丢失）
  hourlyDistribution: local.hourlyDistribution,
  streakDays: local.streakDays,
});

// 用户统计 Hook（支持云同步）
export const useUserStats = () => {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<UserStats>(loadLocalStats);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);

  // 云同步函数（带防抖）
  const syncToCloud = useCallback(
    async (statsToSync: UserStats) => {
      if (!currentUser || !currentUser.email_confirmed_at) return;

      // 清除之前的定时器
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // 设置新的防抖定时器
      syncTimeoutRef.current = setTimeout(async () => {
        try {
          setIsSyncing(true);
          await saveUserStats(currentUser, toCloudFormat(statsToSync));
          setLastSyncTime(new Date().toISOString());
        } catch (error) {
          console.error('统计数据云同步失败:', error);
        } finally {
          setIsSyncing(false);
        }
      }, SYNC_DEBOUNCE_MS);
    },
    [currentUser]
  );

  // 从云端加载并合并数据
  const loadFromCloud = useCallback(async () => {
    if (!currentUser || !currentUser.email_confirmed_at) return;

    try {
      setIsSyncing(true);
      const cloudStats = await getUserStats(currentUser);

      if (cloudStats) {
        const localStats = loadLocalStats();
        const merged = mergeUserStats(toCloudFormat(localStats), cloudStats);
        const newStats = fromCloudFormat(merged, localStats);

        saveLocalStats(newStats);
        setStats(newStats);
        setLastSyncTime(new Date().toISOString());

        // 如果有变化，同步回云端
        if (
          merged.totalSiteVisits !== cloudStats.totalSiteVisits ||
          merged.totalSearches !== cloudStats.totalSearches
        ) {
          await saveUserStats(currentUser, merged);
        }
      }
    } catch (error) {
      console.error('从云端加载统计数据失败:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [currentUser]);

  // 初始化时增加应用打开次数并尝试云同步
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const currentStats = loadLocalStats();
    const today = getTodayString();

    // 检查是否是今天第一次打开
    if (currentStats.lastVisitDate !== today) {
      currentStats.todaySiteVisits = 0;
      currentStats.todaySearches = 0;
      currentStats.lastVisitDate = today;
    }

    currentStats.appOpened += 1;
    saveLocalStats(currentStats);
    setStats(currentStats);

    // 如果已登录，尝试从云端同步
    if (currentUser?.email_confirmed_at) {
      loadFromCloud();
      // 后台静默更新精确活跃时间（不影响 UI 加载）
      updateLastActiveTime(currentUser, currentStats);
    }
  }, [currentUser, loadFromCloud]);

  // 后台静默更新活跃时间（使用 requestIdleCallback 确保不影响用户体验）
  const updateLastActiveTime = useCallback(
    (user: typeof currentUser, stats: UserStats) => {
      if (!user || !user.email_confirmed_at) return;

      const doUpdate = async () => {
        try {
          // 只更新活跃时间，不更改其他数据
          await saveUserStats(user, toCloudFormat(stats, true));
        } catch (error) {
          // 静默失败，不影响用户体验
          console.debug('后台更新活跃时间失败:', error);
        }
      };

      // 使用 requestIdleCallback 在浏览器空闲时执行
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => doUpdate(), { timeout: 5000 });
      } else {
        // 回退：使用 setTimeout 延迟执行
        setTimeout(doUpdate, 1000);
      }
    },
    []
  );

  // 记录网站点击（只记录总数，卡片级别的访问次数由 visitCount 管理）
  const recordSiteVisit = useCallback(
    () => {
      setStats((prev) => {
        const hour = new Date().getHours();
        const hourlyDistribution = [...(prev.hourlyDistribution || new Array(24).fill(0))];
        hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
        const newStats = {
          ...prev,
          totalSiteVisits: prev.totalSiteVisits + 1,
          todaySiteVisits: prev.todaySiteVisits + 1,
          hourlyDistribution,
        };
        saveLocalStats(newStats);
        syncToCloud(newStats);
        return newStats;
      });
    },
    [syncToCloud]
  );

  // 记录搜索
  const recordSearch = useCallback(() => {
    setStats((prev) => {
      const hour = new Date().getHours();
      const hourlyDistribution = [...(prev.hourlyDistribution || new Array(24).fill(0))];
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
      const newStats = {
        ...prev,
        totalSearches: prev.totalSearches + 1,
        todaySearches: prev.todaySearches + 1,
        hourlyDistribution,
      };
      saveLocalStats(newStats);
      syncToCloud(newStats);
      return newStats;
    });
  }, [syncToCloud]);

  // 记录设置页面打开
  const recordSettingsOpen = useCallback(() => {
    setStats((prev) => {
      const newStats = {
        ...prev,
        settingsOpened: prev.settingsOpened + 1,
      };
      saveLocalStats(newStats);
      syncToCloud(newStats);
      return newStats;
    });
  }, [syncToCloud]);

  // 获取最常访问的卡片 (返回 cardId 数组，按点击次数排序)
  const getTopCards = useCallback(
    (limit: number = 10): Array<{ cardId: string; clicks: number }> => {
      return Object.entries(stats.cardClicks)
        .map(([cardId, clicks]) => ({ cardId, clicks }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, limit);
    },
    [stats.cardClicks]
  );

  // 获取使用天数
  const getDaysUsed = useCallback((): number => {
    const firstDate = new Date(stats.firstUseDate);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - firstDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  }, [stats.firstUseDate]);

  // 重置统计数据
  const resetStats = useCallback(async () => {
    const newStats = getDefaultStats();
    saveLocalStats(newStats);
    setStats(newStats);

    // 同步到云端
    if (currentUser?.email_confirmed_at) {
      try {
        await saveUserStats(currentUser, toCloudFormat(newStats));
      } catch (error) {
        console.error('重置云端统计数据失败:', error);
      }
    }
  }, [currentUser]);

  // 刷新统计数据（从本地和云端）
  const refreshStats = useCallback(() => {
    setStats(loadLocalStats());
    if (currentUser?.email_confirmed_at) {
      loadFromCloud();
    }
  }, [currentUser, loadFromCloud]);

  // 手动同步到云端
  const manualSync = useCallback(async () => {
    if (!currentUser || !currentUser.email_confirmed_at) return false;

    try {
      setIsSyncing(true);
      await saveUserStats(currentUser, toCloudFormat(stats));
      setLastSyncTime(new Date().toISOString());
      return true;
    } catch (error) {
      console.error('手动同步失败:', error);
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [currentUser, stats]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return {
    stats,
    recordSiteVisit,
    recordSearch,
    recordSettingsOpen,
    getTopCards,
    getDaysUsed,
    resetStats,
    refreshStats,
    manualSync,
    isSyncing,
    lastSyncTime,
    isLoggedIn: !!currentUser?.email_confirmed_at,
  };
};

// 创建一个全局实例用于非组件场景（不支持云同步，仅本地）
class UserStatsManager {
  private stats: UserStats;

  constructor() {
    this.stats = loadLocalStats();
  }

  private refreshStats() {
    this.stats = loadLocalStats();
  }

  recordSiteVisit(cardId?: string) {
    this.refreshStats();
    const hour = new Date().getHours();
    if (!Array.isArray(this.stats.hourlyDistribution) || this.stats.hourlyDistribution.length !== 24) {
      this.stats.hourlyDistribution = new Array(24).fill(0);
    }
    this.stats.hourlyDistribution[hour] = (this.stats.hourlyDistribution[hour] || 0) + 1;
    this.stats.totalSiteVisits += 1;
    this.stats.todaySiteVisits += 1;
    if (cardId) {
      this.stats.cardClicks[cardId] = (this.stats.cardClicks[cardId] || 0) + 1;
    }
    saveLocalStats(this.stats);
  }

  recordSearch() {
    this.refreshStats();
    const hour = new Date().getHours();
    if (!Array.isArray(this.stats.hourlyDistribution) || this.stats.hourlyDistribution.length !== 24) {
      this.stats.hourlyDistribution = new Array(24).fill(0);
    }
    this.stats.hourlyDistribution[hour] = (this.stats.hourlyDistribution[hour] || 0) + 1;
    this.stats.totalSearches += 1;
    this.stats.todaySearches += 1;
    saveLocalStats(this.stats);
  }

  recordSettingsOpen() {
    this.refreshStats();
    this.stats.settingsOpened += 1;
    saveLocalStats(this.stats);
  }

  getStats(): UserStats {
    this.refreshStats();
    return { ...this.stats };
  }
}

export const userStatsManager = new UserStatsManager();
