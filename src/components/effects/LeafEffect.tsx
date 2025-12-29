/**
 * 落叶效果组件
 * 使用 CSS 3D Transform 实现真实的立体翻转效果
 */
import { useEffect, useRef, useCallback } from 'react';

interface Leaf {
    el: HTMLDivElement;
    x: number;
    y: number;
    z: number;
    rotation: {
        axis: 'X' | 'Y' | 'Z';
        value: number;
        speed: number;
        x: number;
    };
    xSpeedVariation: number;
    ySpeed: number;
    imageIndex: number;
    layer: 'far' | 'near'; // 图层
    opacity: number;
}

interface LeafEffectProps {
    particleCount?: number;
    windEnabled?: boolean; // 风力开关
    isSlowMotion?: boolean; // 慢放效果
}

// 内置 SVG 尖叶子（统一形状，不同颜色）
const LEAF_SVGS = [
    // 橙色尖叶
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 50"><path fill="#E57C23" stroke="#C45A1F" stroke-width="0.5" d="M15 2 Q28 18 22 32 Q18 44 15 48 Q12 44 8 32 Q2 18 15 2 Z"/><line x1="15" y1="8" x2="15" y2="45" stroke="#C45A1F" stroke-width="0.6"/></svg>`,
    // 红色尖叶
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 50"><path fill="#E74C3C" stroke="#C0392B" stroke-width="0.5" d="M15 2 Q26 16 21 30 Q17 44 15 48 Q13 44 9 30 Q4 16 15 2 Z"/><line x1="15" y1="8" x2="15" y2="45" stroke="#C0392B" stroke-width="0.6"/></svg>`,
    // 金黄色尖叶
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 50"><path fill="#F1C40F" stroke="#D4AC0D" stroke-width="0.5" d="M15 2 Q27 17 23 31 Q18 44 15 48 Q12 44 7 31 Q3 17 15 2 Z"/><line x1="15" y1="8" x2="15" y2="45" stroke="#D4AC0D" stroke-width="0.6"/></svg>`,
    // 深橙色尖叶
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 50"><path fill="#D35400" stroke="#A04000" stroke-width="0.5" d="M15 2 Q25 15 20 30 Q17 44 15 48 Q13 44 10 30 Q5 15 15 2 Z"/><line x1="15" y1="8" x2="15" y2="45" stroke="#A04000" stroke-width="0.6"/></svg>`,
    // 棕橙色尖叶
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 50"><path fill="#DC7633" stroke="#BA4A00" stroke-width="0.5" d="M15 2 Q27 16 22 31 Q18 44 15 48 Q12 44 8 31 Q3 16 15 2 Z"/><line x1="15" y1="8" x2="15" y2="45" stroke="#BA4A00" stroke-width="0.6"/></svg>`,
    // 橙黄色尖叶
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 50"><path fill="#F39C12" stroke="#D68910" stroke-width="0.5" d="M15 2 Q26 17 21 32 Q17 44 15 48 Q13 44 9 32 Q4 17 15 2 Z"/><line x1="15" y1="8" x2="15" y2="45" stroke="#D68910" stroke-width="0.6"/></svg>`,
];

export default function LeafEffect({ particleCount = 100, windEnabled = true, isSlowMotion = false }: LeafEffectProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<HTMLDivElement>(null);
    const nearSceneRef = useRef<HTMLDivElement>(null); // 近景层
    const leavesRef = useRef<Leaf[]>([]);
    const timerRef = useRef(0);
    const animationRef = useRef<number | null>(null);
    const isSlowMotionRef = useRef(isSlowMotion); // 使用 ref 存储最新值
    const currentMotionFactorRef = useRef(1); // 当前运动系数，用于平滑过渡
    const windRef = useRef({
        magnitude: 1.2,
        maxSpeed: 12,
        duration: 300,
        start: 0,
        speed: (_t: number, _y: number): number => 0,
    });

    // 同步 isSlowMotion prop 到 ref
    isSlowMotionRef.current = isSlowMotion;

    const numLeaves = Math.min(Math.max(particleCount, 10), 100); // 叶子数量由粒子数控制，范围 10-100

    // 重置叶子位置
    const resetLeaf = useCallback((leaf: Leaf, width: number, height: number, init = false) => {
        // 从右上方飘入
        leaf.x = width * 2 - Math.random() * width * 1.75;
        leaf.y = -10;
        leaf.z = Math.random() * 200;

        if (leaf.x > width) {
            leaf.x = width + 10;
            leaf.y = Math.random() * height / 2;
        }

        // 初始化时随机位置
        if (init) {
            leaf.y = Math.random() * height;
        }

        // 随机旋转轴
        leaf.rotation.speed = Math.random() * 10;
        const randomAxis = Math.random();
        if (randomAxis > 0.5) {
            leaf.rotation.axis = 'X';
            leaf.rotation.x = 0;
        } else if (randomAxis > 0.25) {
            leaf.rotation.axis = 'Y';
            leaf.rotation.x = Math.random() * 180 + 90;
        } else {
            leaf.rotation.axis = 'Z';
            leaf.rotation.x = Math.random() * 360 - 180;
            leaf.rotation.speed = Math.random() * 3; // Z轴旋转慢一些
        }

        leaf.xSpeedVariation = Math.random() * 0.8 - 0.4;
        leaf.ySpeed = Math.random() + 1.5;
    }, []);

    // 更新风力
    const updateWind = useCallback((height: number) => {
        const timer = timerRef.current;
        const wind = windRef.current;

        if (timer === 0 || timer > wind.start + wind.duration) {
            wind.magnitude = Math.random() * wind.maxSpeed;
            wind.duration = wind.magnitude * 50 + (Math.random() * 20 - 10);
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

    // 更新单个叶子
    const SLOW_MOTION_FACTOR = 0.1; // 慢放时速度降为原来的 10%
    const TRANSITION_SPEED = 0.05; // 过渡速度
    const updateLeaf = useCallback((leaf: Leaf, width: number, height: number) => {
        const wind = windRef.current;
        const timer = timerRef.current;

        // 平滑过渡：每帧让运动系数逐渐靠近目标值
        const targetFactor = isSlowMotionRef.current ? SLOW_MOTION_FACTOR : 1;
        currentMotionFactorRef.current += (targetFactor - currentMotionFactorRef.current) * TRANSITION_SPEED;
        const motionFactor = currentMotionFactorRef.current;

        const leafWindSpeed = windEnabled ? wind.speed(timer - wind.start, leaf.y) * motionFactor : 0;
        const xSpeed = leafWindSpeed + leaf.xSpeedVariation * motionFactor;

        leaf.x -= xSpeed;
        leaf.y += leaf.ySpeed * motionFactor;
        leaf.rotation.value += leaf.rotation.speed * motionFactor;

        // 构建 3D 变换
        let transform = `translateX(${leaf.x}px) translateY(${leaf.y}px) translateZ(${leaf.z}px) rotate${leaf.rotation.axis}(${leaf.rotation.value}deg)`;
        if (leaf.rotation.axis !== 'X') {
            transform += ` rotateX(${leaf.rotation.x}deg)`;
        }

        leaf.el.style.transform = transform;

        // 超出视野则重置
        if (leaf.x < -10 || leaf.y > height + 10) {
            resetLeaf(leaf, width, height);
        }
    }, [resetLeaf, windEnabled]);

    // 初始化
    useEffect(() => {
        const container = containerRef.current;
        const scene = sceneRef.current;
        const nearScene = nearSceneRef.current;
        if (!container || !scene || !nearScene) return;

        const width = container.offsetWidth;
        const height = container.offsetHeight;

        // 清空之前的叶子
        scene.innerHTML = '';
        nearScene.innerHTML = '';
        leavesRef.current = [];

        // 创建叶子（远景层 + 近景层）
        for (let i = 0; i < numLeaves; i++) {
            const el = document.createElement('div');
            const imageIndex = Math.floor(Math.random() * LEAF_SVGS.length);

            // 分层：前 60% 远景层，后 40% 近景层
            const isNear = i >= numLeaves * 0.6;
            const layer = isNear ? 'near' : 'far';

            // 远景层：小、淡、慢；近景层：大、浓、快
            const size = isNear
                ? 10 + Math.random() * 8   // 近景 10-18px
                : 5 + Math.random() * 5;   // 远景 5-10px
            const opacity = isNear ? 0.85 : 0.5;

            el.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background-image: url('data:image/svg+xml,${encodeURIComponent(LEAF_SVGS[imageIndex])}');
                background-size: 100%;
                background-repeat: no-repeat;
                transform-style: preserve-3d;
                backface-visibility: visible;
                will-change: transform;
                opacity: ${opacity};
            `;

            const leaf: Leaf = {
                el,
                x: 0,
                y: 0,
                z: 0,
                rotation: { axis: 'X', value: 0, speed: 0, x: 0 },
                xSpeedVariation: 0,
                ySpeed: 0,
                imageIndex,
                layer,
                opacity,
            };

            resetLeaf(leaf, width, height, true);
            leavesRef.current.push(leaf);

            // 远景层放 sceneRef，近景层放 nearSceneRef
            if (isNear) {
                nearSceneRef.current?.appendChild(el);
            } else {
                scene.appendChild(el);
            }
        }

        // 动画循环
        const animate = () => {
            const w = container.offsetWidth;
            const h = container.offsetHeight;

            if (windEnabled) {
                updateWind(h);
            }
            leavesRef.current.forEach(leaf => updateLeaf(leaf, w, h));
            timerRef.current++;

            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [numLeaves, resetLeaf, updateLeaf, updateWind]);

    // 窗口大小变化
    useEffect(() => {
        const handleResize = () => {
            // 自动适应，不需要额外处理
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <>
            {/* 远景层 - 在搜索框下方 */}
            <div
                ref={containerRef}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: 'none',
                    zIndex: 0,
                    overflow: 'hidden',
                }}
            >
                <div
                    ref={sceneRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        transformStyle: 'preserve-3d',
                        perspective: '400px',
                    }}
                />
            </div>
            {/* 近景层 - 在搜索框上方 */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: 'none',
                    zIndex: 100,
                    overflow: 'hidden',
                }}
            >
                <div
                    ref={nearSceneRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        transformStyle: 'preserve-3d',
                        perspective: '400px',
                    }}
                />
            </div>
        </>
    );
}
