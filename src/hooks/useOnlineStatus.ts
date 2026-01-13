import { useState, useEffect } from 'react';

/**
 * 检测网络在线状态的 Hook
 * @returns {boolean} 是否在线
 */
export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [testMode, setTestMode] = useState(false); // 测试模式

    useEffect(() => {
        const handleOnline = () => {
            console.log('🌐 网络已连接');
            if (!testMode) {
                setIsOnline(true);
            }
        };

        const handleOffline = () => {
            console.log('📡 网络已断开');
            if (!testMode) {
                setIsOnline(false);
            }
        };

        // 测试快捷键：Ctrl+Shift+O 切换离线状态
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'O') {
                e.preventDefault();
                setTestMode(prev => !prev);
                setIsOnline(prev => {
                    const newState = !prev;
                    console.log(`🧪 [测试模式] 网络状态切换为: ${newState ? '在线' : '离线'}`);
                    return newState;
                });
            }
        };

        // 添加事件监听器
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('keydown', handleKeyDown);

        // 暴露到控制台供手动测试
        if (typeof window !== 'undefined') {
            (window as any).toggleOfflineTest = () => {
                setTestMode(prev => !prev);
                setIsOnline(prev => {
                    const newState = !prev;
                    console.log(`🧪 [测试模式] 网络状态切换为: ${newState ? '在线' : '离线'}`);
                    return newState;
                });
            };
            console.log('💡 离线测试提示：');
            console.log('  - 方法1：按 Ctrl+Shift+O 切换离线状态');
            console.log('  - 方法2：在控制台输入 toggleOfflineTest() 切换');
        }

        // 清理函数
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [testMode]);

    return isOnline;
}
