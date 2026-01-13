import { motion, AnimatePresence } from 'framer-motion';

interface OfflineBannerProps {
    isOffline: boolean;
}

export default function OfflineBanner({ isOffline }: OfflineBannerProps) {
    return (
        <AnimatePresence>
            {isOffline && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    transition={{
                        type: 'spring',
                        damping: 25,
                        stiffness: 300,
                        duration: 0.5
                    }}
                    className="fixed top-0 left-0 right-0 z-[100]"
                >
                    <div className="bg-gradient-to-r from-red-500/95 to-orange-500/95 backdrop-blur-xl shadow-lg border-b-2 border-red-600/50">
                        <div className="max-w-7xl mx-auto px-4 py-3">
                            <div className="flex items-center justify-center gap-3">
                                {/* 离线图标 - 带脉冲动画 */}
                                <div className="relative">
                                    <motion.div
                                        animate={{
                                            scale: [1, 1.2, 1],
                                            opacity: [1, 0.5, 1]
                                        }}
                                        transition={{
                                            duration: 2,
                                            repeat: Infinity,
                                            ease: "easeInOut"
                                        }}
                                        className="absolute inset-0 bg-white/30 rounded-full"
                                    />
                                    <i className="fa-solid fa-wifi-slash text-white text-xl relative z-10"></i>
                                </div>

                                {/* 文本内容 */}
                                <div className="flex flex-col sm:flex-row items-center gap-2">
                                    <span className="text-white font-semibold text-sm sm:text-base">
                                        网络连接已断开
                                    </span>
                                    <span className="text-white/80 text-xs sm:text-sm">
                                        请检查您的网络设置
                                    </span>
                                </div>

                                {/* 重试按钮 */}
                                <motion.button
                                    onClick={() => window.location.reload()}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="ml-auto px-4 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-lg text-sm font-medium transition-colors border border-white/30 hidden sm:block"
                                >
                                    <i className="fa-solid fa-rotate-right mr-2"></i>
                                    重试
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
