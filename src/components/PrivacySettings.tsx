import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { storageManager } from '@/lib/storageManager';
import { useUserStats } from '@/hooks/useUserStats';
import { supabase } from '@/lib/supabase';

interface PrivacySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacySettings({ isOpen, onClose }: PrivacySettingsProps) {
  const [stats, setStats] = useState(() => storageManager.getStorageStats());
  const [consentStatus, setConsentStatus] = useState(() => storageManager.getConsentStatus());
  const [clearingSearchLogs, setClearingSearchLogs] = useState(false);
  const { resetStats: resetUserStats } = useUserStats();

  useEffect(() => {
    if (isOpen) {
      setStats(storageManager.getStorageStats());
      setConsentStatus(storageManager.getConsentStatus());
    }
  }, [isOpen]);

  // ESC键关闭模态框
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleToggleConsent = () => {
    const newStatus = consentStatus === 'accepted' ? 'declined' : 'accepted';

    if (newStatus === 'accepted') {
      localStorage.setItem('cookie-consent', 'accepted');
      localStorage.setItem('cookie-consent-date', new Date().toISOString());
    } else {
      localStorage.setItem('cookie-consent', 'declined');
      localStorage.setItem('cookie-consent-date', new Date().toISOString());
      storageManager.clearNonEssentialData();
    }

    setConsentStatus(newStatus);
    setStats(storageManager.getStorageStats());
  };

  const handleClearAllData = () => {
    const confirmed = confirm(
      '⚠️ 确认清除所有数据？\n\n' + '这将删除您的所有网站收藏、设置和偏好。\n' + '此操作不可撤销！'
    );

    if (confirmed) {
      storageManager.clearNonEssentialData();
      setStats(storageManager.getStorageStats());
      alert('✅ 所有非必要数据已清除');
    }
  };

  const handleExportData = () => {
    const data = storageManager.exportData();
    if (!data) {
      alert('❌ 需要同意Cookie使用才能导出数据');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `我的数据导出_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert('✅ 数据导出成功！');
  };

  const handleClearSearchHistory = async () => {
    const confirmed = confirm(
      '确认清除搜索历史？\n\n这将删除服务器上记录的所有搜索关键词。\n此操作不可撤销！'
    );
    if (!confirmed) return;

    setClearingSearchLogs(true);
    try {
      const { data, error } = await supabase.rpc('delete_my_search_logs');
      if (error) throw error;
      alert(`已清除 ${data || 0} 条搜索记录`);
    } catch (err) {
      console.error('清除搜索历史失败:', err);
      alert('清除失败，请稍后重试');
    } finally {
      setClearingSearchLogs(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <motion.div
          className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl z-50 max-h-[90vh] flex flex-col mx-4"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        >
          {/* 头部 */}
          <div className="p-6 pb-0">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-shield-halved text-blue-600 dark:text-blue-400 text-2xl"></i>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">隐私与数据管理</h2>
              </div>
              <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          {/* 内容 */}
          <div className="flex-1 px-6 py-4 space-y-6 overflow-y-auto">
            {/* Cookie同意状态 */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-cookie-bite text-amber-500"></i>
                Cookie使用状态
              </h3>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    当前状态:
                    <span
                      className={`ml-2 px-2 py-1 rounded text-xs font-medium ${consentStatus === 'accepted'
                          ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300'
                          : consentStatus === 'declined'
                            ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'
                            : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300'
                        }`}
                    >
                      {consentStatus === 'accepted'
                        ? '✅ 已同意'
                        : consentStatus === 'declined'
                          ? '❌ 已拒绝'
                          : '⏳ 待决定'}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {consentStatus === 'accepted'
                      ? '您已同意使用Cookie和本地存储来提供完整功能'
                      : consentStatus === 'declined'
                        ? '您已拒绝非必要Cookie，部分功能可能受限'
                        : '等待您的选择'}
                  </p>
                </div>

                {consentStatus !== 'pending' && (
                  <button
                    onClick={handleToggleConsent}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${consentStatus === 'accepted'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                  >
                    {consentStatus === 'accepted' ? '撤销同意' : '重新同意'}
                  </button>
                )}
              </div>
            </div>

            {/* 数据使用统计 */}
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-chart-pie text-blue-600 dark:text-blue-400"></i>
                数据使用统计
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalKeys}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">总数据项</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.essentialKeys}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">必要数据</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.nonEssentialKeys}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">功能数据</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.storageUsed}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">存储占用</div>
                </div>
              </div>
            </div>

            {/* 数据类型说明 */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <i className="fa-solid fa-info-circle text-blue-600 dark:text-blue-400"></i>
                我们存储的数据类型
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                  <i className="fa-solid fa-shield-check text-green-600 dark:text-green-400 mt-0.5"></i>
                  <div>
                    <div className="font-medium text-green-800 dark:text-green-300">必要功能数据</div>
                    <div className="text-green-700 dark:text-green-400">
                      Cookie同意状态、基本设置 - 网站正常运行必需
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <i className="fa-solid fa-bookmark text-blue-600 dark:text-blue-400 mt-0.5"></i>
                  <div>
                    <div className="font-medium text-blue-800 dark:text-blue-300">收藏夹数据</div>
                    <div className="text-blue-700 dark:text-blue-400">您添加的网站收藏、访问记录、个人笔记</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                  <i className="fa-solid fa-palette text-purple-600 dark:text-purple-400 mt-0.5"></i>
                  <div>
                    <div className="font-medium text-purple-800 dark:text-purple-300">界面偏好</div>
                    <div className="text-purple-700 dark:text-purple-400">主题设置、透明度、布局偏好等个性化配置</div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                  <i className="fa-solid fa-chart-line text-orange-600 dark:text-orange-400 mt-0.5"></i>
                  <div>
                    <div className="font-medium text-orange-800 dark:text-orange-300">性能分析</div>
                    <div className="text-orange-700 dark:text-orange-400">加载时间、使用统计，帮助改善用户体验</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 数据管理操作 */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <i className="fa-solid fa-wrench text-gray-600"></i>
                数据管理操作
              </h3>
              <div className="space-y-3">
                <button
                  onClick={handleExportData}
                  disabled={consentStatus !== 'accepted'}
                  className="w-full p-3 bg-blue-100 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 text-blue-800 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-download"></i>
                    <div>
                      <div className="font-medium">导出我的数据</div>
                      <div className="text-sm opacity-75">下载包含所有个人数据的JSON文件</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={handleClearAllData}
                  className="w-full p-3 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-trash"></i>
                    <div>
                      <div className="font-medium">清除所有数据</div>
                      <div className="text-sm opacity-75">删除所有非必要的本地存储数据</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    const confirmed = confirm(
                      '⚠️ 确认重置使用统计？\n\n' + '这将清除您的所有使用统计记录，包括：\n' + '• 网站访问次数\n' + '• 搜索次数\n' + '• 卡片点击统计\n\n' + '此操作不可撤销！'
                    );
                    if (confirmed) {
                      resetUserStats();
                      alert('✅ 使用统计已重置');
                    }
                  }}
                  className="w-full p-3 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-chart-bar"></i>
                    <div>
                      <div className="font-medium">重置使用统计</div>
                      <div className="text-sm opacity-75">清除所有访问、搜索统计记录</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={handleClearSearchHistory}
                  disabled={clearingSearchLogs}
                  className="w-full p-3 bg-purple-100 hover:bg-purple-200 disabled:bg-gray-100 disabled:text-gray-400 text-purple-800 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-magnifying-glass"></i>
                    <div>
                      <div className="font-medium">清除搜索历史</div>
                      <div className="text-sm opacity-75">删除服务器上记录的所有搜索关键词</div>
                    </div>
                  </div>
                </button>
              </div>
              {/* 使用教程入口 */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <i className="fa-solid fa-book-open text-blue-500"></i>
                  使用教程
                </h3>
                <p className="text-sm text-gray-600 mb-3">详细了解本主页的全部功能与技巧。</p>
                <a
                  href="/help/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium shadow transition-colors"
                >
                  <i className="fa-solid fa-graduation-cap"></i>
                  打开使用教程
                </a>
              </div>
            </div>
          </div>

          {/* 底部 */}
          <div className="p-6 pt-0 border-t dark:border-gray-700">
            <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
              <span>最后更新: {new Date().toLocaleDateString('zh-CN')}</span>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg"
              >
                关闭
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
