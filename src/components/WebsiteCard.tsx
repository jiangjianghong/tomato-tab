import { motion } from 'framer-motion';
import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import Tilt from 'react-parallax-tilt';
import CardEditModal from './CardEditModal';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { useTransparency } from '@/contexts/TransparencyContext';
import { useLazyFavicon } from '@/hooks/useLazyFavicon';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { userStatsManager } from '@/hooks/useUserStats';

interface WebsiteCardData {
  id: string;
  name: string;
  url: string;
  favicon: string;
  tags: string[];
  note?: string;
  visitCount?: number;
  lastVisit?: string;
}

interface WebsiteCardProps {
  id: string;
  name: string;
  url: string;
  favicon: string;
  tags: string[];
  visitCount: number;
  note?: string;
  index: number;
  moveCard: (dragIndex: number, hoverIndex: number) => void;
  onSave: (data: WebsiteCardData) => void;
  onDelete?: (id: string) => void;
  onCardSave?: () => void; // 可选的保存回调，用于触发同步
  onAddCard?: () => void; // 新增卡片回调
}

export const WebsiteCard = memo(function WebsiteCardComponent({
  id,
  name,
  url,
  favicon,
  tags,
  visitCount,
  note,
  index,
  moveCard,
  onSave,
  onDelete,
  onCardSave,
  onAddCard,
}: WebsiteCardProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [, setClickAnimation] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const { autoSortEnabled, searchInNewTab } = useTransparency();
  const { faviconUrl } = useLazyFavicon(url, favicon, cardRef);
  const { isMobile, getCardClasses } = useResponsiveLayout();

  const [{ isDragging }, drag] = useDrag({
    type: 'WEBSITE_CARD',
    item: { id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: () => !isMobile && !autoSortEnabled, // 移动端或启用自动排序时禁用拖拽
  });

  const [, drop] = useDrop({
    accept: 'WEBSITE_CARD',
    hover(item: { id: string; index: number }, monitor) {
      if (!cardRef.current) return;

      const dragIndex = item.index;
      const hoverIndex = index;

      // 如果是同一个位置，不处理
      if (dragIndex === hoverIndex) return;

      // 获取卡片的边界矩形
      const hoverBoundingRect = cardRef.current.getBoundingClientRect();

      // 获取卡片中心点
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;

      // 获取鼠标位置
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      // 计算鼠标在hover卡片中的位置
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      const hoverClientX = clientOffset.x - hoverBoundingRect.left;

      // 判断是水平还是垂直移动（根据网格布局）
      // 获取每行的卡片数量（可以通过容器宽度和卡片宽度计算）
      const cardsPerRow = Math.floor(window.innerWidth / 150); // 假设每个卡片约150px宽

      const dragRow = Math.floor(dragIndex / cardsPerRow);
      const hoverRow = Math.floor(hoverIndex / cardsPerRow);
      const isSameRow = dragRow === hoverRow;

      if (isSameRow) {
        // 同一行，检查水平位置
        if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
          return; // 向右拖，但还没超过中点
        }
        if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
          return; // 向左拖，但还没超过中点
        }
      } else {
        // 不同行，检查垂直位置
        if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY * 0.3) {
          return; // 向下拖，但只进入了30%
        }
        if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY * 1.7) {
          return; // 向上拖，但只进入了30%
        }
      }

      // 执行交换
      moveCard(dragIndex, hoverIndex);

      // 更新item的index，这很重要！
      item.index = hoverIndex;
    },
  });

  drop(cardRef);
  drag(cardRef);

  // 清理定时器
  const cleanupTimers = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      cleanupTimers();
    };
  }, []);

  // 处理卡片悬停效果（简化版）
  const handleMouseEnter = useCallback(() => {
    if (!isMobile && !isDragging) {
      setIsHovered(true);
    }
  }, [isMobile, isDragging]);

  const handleMouseLeave = useCallback(() => {
    if (!isMobile) {
      setIsHovered(false);
    }
  }, [isMobile]);

  // 处理卡片点击动画
  const handleCardClick = useCallback(() => {
    if (isMobile) {
      setClickAnimation(true);
      setTimeout(() => setClickAnimation(false), 200);
    }

    // 根据设置决定打开方式
    if (searchInNewTab) {
      // 在新标签页中打开
      window.open(url, '_blank');
    } else {
      // 在当前页面直接跳转
      window.location.href = url;
    }

    // 记录用户统计（总访问次数）
    userStatsManager.recordSiteVisit();

    // 更新卡片访问次数
    onSave({
      id,
      name,
      url,
      favicon,
      tags,
      note,
      visitCount: visitCount + 1,
      lastVisit: new Date().toISOString().split('T')[0],
    });
  }, [isMobile, searchInNewTab, url, id, name, favicon, tags, note, visitCount, onSave]);

  // 移动端长按菜单
  const handleLongPress = () => {
    if (isMobile) {
      setShowEditModal(true);
    }
  };

  const startLongPress = () => {
    if (isMobile) {
      longPressTimer.current = setTimeout(handleLongPress, 500);
    }
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // 右键菜单项
  const contextMenuItems: ContextMenuItem[] = [
    {
      icon: 'fa-solid fa-pen-to-square',
      label: '编辑卡片',
      onClick: () => {
        setShowEditModal(true);
      },
    },
    ...(onAddCard ? [{
      icon: 'fa-solid fa-plus',
      label: '新增卡片',
      onClick: () => {
        onAddCard();
      },
    }] : []),
  ];

  return (
    <>
      {/* 使用Tilt组件实现3D效果 */}
      <Tilt
        tiltEnable={!isMobile && !isDragging && !autoSortEnabled}
        tiltReverse={true} // 反转倾斜方向（按下效果）
        tiltMaxAngleX={25} // 增加X轴倾斜角度
        tiltMaxAngleY={25} // 增加Y轴倾斜角度
        perspective={1000}
        transitionSpeed={1000}
        scale={1.02}
        glareEnable={!isMobile && !autoSortEnabled}
        glareMaxOpacity={0.3}
        glareColor="lightblue"
        glarePosition="all"
      >
        {/* 简化的卡片容器 - 保留圆角 */}
        <motion.div
          data-website-card="true"
          className={`${getCardClasses()} relative rounded-lg cursor-pointer`}
          style={{
            backgroundColor: 'transparent',
            backdropFilter: 'none',
            border: '1px solid transparent',
            boxShadow: 'none',
          }}
          animate={{
            opacity: isDragging ? 0.5 : 1,
            zIndex: isDragging ? 50 : 0,
            rotate: isDragging ? 5 : 0, // 拖拽时轻微旋转
            scale: isDragging ? 1.05 : 1, // 拖拽时轻微放大
          }}
          transition={{
            type: 'spring',
            stiffness: 200,
            damping: 15,
            duration: 0.2,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={startLongPress}
          onTouchEnd={clearLongPress}
          onTouchMove={clearLongPress}
          onTouchCancel={clearLongPress}
          onClick={handleCardClick}
          onContextMenu={handleContextMenu}
          whileTap={{
            scale: 0.95,
            filter: 'brightness(0.85)',
            transition: { duration: 0.1, ease: 'easeInOut' },
          }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{
            opacity: 1,
            y: 0,
            transition: {
              duration: 0.4,
              ease: 'easeOut',
              delay: 0.05,
            },
          }}
          viewport={{ once: true }}
          ref={cardRef}
        >
          <div className={`h-full flex flex-col items-center justify-center ${isMobile ? 'px-0.5 py-2' : 'px-2 py-3'} select-none`}>
            {/* 网站图标和名称区域 */}
            <div className="flex flex-col items-center select-none">
              <div
                className={`${isMobile ? 'w-10 h-10' : 'w-14 h-14 mb-2'} rounded-full overflow-hidden select-none relative`}
              >
                <img
                  src={faviconUrl}
                  alt={`${name} favicon`}
                  className="w-full h-full object-contain select-none"
                  loading="lazy"
                  draggable="false"
                />
              </div>
              <h3
                className={`${isMobile ? 'text-[11px] line-clamp-1 mt-1 px-0.5' : 'text-sm line-clamp-2 px-2 mt-1'} font-medium text-white text-center select-none`}
              >
                {name}
              </h3>
            </div>
          </div>

          {/* 悬停效果边框 */}
          {!isMobile && isHovered && !isDragging && (
            <motion.div
              className="absolute inset-0 rounded-lg pointer-events-none"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          )}

          {/* 拖拽时的占位提示 */}
          {isDragging && (
            <motion.div
              className="absolute inset-0 rounded-lg border-2 border-dashed border-white/50 bg-white/10 pointer-events-none flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="text-white/60 text-sm"
              >
                <i className="fa-solid fa-arrows-up-down-left-right"></i>
              </motion.div>
            </motion.div>
          )}

          {/* 悬停时的阴影效果 */}
          {!isMobile && isHovered && (
            <motion.div
              className="absolute inset-0 rounded-lg pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                boxShadow: 'none',
                zIndex: -1,
              }}
            />
          )}
        </motion.div>
      </Tilt >

      {showEditModal && (
        <CardEditModal
          id={id}
          name={name}
          url={url}
          favicon={favicon}
          tags={tags}
          note={note}
          onClose={() => setShowEditModal(false)}
          onSave={(data) => {
            onSave(data);
            setShowEditModal(false);
            // 保存后触发同步
            onCardSave?.();
          }}
          onDelete={onDelete}
        />
      )
      }

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
});
