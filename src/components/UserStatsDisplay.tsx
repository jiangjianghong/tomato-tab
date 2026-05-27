import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useUserStats } from '@/hooks/useUserStats';
import AnnualReport from '@/components/AnnualReport';
import TomatoIcon from '@/components/TomatoIcon';

interface WebsiteData {
  id: string;
  name: string;
  url: string;
  favicon?: string;
  visitCount?: number;
}

interface UserStatsDisplayProps {
  websites?: WebsiteData[];
}

export default function UserStatsDisplay({ websites = [] }: UserStatsDisplayProps) {
  const { stats, getDaysUsed } = useUserStats();
  const [showReport, setShowReport] = useState(false);

  const daysUsed = getDaysUsed();

  // 直接使用卡片的 visitCount 计算 TOP 5，保证数据一致
  const topCardsWithNames = useMemo(() => {
    return websites
      .filter((w) => (w.visitCount || 0) > 0)
      .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))
      .slice(0, 5)
      .map((website) => ({
        cardId: website.id,
        clicks: website.visitCount || 0,
        name: website.name,
        favicon: website.favicon,
      }));
  }, [websites]);

  // 计算平均每日使用
  const avgDailyVisits = daysUsed > 0 ? Math.round(stats.totalSiteVisits / daysUsed * 10) / 10 : 0;
  const avgDailySearches = daysUsed > 0 ? Math.round(stats.totalSearches / daysUsed * 10) / 10 : 0;

  return (
    <div className="space-y-6 select-none">
      {/* 年度报告入口：温暖色调 + 番茄图标，引导用户进入故事化视图 */}
      <button
        onClick={() => setShowReport(true)}
        className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white rounded-xl p-4 flex items-center gap-3 shadow-md hover:shadow-lg active:scale-[0.98] transition-all"
      >
        <TomatoIcon size={32} variant="bounce" />
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold">我的便签页报告</div>
          <div className="text-xs text-white/85">{daysUsed} 天的数据，一段故事</div>
        </div>
        <i className="fa-solid fa-chevron-right text-white/80" />
      </button>

      {/* 使用概览 - 田字排列 */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          icon="fa-solid fa-calendar-days"
          iconColor="text-blue-500"
          bgColor="bg-blue-50 dark:bg-blue-900/30"
          label="使用天数"
          value={daysUsed}
          unit="天"
        />
        <StatCard
          icon="fa-solid fa-rocket"
          iconColor="text-purple-500"
          bgColor="bg-purple-50 dark:bg-purple-900/30"
          label="应用启动"
          value={stats.appOpened}
          unit="次"
        />
        <StatCard
          icon="fa-solid fa-mouse-pointer"
          iconColor="text-green-500"
          bgColor="bg-green-50 dark:bg-green-900/30"
          label="网站访问"
          value={stats.totalSiteVisits}
          unit="次"
        />
        <StatCard
          icon="fa-solid fa-search"
          iconColor="text-orange-500"
          bgColor="bg-orange-50 dark:bg-orange-900/30"
          label="搜索次数"
          value={stats.totalSearches}
          unit="次"
        />
      </div>

      {/* 今日统计 */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 rounded-xl p-4 select-none">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2 select-none">
          <i className="fa-solid fa-sun text-yellow-500"></i>
          今日统计
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 select-none">{stats.todaySiteVisits}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 select-none">网站访问</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 select-none">{stats.todaySearches}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 select-none">搜索次数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 select-none">{stats.settingsOpened}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 select-none">设置打开</div>
          </div>
        </div>
      </div>

      {/* 平均使用 */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 select-none">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2 select-none">
          <i className="fa-solid fa-chart-line text-green-500"></i>
          日均统计
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
              <i className="fa-solid fa-globe text-green-600 dark:text-green-400"></i>
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 select-none">{avgDailyVisits}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 select-none">日均访问网站</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/50 rounded-full flex items-center justify-center">
              <i className="fa-solid fa-magnifying-glass text-orange-600 dark:text-orange-400"></i>
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 select-none">{avgDailySearches}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 select-none">日均搜索次数</div>
            </div>
          </div>
        </div>
      </div>

      {/* 最常访问 TOP 5 */}
      {topCardsWithNames.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 rounded-xl p-4 select-none">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2 select-none">
            <i className="fa-solid fa-trophy text-amber-500"></i>
            最常访问 TOP 5
          </h4>
          <div className="space-y-2">
            {topCardsWithNames.map((item, index) => (
              <motion.div
                key={item.cardId}
                className="flex items-center gap-3 bg-white/60 dark:bg-gray-800/60 rounded-lg p-2 select-none"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold select-none ${index === 0
                      ? 'bg-yellow-400 text-yellow-900'
                      : index === 1
                        ? 'bg-gray-300 dark:bg-gray-500 text-gray-700 dark:text-gray-200'
                        : index === 2
                          ? 'bg-amber-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                >
                  {index + 1}
                </div>
                {item.favicon ? (
                  <img
                    src={item.favicon}
                    alt=""
                    className="w-5 h-5 rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-5 h-5 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center">
                    <i className="fa-solid fa-globe text-gray-400 text-xs"></i>
                  </div>
                )}
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate select-none">{item.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium select-none">{item.clicks} 次</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 首次使用日期 */}
      <div className="text-xs text-gray-500 px-1 select-none">
        <i className="fa-solid fa-clock-rotate-left mr-1"></i>
        首次使用: {stats.firstUseDate}
      </div>

      {/* 年度报告全屏覆盖层 */}
      <AnnualReport
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        websites={websites}
      />
    </div>
  );
}

// 统计卡片组件
interface StatCardProps {
  icon: string;
  iconColor: string;
  bgColor: string;
  label: string;
  value: number;
  unit: string;
}

function StatCard({ icon, iconColor, bgColor, label, value, unit }: StatCardProps) {
  return (
    <motion.div
      className={`${bgColor} rounded-xl p-4 text-center select-none`}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <i className={`${icon} ${iconColor} text-xl mb-2`}></i>
      <div className="text-2xl font-bold text-gray-800 dark:text-gray-100 select-none">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 select-none">
        {label} ({unit})
      </div>
    </motion.div>
  );
}
