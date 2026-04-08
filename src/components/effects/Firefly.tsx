/**
 * 萤火虫效果组件
 * 温暖光点缓慢漂浮闪烁，适合暗色背景
 */
import { useEffect, useRef, useCallback } from 'react';

interface Firefly {
    x: number;
    y: number;
    radius: number;
    opacity: number;
    targetOpacity: number;
    fadeSpeed: number;
    baseX: number; // 基础位置（正弦波中心）
    baseY: number;
    phaseX: number; // 正弦波相位
    phaseY: number;
    ampX: number; // 正弦波振幅
    ampY: number;
    freqX: number; // 正弦波频率
    freqY: number;
    layer: 'far' | 'near';
}

interface FireflyEffectProps {
    particleCount?: number;
    isSlowMotion?: boolean;
}

const SLOW_MOTION_FACTOR = 0.1;
const TRANSITION_SPEED = 0.05;

// 萤火虫颜色：温暖的黄色/橙色
const FIREFLY_COLORS = [
    { r: 255, g: 220, b: 80 },  // 暖黄
    { r: 255, g: 190, b: 60 },  // 橙黄
    { r: 255, g: 240, b: 130 }, // 亮黄
    { r: 180, g: 255, b: 100 }, // 黄绿
];

export default function FireflyEffect({ particleCount = 40, isSlowMotion = false }: FireflyEffectProps) {
    const maxFireflies = particleCount;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const firefliesRef = useRef<Firefly[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const tickRef = useRef(0);
    const lastFrameTimeRef = useRef(0);
    const isSlowMotionRef = useRef(isSlowMotion);
    const currentMotionFactorRef = useRef(1);

    isSlowMotionRef.current = isSlowMotion;

    const createFirefly = useCallback((width: number, height: number): Firefly => {
        const isNear = Math.random() > 0.5;
        const baseX = Math.random() * width;
        const baseY = Math.random() * height;
        return {
            x: baseX,
            y: baseY,
            baseX,
            baseY,
            radius: isNear ? Math.random() * 3 + 2 : Math.random() * 2 + 1,
            opacity: Math.random(),
            targetOpacity: Math.random() * 0.5 + 0.5,
            fadeSpeed: Math.random() * 0.015 + 0.008,
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            ampX: Math.random() * 80 + 30,
            ampY: Math.random() * 60 + 20,
            freqX: Math.random() * 0.008 + 0.003,
            freqY: Math.random() * 0.006 + 0.002,
            layer: isNear ? 'near' : 'far',
        };
    }, []);

    const animate = useCallback((_currentTime: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 控制帧率约为 30fps
        if (_currentTime - lastFrameTimeRef.current < 33) {
            animationFrameRef.current = requestAnimationFrame(animate);
            return;
        }
        lastFrameTimeRef.current = _currentTime;
        tickRef.current++;

        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        // 平滑过渡
        const targetFactor = isSlowMotionRef.current ? SLOW_MOTION_FACTOR : 1;
        currentMotionFactorRef.current += (targetFactor - currentMotionFactorRef.current) * TRANSITION_SPEED;
        const motionFactor = currentMotionFactorRef.current;

        // 初始化萤火虫
        if (firefliesRef.current.length < maxFireflies) {
            const needed = maxFireflies - firefliesRef.current.length;
            for (let i = 0; i < needed; i++) {
                firefliesRef.current.push(createFirefly(width, height));
            }
        }

        // 更新位置
        firefliesRef.current.forEach((firefly) => {
            // 闪烁效果
            firefly.opacity += (firefly.targetOpacity - firefly.opacity) * firefly.fadeSpeed * motionFactor;
            if (Math.abs(firefly.opacity - firefly.targetOpacity) < 0.01) {
                firefly.targetOpacity = Math.random() > 0.7 ? 0 : Math.random() * 0.4 + 0.6;
            }

            // 正弦波平滑移动
            const t = tickRef.current * motionFactor;
            firefly.x = firefly.baseX + Math.sin(firefly.phaseX + t * firefly.freqX) * firefly.ampX;
            firefly.y = firefly.baseY + Math.cos(firefly.phaseY + t * firefly.freqY) * firefly.ampY;

            // 缓慢漂移基础位置
            firefly.baseX += Math.sin(t * 0.005 + firefly.phaseX) * 0.15;
            firefly.baseY += Math.cos(t * 0.004 + firefly.phaseY) * 0.1;

            // 边界回绕
            if (firefly.baseX < -50) firefly.baseX = width + 50;
            if (firefly.baseX > width + 50) firefly.baseX = -50;
            if (firefly.baseY < -50) firefly.baseY = height + 50;
            if (firefly.baseY > height + 50) firefly.baseY = -50;

            const actualColor = FIREFLY_COLORS[Math.abs(firefly.phaseX * 100 | 0) % FIREFLY_COLORS.length];
            const alpha = firefly.opacity * (firefly.layer === 'near' ? 1 : 0.4);

            // 外发光
            const glowRadius = firefly.radius * (firefly.layer === 'near' ? 5 : 3);
            const gradient = ctx.createRadialGradient(
                firefly.x, firefly.y, 0,
                firefly.x, firefly.y, glowRadius
            );
            gradient.addColorStop(0, `rgba(${actualColor.r}, ${actualColor.g}, ${actualColor.b}, ${alpha})`);
            gradient.addColorStop(0.3, `rgba(${actualColor.r}, ${actualColor.g}, ${actualColor.b}, ${alpha * 0.3})`);
            gradient.addColorStop(1, `rgba(${actualColor.r}, ${actualColor.g}, ${actualColor.b}, 0)`);

            ctx.beginPath();
            ctx.arc(firefly.x, firefly.y, glowRadius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // 核心亮点
            ctx.beginPath();
            ctx.arc(firefly.x, firefly.y, firefly.radius * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 230, ${alpha * 0.9})`;
            ctx.fill();
        });

        animationFrameRef.current = requestAnimationFrame(animate);
    }, [createFirefly, maxFireflies]);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }, []);

    useEffect(() => {
        resizeCanvas();
        animationFrameRef.current = requestAnimationFrame(animate);
        window.addEventListener('resize', resizeCanvas);

        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            window.removeEventListener('resize', resizeCanvas);
            firefliesRef.current = [];
        };
    }, [animate, resizeCanvas]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[100]"
            style={{ background: 'transparent' }}
        />
    );
}
