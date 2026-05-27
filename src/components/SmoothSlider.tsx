import { useEffect, useRef, useState, CSSProperties } from 'react';

interface SmoothSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  /** track 填充色（默认蓝色） */
  fillColor?: string;
  /** track 背景色，自动随暗色模式切换 */
  trackColor?: string;
  darkTrackColor?: string;
  darkMode?: boolean;
  ariaLabel?: string;
}

const FINE_DIVISIONS = 1000;

function quantize(raw: number, min: number, max: number, step: number) {
  const stepsFromMin = Math.round((raw - min) / step);
  const snapped = min + stepsFromMin * step;
  return Math.min(max, Math.max(min, snapped));
}

function formatDecimals(step: number) {
  const s = step.toString();
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

export default function SmoothSlider({
  min,
  max,
  step,
  value,
  onChange,
  className,
  fillColor = '#3b82f6',
  trackColor = '#e2e8f0',
  darkTrackColor = '#374151',
  darkMode = false,
  ariaLabel,
}: SmoothSliderProps) {
  const fineStep = (max - min) / FINE_DIVISIONS;
  const decimals = Math.max(formatDecimals(step), formatDecimals(fineStep));

  // 拖动期间使用本地连续值驱动 thumb 位置（视觉丝滑）；
  // 非拖动时跟随外部 value（受控）。
  const [dragValue, setDragValue] = useState<number | null>(null);
  const lastEmittedRef = useRef<number>(value);

  // 外部 value 变化时清掉本地 drag 缓存，保证受控同步
  useEffect(() => {
    lastEmittedRef.current = value;
  }, [value]);

  const displayValue = dragValue ?? value;
  const pct = ((displayValue - min) / (max - min)) * 100;
  const bg = darkMode ? darkTrackColor : trackColor;

  const style: CSSProperties = {
    background: 'transparent',
    // 通过 CSS 变量把渐变注入到 ::-webkit-slider-runnable-track / ::-moz-range-track
    ['--range-fill' as string]: `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, ${bg} ${pct}%, ${bg} 100%)`,
  };

  const commit = (raw: number) => {
    const snapped = parseFloat(quantize(raw, min, max, step).toFixed(decimals));
    if (snapped !== lastEmittedRef.current) {
      lastEmittedRef.current = snapped;
      onChange(snapped);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseFloat(e.target.value);
    setDragValue(raw);
    commit(raw); // 实时更新外部状态（用 snapped 值，业务侧无突变）
  };

  const handleRelease = () => {
    if (dragValue !== null) {
      // 松手时再做一次精确吸附，并清除本地 drag，让受控值接管
      commit(dragValue);
      setDragValue(null);
    }
  };

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={fineStep}
      value={displayValue}
      onChange={handleInput}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
      onBlur={handleRelease}
      onKeyUp={handleRelease}
      className={className}
      style={style}
      aria-label={ariaLabel}
    />
  );
}
