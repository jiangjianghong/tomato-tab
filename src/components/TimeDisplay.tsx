import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTransparency } from '@/contexts/TransparencyContext';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { TodoModal } from './TodoModal';

export function TimeDisplay() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isColonVisible, setIsColonVisible] = useState(true);
  const [showTodoModal, setShowTodoModal] = useState(false);
  const {
    showFullDate,
    showSeconds,
    showWeekday,
    showYear,
    showMonth,
    showDay,
    timeComponentEnabled,
    workCountdownEnabled,
    lunchTime,
    offWorkTime,
  } = useTransparency();
  const { isMobile } = useResponsiveLayout();
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (showSeconds) {
      // 精确到秒模式，每秒1更新
      timer = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
    } else {
      // 不精确到秒模式，每500ms更新闪烁状态
      timer = setInterval(() => {
        setCurrentTime(new Date());
        setIsColonVisible((prev) => !prev);
      }, 500);
    }

    return () => clearInterval(timer);
  }, [showSeconds]);

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    if (showSeconds) {
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return { text: `${hours}:${minutes}:${seconds} `, colonOpacity: 1 };
    } else {
      // 不精确到秒时，冒号透明度闪烁效果
      const colonOpacity = isColonVisible ? 1 : 0.3;
      return { text: `${hours}:${minutes} `, colonOpacity };
    }
  };

  const formatDate = (date: Date) => {
    // 检查是否有任何日期元素被启用
    const hasAnyDateElement = showYear || showMonth || showDay || showWeekday;

    if (!hasAnyDateElement) {
      return ''; // 如果没有任何日期元素，返回空字符串
    }

    // 根据独立设置构建日期显示选项
    const options: Intl.DateTimeFormatOptions = {};

    // 根据年份开关
    if (showYear) {
      options.year = 'numeric';
    }

    // 根据月份开关
    if (showMonth) {
      options.month = 'long';
    }

    // 根据日期开关
    if (showDay) {
      options.day = 'numeric';
    }

    // 根据设置添加星期
    if (showWeekday) {
      options.weekday = 'long';
    }

    return date.toLocaleDateString('zh-CN', options);
  };

  // 计算倒计时文本
  const getCountdownText = () => {
    if (!workCountdownEnabled) return '';

    const now = new Date();

    // 解析时间字符串 (HH:mm)
    const [lunchHour, lunchMinute] = lunchTime.split(':').map(Number);
    const [offWorkHour, offWorkMinute] = offWorkTime.split(':').map(Number);

    const lunchDate = new Date(now);
    lunchDate.setHours(lunchHour, lunchMinute, 0, 0);

    const offWorkDate = new Date(now);
    offWorkDate.setHours(offWorkHour, offWorkMinute, 0, 0);

    // 计算差值 (毫秒)
    const lunchDiff = lunchDate.getTime() - now.getTime();
    const offWorkDiff = offWorkDate.getTime() - now.getTime();

    // 格式化函数
    const formatDiff = (diff: number) => {
      if (diff <= 0) return '已到点';
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      return `${hours}时${minutes}分${seconds} 秒`;
    };

    return (
      <div className="flex flex-col items-center gap-1 text-xs select-none pointer-events-none">
        {lunchDiff > 0 ? (
          <div className="select-none">距离午休: {formatDiff(lunchDiff)}</div>
        ) : offWorkDiff > 0 ? (
          <div className="select-none">距离下班: {formatDiff(offWorkDiff)}</div>
        ) : (
          <div className="select-none">已下班，好好休息吧</div>
        )}
      </div>
    );
  };

  // 处理时间点击事件
  const handleTimeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setShowTodoModal(true);
  };

  // 检查是否有任何日期元素被启用，用于调整时间位置
  const hasAnyDateElement = showYear || showMonth || showDay || showWeekday;

  return (
    <div
      className="relative z-5 mb-8 flex justify-center px-4 select-none pointer-events-none"
    >
      <motion.div
        className="w-full flex justify-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{
          opacity: timeComponentEnabled ? 1 : 0,
          y: 0,
          pointerEvents: timeComponentEnabled ? 'auto' : 'none',
        }}
        transition={{ duration: 0.3 }}
      >
        <div
          className="relative flex flex-col items-center select-none"
          style={{
            minHeight: isMobile ? '82px' : '118px',
            // 当没有日期元素时，时间向下移动以居中显示
            transform: hasAnyDateElement ? 'translateY(0)' : 'translateY(15px)',
          }}
        >
          <div
            className={`text-white/80 font-mono ${isMobile ? 'text-3xl' : 'text-6xl'} font-semibold tracking-wide mb-2 drop-shadow-sm cursor-pointer hover:text-white/90 transition-all duration-200 hover:scale-105 pointer-events-auto time-display-clickable select-none`}
            onClick={handleTimeClick}
          >
            {(() => {
              const timeData = formatTime(currentTime);
              if (showSeconds || timeData.text.includes(':')) {
                // 显示秒数或包含冒号的时间
                const parts = timeData.text.split(':');
                return (
                  <>
                    {parts[0]}
                    <span
                      className="transition-opacity duration-200"
                      style={{ opacity: timeData.colonOpacity }}
                    >
                      :
                    </span>
                    {parts[1]}
                    {parts[2] && (
                      <>
                        <span
                          className="transition-opacity duration-200"
                          style={{ opacity: timeData.colonOpacity }}
                        >
                          :
                        </span>
                        {parts[2]}
                      </>
                    )}
                  </>
                );
              } else {
                // 没有冒号的情况，直接显示
                return timeData.text;
              }
            })()}
          </div>

          {/* 始终占据固定空间，通过透明度控制显示 */}
          <div
            className={`text-white/60 ${isMobile ? 'text-sm' : 'text-lg'} font-medium drop-shadow-sm h-7 flex items-center justify-center min-w-[240px] select-none`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <span
              className={`transition - opacity duration - 200 text - center absolute select - none ${workCountdownEnabled && isHovered ? 'opacity-0' : (showFullDate ? 'opacity-100' : 'opacity-0')
                } `}
            >
              {showFullDate ? formatDate(currentTime) : '占位文本'}
            </span>

            {/* 倒计时显示 */}
            {workCountdownEnabled && (
              <span
                className={`transition - opacity duration - 200 text - center absolute select - none ${isHovered ? 'opacity-100' : 'opacity-0'
                  } `}
              >
                {getCountdownText()}
              </span>
            )}
          </div>
        </div>
      </motion.div >

      {/* Todo弹窗 */}
      < TodoModal
        isOpen={showTodoModal}
        onClose={() => setShowTodoModal(false)
        }
      />
    </div >
  );
}
