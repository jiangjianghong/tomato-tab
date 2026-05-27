import { motion } from 'framer-motion';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useTransparency } from '@/contexts/TransparencyContext';
import TomatoIcon from '@/components/TomatoIcon';

interface DragPlaceholderProps {
  isActive: boolean;
}

export function DragPlaceholder({ isActive }: DragPlaceholderProps) {
  const { getCardClasses } = useResponsiveLayout();
  const { cardOpacity, cardColor } = useTransparency();

  if (!isActive) return null;

  return (
    <motion.div
      className={`${getCardClasses()} relative rounded-lg border-2 border-dashed border-white/40`}
      style={{
        backgroundColor: `rgba(${cardColor}, ${Math.max(cardOpacity * 0.3, 0.1)})`,
        backdropFilter: 'blur(5px)',
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: {
          type: 'spring',
          stiffness: 300,
          damping: 20,
          duration: 0.2,
        },
      }}
      exit={{
        opacity: 0,
        scale: 0.8,
        transition: {
          duration: 0.15,
        },
      }}
    >
      {/* 占位内容：呼吸番茄，暗示「等待落位」 */}
      <div className="h-full flex items-center justify-center">
        <motion.div
          animate={{
            scale: [1, 1.12, 1],
            opacity: [0.45, 0.85, 0.45],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <TomatoIcon size={32} variant="static" />
        </motion.div>
      </div>
    </motion.div>
  );
}

