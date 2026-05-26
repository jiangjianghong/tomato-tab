import { motion } from 'framer-motion';
import TomatoIcon from '@/components/TomatoIcon';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message = '正在加载...' }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      {/* 番茄轻轻晃动的叶子 + 呼吸式光晕 */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-full bg-red-400/20 blur-xl"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <TomatoIcon size={56} variant="spin" />
      </div>

      <motion.p
        className="text-gray-600 dark:text-gray-400 text-sm mt-6 font-medium"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {message}
      </motion.p>
    </div>
  );
}
