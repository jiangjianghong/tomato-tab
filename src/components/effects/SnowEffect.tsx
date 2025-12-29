/**
 * 雪花效果组件
 * 使用双层 Canvas 实现视觉深度效果
 * - 远景层（小雪花）：z-index 较低，在搜索框和卡片之下
 * - 近景层（大雪花）：z-index 较高，在搜索框之上
 */
import { useEffect, useRef, useCallback } from 'react';

interface Snowflake {
    x: number;
    y: number;
    radius: number;
    speed: number;
    opacity: number;
    swing: number;
    swingSpeed: number;
    swingOffset: number;
    layer: 'far' | 'near'; // 远景或近景
}

interface SnowEffectProps {
    particleCount?: number;
    windEnabled?: boolean; // 风力开关
    isSlowMotion?: boolean; // 慢放效果
}

// 性能配置
const SPAWN_RATE = 0.5;
const SIZE_THRESHOLD = 2.2;
const SLOW_MOTION_FACTOR = 0.1; // 慢放时速度降为原来的 10%
const TRANSITION_SPEED = 0.05; // 过渡速度，每帧向目标值靠近 5%

export default function SnowEffect({ particleCount = 100, windEnabled = true, isSlowMotion = false }: SnowEffectProps) {
    const maxSnowflakes = particleCount;
    const farCanvasRef = useRef<HTMLCanvasElement>(null);
    const nearCanvasRef = useRef<HTMLCanvasElement>(null);
    const snowflakesRef = useRef<Snowflake[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const timerRef = useRef(0);
    const isSlowMotionRef = useRef(isSlowMotion); // 使用 ref 存储最新值
    const currentMotionFactorRef = useRef(1); // 当前运动系数，用于平滑过渡

    // 同步 isSlowMotion prop 到 ref
    isSlowMotionRef.current = isSlowMotion;

    // 风力系统
    const windRef = useRef({
        magnitude: 0.8,
        maxSpeed: 6,
        duration: 200,
        start: 0,
        speed: (_t: number, _y: number): number => 0,
    });

    // 创建雪花
    const createSnowflake = useCallback((canvasWidth: number): Snowflake => {
        const radius = Math.random() * 2.5 + 1;
        return {
            x: Math.random() * canvasWidth,
            y: -10,
            radius,
            speed: Math.random() * 1.2 + 0.8,
            opacity: Math.random() * 0.5 + 0.3,
            swing: Math.random() * 1.5 + 0.5,
            swingSpeed: Math.random() * 0.02 + 0.01,
            swingOffset: Math.random() * Math.PI * 2,
            layer: radius > SIZE_THRESHOLD ? 'near' : 'far',
        };
    }, []);

    // 更新风力
    const updateWind = useCallback((height: number) => {
        const timer = timerRef.current;
        const wind = windRef.current;

        if (timer === 0 || timer > wind.start + wind.duration) {
            wind.magnitude = Math.random() * wind.maxSpeed;
            wind.duration = wind.magnitude * 40 + (Math.random() * 30 - 15);
            wind.start = timer;

            const screenHeight = height;
            const mag = wind.magnitude;
            const dur = wind.duration;

            wind.speed = (t: number, y: number) => {
                const a = (mag / 2) * (screenHeight - (2 * y) / 3) / screenHeight;
                return a * Math.sin((2 * Math.PI / dur) * t + (3 * Math.PI / 2)) + a;
            };
        }
    }, []);

    // 动画循环
    const animate = useCallback((currentTime: number) => {
        const farCanvas = farCanvasRef.current;
        const nearCanvas = nearCanvasRef.current;
        if (!farCanvas || !nearCanvas) return;

        const farCtx = farCanvas.getContext('2d');
        const nearCtx = nearCanvas.getContext('2d');
        if (!farCtx || !nearCtx) return;

        // 控制帧率约为 30fps
        const deltaTime = currentTime - lastTimeRef.current;
        if (deltaTime < 33) {
            animationFrameRef.current = requestAnimationFrame(animate);
            return;
        }
        lastTimeRef.current = currentTime;

        const { width, height } = farCanvas;

        // 更新风力
        if (windEnabled) {
            updateWind(height);
        }
        const wind = windRef.current;
        const timer = timerRef.current;

        // 清空两个画布
        farCtx.clearRect(0, 0, width, height);
        nearCtx.clearRect(0, 0, width, height);

        // 可能生成新雪花（使用当前运动系数控制生成速度）
        const currentSpawnRate = SPAWN_RATE * currentMotionFactorRef.current;
        if (snowflakesRef.current.length < maxSnowflakes && Math.random() < currentSpawnRate) {
            snowflakesRef.current.push(createSnowflake(width));
        }

        // 平滑过渡：每帧让运动系数逐渐靠近目标值
        const targetFactor = isSlowMotionRef.current ? SLOW_MOTION_FACTOR : 1;
        currentMotionFactorRef.current += (targetFactor - currentMotionFactorRef.current) * TRANSITION_SPEED;

        // 更新雪花位置并过滤
        const motionFactor = currentMotionFactorRef.current;
        snowflakesRef.current = snowflakesRef.current.filter((flake) => {
            // 计算风力影响
            const windSpeed = windEnabled ? wind.speed(timer - wind.start, flake.y) * 0.5 * motionFactor : 0;
            flake.x -= windSpeed;
            flake.y += flake.speed * motionFactor;
            flake.swingOffset += flake.swingSpeed * motionFactor;

            // 超出左右边界时重新出现在另一侧
            if (flake.x < -10) flake.x = width + 10;
            if (flake.x > width + 10) flake.x = -10;

            return flake.y < height + 10;
        });

        // 分别获取远景和近景雪花
        const farFlakes = snowflakesRef.current.filter(f => f.layer === 'far');
        const nearFlakes = snowflakesRef.current.filter(f => f.layer === 'near');

        // 绘制远景雪花
        farFlakes.sort((a, b) => a.radius - b.radius).forEach((flake) => {
            const swingX = Math.sin(flake.swingOffset) * flake.swing;
            farCtx.beginPath();
            farCtx.arc(flake.x + swingX, flake.y, flake.radius, 0, Math.PI * 2);
            farCtx.fillStyle = `rgba(255, 255, 255, ${flake.opacity * 0.7})`;
            farCtx.fill();
        });

        // 绘制近景雪花
        nearFlakes.sort((a, b) => a.radius - b.radius).forEach((flake) => {
            const swingX = Math.sin(flake.swingOffset) * flake.swing;
            nearCtx.beginPath();
            nearCtx.arc(flake.x + swingX, flake.y, flake.radius, 0, Math.PI * 2);
            nearCtx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
            nearCtx.fill();
        });

        timerRef.current++;
        animationFrameRef.current = requestAnimationFrame(animate);
    }, [createSnowflake, maxSnowflakes, updateWind, windEnabled]);

    // 调整 Canvas 大小
    const resizeCanvas = useCallback(() => {
        const farCanvas = farCanvasRef.current;
        const nearCanvas = nearCanvasRef.current;
        if (!farCanvas || !nearCanvas) return;

        farCanvas.width = window.innerWidth;
        farCanvas.height = window.innerHeight;
        nearCanvas.width = window.innerWidth;
        nearCanvas.height = window.innerHeight;
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
            snowflakesRef.current = [];
        };
    }, [animate, resizeCanvas]);

    return (
        <>
            {/* 远景层 - 小雪花，在卡片下方 */}
            <canvas
                ref={farCanvasRef}
                className="fixed inset-0 pointer-events-none z-[1]"
                style={{ background: 'transparent' }}
            />
            {/* 近景层 - 大雪花，在搜索框上方 */}
            <canvas
                ref={nearCanvasRef}
                className="fixed inset-0 pointer-events-none z-[100]"
                style={{ background: 'transparent' }}
            />
        </>
    );
}
