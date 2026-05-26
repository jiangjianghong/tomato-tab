/**
 * 樱花花瓣效果组件
 * 粉色花瓣飘落，带轻柔摇摆和旋转
 */
import { useEffect, useRef, useCallback } from 'react';

interface Petal {
    x: number;
    y: number;
    radius: number;
    speed: number;
    opacity: number;
    swing: number;
    swingSpeed: number;
    swingOffset: number;
    rotation: number;
    rotationSpeed: number;
    layer: 'far' | 'near';
    colorIndex: number;
}

interface CherryBlossomProps {
    particleCount?: number;
    isSlowMotion?: boolean;
    isExiting?: boolean;
    onExitComplete?: () => void;
}

const SPAWN_RATE = 0.4;
const SLOW_MOTION_FACTOR = 0.1;
const TRANSITION_SPEED = 0.05;
const EXIT_SPEED_MULTIPLIER = 2.2;
const ENTER_DURATION = 1200;

// 粉色花瓣颜色
const PETAL_COLORS = [
    'rgba(255, 183, 197,',
    'rgba(255, 154, 162,',
    'rgba(255, 209, 220,',
    'rgba(252, 160, 175,',
    'rgba(255, 223, 230,',
];

export default function CherryBlossom({ particleCount = 80, isSlowMotion = false, isExiting = false, onExitComplete }: CherryBlossomProps) {
    const maxPetals = particleCount;
    const farCanvasRef = useRef<HTMLCanvasElement>(null);
    const nearCanvasRef = useRef<HTMLCanvasElement>(null);
    const petalsRef = useRef<Petal[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const timerRef = useRef(0);
    const isSlowMotionRef = useRef(isSlowMotion);
    const currentMotionFactorRef = useRef(1);
    const isExitingRef = useRef(isExiting);
    const onExitCompleteRef = useRef(onExitComplete);
    const hasNotifiedExitRef = useRef(false);
    const mountTimeRef = useRef(0);

    isSlowMotionRef.current = isSlowMotion;
    isExitingRef.current = isExiting;
    onExitCompleteRef.current = onExitComplete;

    // 温和风力系统（比落叶风力和雪花风力都小）
    const windRef = useRef({
        magnitude: 0.8,
        maxSpeed: 8,
        duration: 500,
        start: 0,
        speed: (_t: number, _y: number): number => 0,
    });

    const updateWind = useCallback((height: number) => {
        const timer = timerRef.current;
        const wind = windRef.current;

        if (timer === 0 || timer > wind.start + wind.duration) {
            wind.magnitude = Math.random() * wind.maxSpeed;
            wind.duration = wind.magnitude * 120 + (Math.random() * 60 - 30);
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

    const createPetal = useCallback((canvasWidth: number): Petal => {
        const radius = Math.random() * 3 + 2;
        return {
            x: Math.random() * canvasWidth,
            y: -15,
            radius,
            speed: Math.random() * 0.8 + 0.5,
            opacity: Math.random() * 0.4 + 0.4,
            swing: Math.random() * 2 + 1,
            swingSpeed: Math.random() * 0.015 + 0.008,
            swingOffset: Math.random() * Math.PI * 2,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.03,
            layer: radius > 4 ? 'near' : 'far',
            colorIndex: Math.floor(Math.random() * PETAL_COLORS.length),
        };
    }, []);

    // 绘制花瓣形状
    const drawPetal = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rotation: number, opacity: number, colorIndex: number) => {
        const color = PETAL_COLORS[colorIndex];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.beginPath();
        // 花瓣形状
        ctx.moveTo(0, -radius);
        ctx.bezierCurveTo(radius * 0.8, -radius * 0.8, radius, 0, 0, radius);
        ctx.bezierCurveTo(-radius, 0, -radius * 0.8, -radius * 0.8, 0, -radius);
        ctx.fillStyle = `${color}${opacity})`;
        ctx.fill();
        ctx.restore();
    }, []);

    const animate = useCallback((currentTime: number) => {
        const farCanvas = farCanvasRef.current;
        const nearCanvas = nearCanvasRef.current;
        if (!farCanvas || !nearCanvas) return;

        const farCtx = farCanvas.getContext('2d');
        const nearCtx = nearCanvas.getContext('2d');
        if (!farCtx || !nearCtx) return;

        const deltaTime = currentTime - lastTimeRef.current;
        if (deltaTime < 33) {
            animationFrameRef.current = requestAnimationFrame(animate);
            return;
        }
        lastTimeRef.current = currentTime;

        const { width, height } = farCanvas;

        // 更新风力
        updateWind(height);
        const wind = windRef.current;

        farCtx.clearRect(0, 0, width, height);
        nearCtx.clearRect(0, 0, width, height);

        const currentSpawnRate = SPAWN_RATE * currentMotionFactorRef.current;
        const elapsedSinceMount = currentTime - mountTimeRef.current;
        const enterProgress = Math.min(1, elapsedSinceMount / ENTER_DURATION);
        const dynamicMax = isExitingRef.current ? 0 : Math.floor(maxPetals * enterProgress);
        if (!isExitingRef.current && petalsRef.current.length < dynamicMax && Math.random() < currentSpawnRate) {
            petalsRef.current.push(createPetal(width));
        }

        const targetFactor = isSlowMotionRef.current ? SLOW_MOTION_FACTOR : 1;
        currentMotionFactorRef.current += (targetFactor - currentMotionFactorRef.current) * TRANSITION_SPEED;
        const motionFactor = currentMotionFactorRef.current;
        const speedBoost = isExitingRef.current ? EXIT_SPEED_MULTIPLIER : 1;

        petalsRef.current = petalsRef.current.filter((petal) => {
            // 风力影响
            const windSpeed = wind.speed(timerRef.current - wind.start, petal.y) * 0.8 * motionFactor;
            petal.x -= windSpeed;
            petal.x += Math.sin(petal.swingOffset) * petal.swing * 0.3 * motionFactor;
            petal.y += petal.speed * motionFactor * speedBoost;
            petal.swingOffset += petal.swingSpeed * motionFactor;
            petal.rotation += petal.rotationSpeed * motionFactor;

            if (petal.x < -10) petal.x = width + 10;
            if (petal.x > width + 10) petal.x = -10;

            return petal.y < height + 20;
        });

        if (isExitingRef.current && petalsRef.current.length === 0 && !hasNotifiedExitRef.current) {
            hasNotifiedExitRef.current = true;
            onExitCompleteRef.current?.();
        }

        const farPetals = petalsRef.current.filter(p => p.layer === 'far');
        const nearPetals = petalsRef.current.filter(p => p.layer === 'near');

        farPetals.forEach((petal) => {
            drawPetal(farCtx, petal.x, petal.y, petal.radius, petal.rotation, petal.opacity * 0.6, petal.colorIndex);
        });

        nearPetals.forEach((petal) => {
            drawPetal(nearCtx, petal.x, petal.y, petal.radius, petal.rotation, petal.opacity, petal.colorIndex);
        });

        timerRef.current++;
        animationFrameRef.current = requestAnimationFrame(animate);
    }, [createPetal, maxPetals, drawPetal]);

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
        mountTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(animate);
        window.addEventListener('resize', resizeCanvas);

        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            window.removeEventListener('resize', resizeCanvas);
            petalsRef.current = [];
        };
    }, [animate, resizeCanvas]);

    return (
        <>
            <canvas
                ref={farCanvasRef}
                className="fixed inset-0 pointer-events-none z-[1]"
                style={{ background: 'transparent' }}
            />
            <canvas
                ref={nearCanvasRef}
                className="fixed inset-0 pointer-events-none z-[100]"
                style={{ background: 'transparent' }}
            />
        </>
    );
}
