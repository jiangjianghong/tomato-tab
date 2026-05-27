import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStats } from '@/hooks/useUserStats';
import TomatoIcon from '@/components/TomatoIcon';

interface WebsiteLite {
  id: string;
  name: string;
  favicon?: string;
  visitCount?: number;
}

interface AnnualReportProps {
  isOpen: boolean;
  onClose: () => void;
  websites: WebsiteLite[];
}

export default function AnnualReport({ isOpen, onClose, websites }: AnnualReportProps) {
  const { stats, getDaysUsed } = useUserStats();
  const daysUsed = getDaysUsed();

  const topCard = useMemo<WebsiteLite | undefined>(() => {
    return [...websites]
      .filter((w) => (w.visitCount || 0) > 0)
      .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0))[0];
  }, [websites]);

  const peakHour = useMemo(() => {
    const dist = stats.hourlyDistribution || new Array(24).fill(0);
    let idx = 0;
    let max = 0;
    dist.forEach((v, i) => {
      if (v > max) {
        max = v;
        idx = i;
      }
    });
    return { hour: idx, count: max };
  }, [stats.hourlyDistribution]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10000] overflow-y-auto snap-y snap-mandatory bg-gradient-to-br from-rose-50 via-amber-50 to-red-50 dark:from-slate-900 dark:via-rose-950/40 dark:to-slate-900"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* 关闭按钮（始终可见） */}
          <button
            onClick={onClose}
            className="fixed top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/70 dark:bg-slate-800/70 backdrop-blur-md flex items-center justify-center text-gray-600 dark:text-gray-200 hover:scale-110 transition-transform shadow-sm"
            aria-label="关闭报告"
          >
            <i className="fa-solid fa-times" />
          </button>

          {/* 屏 1：欢迎 */}
          <ReportScreen>
            <div className="text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7 }}
                className="inline-block"
              >
                <TomatoIcon size={88} variant="bounce" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="text-3xl md:text-4xl font-bold mt-8 text-gray-800 dark:text-gray-100"
              >
                你的便签页报告
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.6 }}
                className="text-gray-500 dark:text-gray-400 mt-4 text-sm"
              >
                向下滚动开始
              </motion.p>
              <motion.div
                className="mt-12 text-gray-400"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <i className="fa-solid fa-chevron-down text-2xl" />
              </motion.div>
            </div>
          </ReportScreen>

          {/* 屏 2：相遇日 */}
          <ReportScreen>
            <ReportNumberCard
              title="我们相遇在"
              value={stats.firstUseDate}
              subtitle="一切的开始"
            />
          </ReportScreen>

          {/* 屏 3：使用天数 + 连续天数 */}
          <ReportScreen>
            <ReportNumberCard
              title="一起度过"
              value={`${daysUsed}`}
              unit="天"
              subtitle={
                stats.streakDays > 1
                  ? `已经连续 ${stats.streakDays} 天打开了我`
                  : '欢迎回来'
              }
            />
          </ReportScreen>

          {/* 屏 4：最常访问 */}
          {topCard && (
            <ReportScreen>
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.7 }}
                className="text-center"
              >
                <p className="text-gray-500 dark:text-gray-400 mb-6 text-base">最常想念的是</p>
                {topCard.favicon ? (
                  <img
                    src={topCard.favicon}
                    alt=""
                    className="w-20 h-20 mx-auto rounded-2xl shadow-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-white/60 dark:bg-slate-800/60 shadow-lg flex items-center justify-center">
                    <i className="fa-solid fa-globe text-gray-400 text-3xl" />
                  </div>
                )}
                <h2 className="text-3xl md:text-4xl font-bold mt-6 text-gray-800 dark:text-gray-100 break-all max-w-md mx-auto">
                  {topCard.name}
                </h2>
                <p className="mt-4 text-rose-500 text-lg">去过 {topCard.visitCount || 0} 次</p>
              </motion.div>
            </ReportScreen>
          )}

          {/* 屏 5：活跃时段 */}
          {peakHour.count > 0 && (
            <ReportScreen>
              <ReportNumberCard
                title="最活跃在"
                value={`${peakHour.hour}`}
                unit="点"
                subtitle="一天里最频繁打开的时刻"
              />
            </ReportScreen>
          )}

          {/* 屏 6：搜索次数 */}
          <ReportScreen>
            <ReportNumberCard
              title="搜索了"
              value={`${stats.totalSearches}`}
              unit="次"
              subtitle="每一次都是一个小问题"
            />
          </ReportScreen>

          {/* 屏 7：结尾 */}
          <ReportScreen>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7 }}
              className="text-center"
            >
              <TomatoIcon size={64} variant="spin" />
              <h2 className="text-2xl md:text-3xl font-bold mt-8 text-gray-800 dark:text-gray-100">
                继续下一程
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-4 max-w-md mx-auto">
                下一个里程碑，等你
              </p>
              <button
                onClick={onClose}
                className="mt-10 px-8 py-3 bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-full font-medium hover:scale-105 active:scale-95 transition-transform shadow-lg"
              >
                回到便签页
              </button>
            </motion.div>
          </ReportScreen>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ReportScreen({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-screen flex items-center justify-center snap-start px-6">
      {children}
    </section>
  );
}

interface ReportNumberCardProps {
  title: string;
  value: string;
  unit?: string;
  subtitle?: string;
}

function ReportNumberCard({ title, value, unit, subtitle }: ReportNumberCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7 }}
      className="text-center"
    >
      <p className="text-gray-500 dark:text-gray-400 text-base mb-4">{title}</p>
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-6xl md:text-8xl font-extrabold bg-gradient-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent">
          {value}
        </span>
        {unit && <span className="text-2xl md:text-3xl text-gray-400">{unit}</span>}
      </div>
      {subtitle && <p className="text-gray-500 dark:text-gray-400 mt-6 text-sm">{subtitle}</p>}
    </motion.div>
  );
}
