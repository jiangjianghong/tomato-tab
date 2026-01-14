import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/SupabaseAuthContext';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'info' | 'warning' | 'update' | 'maintenance';
    created_at: string;
}

interface AnnouncementReply {
    id: string;
    announcement_id: string;
    user_id: string;
    content: string;
    created_at: string;
    user_name?: string;
}

const TYPE_CONFIG = {
    info: {
        icon: '📢',
        label: '通知',
        bg: 'bg-blue-50 dark:bg-blue-900/30',
        border: 'border-blue-200 dark:border-blue-800',
        text: 'text-blue-600 dark:text-blue-400',
    },
    update: {
        icon: '🆕',
        label: '更新',
        bg: 'bg-emerald-50 dark:bg-emerald-900/30',
        border: 'border-emerald-200 dark:border-emerald-800',
        text: 'text-emerald-600 dark:text-emerald-400',
    },
    warning: {
        icon: '⚠️',
        label: '警告',
        bg: 'bg-yellow-50 dark:bg-yellow-900/30',
        border: 'border-yellow-200 dark:border-yellow-800',
        text: 'text-yellow-600 dark:text-yellow-400',
    },
    maintenance: {
        icon: '🔧',
        label: '维护',
        bg: 'bg-red-50 dark:bg-red-900/30',
        border: 'border-red-200 dark:border-red-800',
        text: 'text-red-600 dark:text-red-400',
    },
};

interface AnnouncementCenterProps {
    isVisible?: boolean;
}

export default function AnnouncementCenter({ isVisible = true }: AnnouncementCenterProps) {
    const { currentUser } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasUnread, setHasUnread] = useState(false);

    // 回复相关状态
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [replies, setReplies] = useState<Record<string, AnnouncementReply[]>>({});
    const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
    const [replyContent, setReplyContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [loadingReplies, setLoadingReplies] = useState<string | null>(null);

    useEffect(() => {
        loadAnnouncements();
    }, []);

    const loadAnnouncements = async () => {
        try {
            // 获取有效公告
            const { data, error } = await supabase
                .from('announcements')
                .select('id, title, content, type, created_at')
                .eq('is_active', true)
                .or('expires_at.is.null,expires_at.gt.now()')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            setAnnouncements(data || []);

            // 加载每个公告的回复数量
            if (data && data.length > 0) {
                const counts: Record<string, number> = {};
                for (const announcement of data) {
                    const { count } = await supabase
                        .from('announcement_replies')
                        .select('*', { count: 'exact', head: true })
                        .eq('announcement_id', announcement.id);
                    counts[announcement.id] = count || 0;
                }
                setReplyCounts(counts);
            }

            // 检查是否有未读公告
            const lastReadTime = localStorage.getItem('last_read_announcements');
            if (data && data.length > 0) {
                if (!lastReadTime) {
                    setHasUnread(true);
                } else {
                    const hasNew = data.some(a => new Date(a.created_at) > new Date(lastReadTime));
                    setHasUnread(hasNew);
                }
            }
        } catch (err) {
            console.error('Failed to load announcements:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadReplies = async (announcementId: string) => {
        if (replies[announcementId]) return; // 已加载过

        setLoadingReplies(announcementId);
        try {
            // 先查询回复
            const { data, error } = await supabase
                .from('announcement_replies')
                .select('id, announcement_id, user_id, content, created_at')
                .eq('announcement_id', announcementId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            // 获取所有唯一的 user_id
            const userIds = [...new Set((data || []).map(r => r.user_id))];

            // 尝试获取用户 display_name（如果 RLS 允许）
            let userNames: Record<string, string> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('user_profiles')
                    .select('id, display_name')
                    .in('id', userIds);

                if (profiles) {
                    profiles.forEach(p => {
                        userNames[p.id] = p.display_name || '';
                    });
                }
            }

            const formattedReplies = (data || []).map(reply => ({
                ...reply,
                user_name: userNames[reply.user_id] || `用户${reply.user_id.substring(0, 6)}`
            }));

            setReplies(prev => ({
                ...prev,
                [announcementId]: formattedReplies
            }));
        } catch (err) {
            console.error('Failed to load replies:', err);
        } finally {
            setLoadingReplies(null);
        }
    };

    const submitReply = async (announcementId: string) => {
        if (!currentUser || !replyContent.trim()) return;

        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('announcement_replies')
                .insert({
                    announcement_id: announcementId,
                    user_id: currentUser.id,
                    content: replyContent.trim()
                });

            if (error) throw error;

            // 清空输入框并重新加载回复
            setReplyContent('');

            // 重新加载该公告的回复
            const { data } = await supabase
                .from('announcement_replies')
                .select(`
                    id,
                    announcement_id,
                    user_id,
                    content,
                    created_at,
                    user_profiles:user_id (display_name)
                `)
                .eq('announcement_id', announcementId)
                .order('created_at', { ascending: true });

            const formattedReplies = (data || []).map(reply => ({
                ...reply,
                user_name: (reply.user_profiles as any)?.display_name || '匿名用户'
            }));

            setReplies(prev => ({
                ...prev,
                [announcementId]: formattedReplies
            }));

            // 更新回复数量
            setReplyCounts(prev => ({
                ...prev,
                [announcementId]: (prev[announcementId] || 0) + 1
            }));
        } catch (err) {
            console.error('Failed to submit reply:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const deleteReply = async (replyId: string, announcementId: string) => {
        try {
            const { error } = await supabase
                .from('announcement_replies')
                .delete()
                .eq('id', replyId);

            if (error) throw error;

            // 从本地状态移除
            setReplies(prev => ({
                ...prev,
                [announcementId]: prev[announcementId]?.filter(r => r.id !== replyId) || []
            }));

            // 更新回复数量
            setReplyCounts(prev => ({
                ...prev,
                [announcementId]: Math.max((prev[announcementId] || 1) - 1, 0)
            }));
        } catch (err) {
            console.error('Failed to delete reply:', err);
        }
    };

    const handleOpen = () => {
        setIsOpen(true);
        setHasUnread(false);
        // 记录阅读时间
        localStorage.setItem('last_read_announcements', new Date().toISOString());
    };

    const toggleExpand = async (announcementId: string) => {
        if (expandedId === announcementId) {
            setExpandedId(null);
        } else {
            setExpandedId(announcementId);
            await loadReplies(announcementId);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days === 0) return '今天';
        if (days === 1) return '昨天';
        if (days < 7) return `${days}天前`;
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    };

    const formatUserName = (name: string) => {
        if (!name || name === '匿名用户') return '匿名用户';
        if (name.length <= 6) return name;
        return name.substring(0, 6) + '...';
    };

    if (!isVisible || loading) return null;

    return (
        <>
            {/* 公告入口按钮 - 左下角 */}
            <motion.div
                className="fixed bottom-4 left-4 z-40"
                animate={{ opacity: 1, scale: 1 }}
                initial={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: 0.5, duration: 0.3, ease: "easeInOut" }}
            >
                <motion.button
                    onClick={handleOpen}
                    className="relative p-3 transition-all duration-300 group"
                    title="查看公告"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <i className="fa-solid fa-bullhorn text-xl text-white/80 group-hover:text-white transition-colors"></i>

                    {/* 未读红点 */}
                    {hasUnread && (
                        <motion.span
                            className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-900"
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        />
                    )}
                </motion.button>
            </motion.div>

            {/* 公告列表弹窗 */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* 背景遮罩 */}
                        <motion.div
                            className="fixed inset-0 bg-gradient-to-br from-black/40 via-black/50 to-black/60 backdrop-blur-sm z-50"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setIsOpen(false)}
                        />

                        {/* 公告面板 - 居中显示 */}
                        <motion.div
                            className="fixed inset-0 z-50 flex items-center justify-center p-4"
                            initial={{ opacity: 0, scale: 0.8, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                            onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
                        >
                            <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 rounded-2xl max-h-[80vh] w-full max-w-lg overflow-hidden flex flex-col shadow-[0_35px_80px_-15px_rgba(0,0,0,0.7),0_0_40px_-10px_rgba(0,0,0,0.3)] ring-1 ring-black/5 dark:ring-white/5">
                                {/* 头部 */}
                                <div className="p-5 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between bg-gradient-to-r from-transparent via-gray-50/50 to-transparent dark:via-gray-800/50">
                                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2.5 select-none">
                                        <i className="fa-solid fa-bullhorn text-blue-500 text-lg"></i>
                                        系统公告
                                    </h2>
                                    <motion.button
                                        onClick={() => setIsOpen(false)}
                                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        whileHover={{ scale: 1.1, rotate: 90 }}
                                        whileTap={{ scale: 0.9 }}
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </motion.button>
                                </div>

                                {/* 公告列表 */}
                                <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gradient-to-b from-gray-50/30 to-transparent dark:from-gray-800/30">
                                    {announcements.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400">
                                            <i className="fa-solid fa-inbox text-5xl mb-4 opacity-50"></i>
                                            <p className="text-sm">暂无公告</p>
                                        </div>
                                    ) : (
                                        announcements.map((announcement, index) => {
                                            const config = TYPE_CONFIG[announcement.type] || TYPE_CONFIG.info;
                                            const isExpanded = expandedId === announcement.id;
                                            const announcementReplies = replies[announcement.id] || [];
                                            const replyCount = replyCounts[announcement.id] || 0;

                                            return (
                                                <motion.div
                                                    key={announcement.id}
                                                    className={`${config.bg} ${config.border} border-2 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300`}
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: index * 0.05 }}
                                                    whileHover={{ y: -2 }}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-2xl mt-1">{config.icon}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <h3 className={`font-semibold text-base ${config.text}`}>
                                                                    {announcement.title}
                                                                </h3>
                                                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 select-none">
                                                                    {formatDate(announcement.created_at)}
                                                                </span>
                                                            </div>
                                                            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{announcement.content}</p>

                                                            {/* 回复区域 */}
                                                            <div className="mt-4 pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
                                                                <motion.button
                                                                    onClick={() => toggleExpand(announcement.id)}
                                                                    className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium select-none"
                                                                    whileHover={{ x: 2 }}
                                                                    whileTap={{ scale: 0.98 }}
                                                                >
                                                                    <i className="fa-solid fa-comment text-base"></i>
                                                                    <span>{replyCount} 条回复</span>
                                                                    <motion.i
                                                                        className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-xs`}
                                                                        animate={{ rotate: isExpanded ? 180 : 0 }}
                                                                        transition={{ duration: 0.2 }}
                                                                    />
                                                                </motion.button>

                                                                <AnimatePresence>
                                                                    {isExpanded && (
                                                                        <motion.div
                                                                            initial={{ height: 0, opacity: 0 }}
                                                                            animate={{ height: 'auto', opacity: 1 }}
                                                                            exit={{ height: 0, opacity: 0 }}
                                                                            transition={{ duration: 0.2 }}
                                                                            className="overflow-hidden"
                                                                        >
                                                                            <div className="mt-3 space-y-2">
                                                                                {/* 加载中状态 */}
                                                                                {loadingReplies === announcement.id && (
                                                                                    <div className="text-center py-2 text-gray-400 text-sm">
                                                                                        <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                                                                                        加载中...
                                                                                    </div>
                                                                                )}

                                                                                {/* 回复列表 */}
                                                                                {announcementReplies.map((reply) => (
                                                                                    <motion.div
                                                                                        key={reply.id}
                                                                                        className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg p-3 text-sm border border-gray-200/50 dark:border-gray-700/50 hover:shadow-sm transition-shadow"
                                                                                        initial={{ opacity: 0, x: -10 }}
                                                                                        animate={{ opacity: 1, x: 0 }}
                                                                                        exit={{ opacity: 0, x: -10 }}
                                                                                    >
                                                                                        <div className="flex items-center justify-between mb-1">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <span className="text-gray-600 dark:text-gray-300 font-medium">
                                                                                                    {formatUserName(reply.user_name || '')}
                                                                                                </span>
                                                                                                <span className="text-gray-400 dark:text-gray-500 text-xs">
                                                                                                    {formatDate(reply.created_at)}
                                                                                                </span>
                                                                                            </div>
                                                                                            {currentUser?.id === reply.user_id && (
                                                                                                <motion.button
                                                                                                    onClick={() => deleteReply(reply.id, announcement.id)}
                                                                                                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                                                                                    title="删除回复"
                                                                                                    whileHover={{ scale: 1.1 }}
                                                                                                    whileTap={{ scale: 0.9 }}
                                                                                                >
                                                                                                    <i className="fa-solid fa-trash-can text-xs"></i>
                                                                                                </motion.button>
                                                                                            )}
                                                                                        </div>
                                                                                        <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                                                                                            {reply.content}
                                                                                        </p>
                                                                                    </motion.div>
                                                                                ))}

                                                                                {/* 无回复提示 */}
                                                                                {!loadingReplies && announcementReplies.length === 0 && (
                                                                                    <div className="text-center py-2 text-gray-400 text-sm">
                                                                                        暂无回复，来说点什么吧~
                                                                                    </div>
                                                                                )}

                                                                                {/* 回复输入框 */}
                                                                                {currentUser ? (
                                                                                    <div className="flex gap-2 mt-3">
                                                                                        <input
                                                                                            type="text"
                                                                                            value={replyContent}
                                                                                            onChange={(e) => setReplyContent(e.target.value)}
                                                                                            placeholder="写下你的回复..."
                                                                                            className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                                                                                            onKeyDown={(e) => {
                                                                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                                                                    e.preventDefault();
                                                                                                    submitReply(announcement.id);
                                                                                                }
                                                                                            }}
                                                                                        />
                                                                                        <motion.button
                                                                                            onClick={() => submitReply(announcement.id)}
                                                                                            disabled={submitting || !replyContent.trim()}
                                                                                            className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                                                                                            whileHover={{ scale: submitting || !replyContent.trim() ? 1 : 1.02 }}
                                                                                            whileTap={{ scale: submitting || !replyContent.trim() ? 1 : 0.98 }}
                                                                                        >
                                                                                            {submitting ? (
                                                                                                <i className="fa-solid fa-spinner fa-spin"></i>
                                                                                            ) : (
                                                                                                '发送'
                                                                                            )}
                                                                                        </motion.button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="text-center py-3 text-gray-400 text-sm bg-gray-50/50 dark:bg-gray-800/50 rounded-lg mt-3">
                                                                                        <i className="fa-solid fa-lock mr-1"></i>
                                                                                        登录后可发表回复
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
