import { motion } from 'framer-motion';
import { useId } from 'react';

type TomatoVariant = 'static' | 'spin' | 'squeeze' | 'bounce';

interface TomatoIconProps {
  size?: number;
  variant?: TomatoVariant;
  className?: string;
}

// 共用的番茄 SVG，复用 TomatoRain 的设计语言：暖红渐变果身 + 五瓣绿色蒂 + 高光
export default function TomatoIcon({ size = 32, variant = 'static', className }: TomatoIconProps) {
  // 防止同一页面多次出现时 defs id 冲突
  const uid = useId().replace(/:/g, '');
  const gradId = `tomato-grad-${uid}`;

  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop stopColor="#FF6B6B" offset="0%" />
          <stop stopColor="#EE5253" offset="100%" />
        </linearGradient>
      </defs>
      <path
        d="M16,5 C23,5 29,10 29,19 C29,27 23,30 16,30 C9,30 3,27 3,19 C3,10 9,5 16,5 Z"
        fill={`url(#${gradId})`}
        stroke="#C0392B"
        strokeWidth="0.5"
      />
      <path
        d="M16,5 C16,5 12,1 9,3 C9,3 13,8 14,9 C14,9 15,3 16,4 C17,3 18,9 18,9 C19,8 23,3 23,3 C20,1 16,5 16,5 Z"
        fill="#2ECC71"
        stroke="#27AE60"
        strokeWidth="0.5"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="3"
        ry="1.5"
        fill="rgba(255,255,255,0.35)"
        transform="rotate(-45 12 12)"
      />
    </svg>
  );

  if (variant === 'static') {
    return svg;
  }

  if (variant === 'spin') {
    // 慢速摇摆而不是整圈旋转，让叶子有「轻轻晃动」的感觉
    return (
      <motion.div
        style={{ width: size, height: size, transformOrigin: '50% 70%' }}
        animate={{ rotate: [-8, 8, -8] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {svg}
      </motion.div>
    );
  }

  if (variant === 'squeeze') {
    return (
      <motion.div
        style={{ width: size, height: size, transformOrigin: '50% 65%' }}
        animate={{ scaleX: [1, 1.08, 1], scaleY: [1, 0.92, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {svg}
      </motion.div>
    );
  }

  // bounce
  return (
    <motion.div
      style={{ width: size, height: size }}
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
    >
      {svg}
    </motion.div>
  );
}
