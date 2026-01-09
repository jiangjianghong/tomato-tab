import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { logAdminAction } from '@/lib/adminUtils';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'info' | 'warning' | 'update' | 'maintenance';
    is_active: boolean;
    created_at: string;
    expires_at: string | null;
}

interface AnnouncementReply {
    id: string;
    announcement_id: string;
    user_id: string;
    content: string;
    created_at: string;
    user_email?: string;
}

const TYPE_OPTIONS = [
    { value: 'info', label: '📢 通知', bgClass: 'bg-blue-500/20', textClass: 'text-blue-400' },
    { value: 'update', label: '🆕 更新', bgClass: 'bg-green-500/20', textClass: 'text-green-400' },
    { value: 'warning', label: '⚠️ 警告', bgClass: 'bg-yellow-500/20', textClass: 'text-yellow-400' },
    { value: 'maintenance', label: '🔧 维护', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
];

export default function AdminAnnouncements() {
    const { currentUser } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        type: 'info' as Announcement['type'],
        expires_at: '',
    });

    // 回复相关状态
    const [expandedReplyId, setExpandedReplyId] = useState<string | null>(null);
    const [replies, setReplies] = useState<Record<string, AnnouncementReply[]>>({});
    const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
    const [loadingReplies, setLoadingReplies] = useState<string | null>(null);

    useEffect(() => {
        loadAnnouncements();
    }, []);

    const loadAnnouncements = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('announcements')
                .select('*')
                .order('created_at', { ascending: false });

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
        } catch (err: any) {
            console.error('Failed to load announcements:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadReplies = async (announcementId: string) => {
        if (replies[announcementId]) return;

        setLoadingReplies(announcementId);
        try {
            const { data, error } = await supabase
                .from('announcement_replies')
                .select(`
                    id,
                    announcement_id,
                    user_id,
                    content,
                    created_at,
                    user_profiles:user_id (email)
                `)
                .eq('announcement_id', announcementId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const formattedReplies = (data || []).map(reply => ({
                ...reply,
                user_email: (reply.user_profiles as any)?.email || '未知用户'
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

    const deleteReply = async (replyId: string, announcementId: string) => {
        if (!confirm('确定要删除这条回复吗？')) return;

        try {
            const { error } = await supabase
                .from('announcement_replies')
                .delete()
                .eq('id', replyId);

            if (error) throw error;

            // 记录日志
            await logAdminAction('delete_reply', replyId, 'announcement_reply', {
                announcement_id: announcementId
            });

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
        } catch (err: any) {
            console.error('Failed to delete reply:', err);
            setError(err.message);
        }
    };

    const toggleReplies = async (announcementId: string) => {
        if (expandedReplyId === announcementId) {
            setExpandedReplyId(null);
        } else {
            setExpandedReplyId(announcementId);
            await loadReplies(announcementId);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const payload = {
                title: formData.title,
                content: formData.content,
                type: formData.type,
                expires_at: formData.expires_at || null,
                created_by: currentUser?.id,
                is_active: true,
            };

            if (editingId) {
                const { error } = await supabase
                    .from('announcements')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
                // 记录日志
                await logAdminAction('update_announcement', editingId, 'announcement', { title: formData.title });
            } else {
                const { data, error } = await supabase
                    .from('announcements')
                    .insert(payload)
                    .select('id')
                    .single();
                if (error) throw error;
                // 记录日志
                if (data) {
                    await logAdminAction('create_announcement', data.id, 'announcement', { title: formData.title });
                }
            }

            setShowEditor(false);
            setEditingId(null);
            setFormData({ title: '', content: '', type: 'info', expires_at: '' });
            await loadAnnouncements();
        } catch (err: any) {
            console.error('Failed to save announcement:', err);
            setError(err.message);
        }
    };

    const handleEdit = (announcement: Announcement) => {
        setFormData({
            title: announcement.title,
            content: announcement.content,
            type: announcement.type,
            expires_at: announcement.expires_at?.split('T')[0] || '',
        });
        setEditingId(announcement.id);
        setShowEditor(true);
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            const { error } = await supabase
                .from('announcements')
                .update({ is_active: !currentActive })
                .eq('id', id);
            if (error) throw error;
            // 记录日志
            await logAdminAction('toggle_announcement', id, 'announcement', { is_active: !currentActive });
            await loadAnnouncements();
        } catch (err: any) {
            console.error('Failed to toggle announcement:', err);
            setError(err.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除这条公告吗？')) return;

        try {
            const { error } = await supabase
                .from('announcements')
                .delete()
                .eq('id', id);
            if (error) throw error;
            // 记录日志
            await logAdminAction('delete_announcement', id, 'announcement', {});
            await loadAnnouncements();
        } catch (err: any) {
            console.error('Failed to delete announcement:', err);
            setError(err.message);
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
        if (days < 7) return `${days}天前`;
        return date.toLocaleDateString('zh-CN');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">📝 内容管理</h2>
                <button
                    onClick={() => {
                        setShowEditor(true);
                        setEditingId(null);
                        setFormData({ title: '', content: '', type: 'info', expires_at: '' });
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                >
                    + 发布公告
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
                    {error}
                </div>
            )}

            {/* Editor Modal */}
            {showEditor && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg border border-white/10">
                        <h3 className="text-xl font-semibold text-white mb-4">
                            {editingId ? '编辑公告' : '发布新公告'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-white/60 text-sm mb-1">标题</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30"
                                />
                            </div>
                            <div>
                                <label className="block text-white/60 text-sm mb-1">内容</label>
                                <textarea
                                    value={formData.content}
                                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                    required
                                    rows={4}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30 resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-white/60 text-sm mb-1">类型</label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as Announcement['type'] })}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30"
                                    >
                                        {TYPE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-white/60 text-sm mb-1">过期时间（可选）</label>
                                    <input
                                        type="date"
                                        value={formData.expires_at}
                                        onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowEditor(false)}
                                    className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                >
                                    {editingId ? '保存' : '发布'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Announcements List */}
            <div className="space-y-4">
                {announcements.map((announcement) => {
                    const typeConfig = TYPE_OPTIONS.find((t) => t.value === announcement.type);
                    const isRepliesExpanded = expandedReplyId === announcement.id;
                    const announcementReplies = replies[announcement.id] || [];
                    const replyCount = replyCounts[announcement.id] || 0;

                    return (
                        <div
                            key={announcement.id}
                            className={`bg-white/5 rounded-xl p-5 border ${announcement.is_active ? 'border-white/10' : 'border-white/5 opacity-60'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2 py-0.5 rounded text-xs ${typeConfig?.bgClass || 'bg-gray-500/20'} ${typeConfig?.textClass || 'text-gray-400'}`}>
                                            {typeConfig?.label || announcement.type}
                                        </span>
                                        {!announcement.is_active && (
                                            <span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">
                                                已隐藏
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-lg font-semibold text-white mb-1">{announcement.title}</h3>
                                    <p className="text-white/60 text-sm mb-2 whitespace-pre-wrap">{announcement.content}</p>
                                    <div className="flex items-center gap-4 text-white/40 text-xs">
                                        <span>创建于 {new Date(announcement.created_at).toLocaleString('zh-CN')}</span>
                                        {announcement.expires_at && (
                                            <span>过期于 {new Date(announcement.expires_at).toLocaleDateString('zh-CN')}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleReplies(announcement.id)}
                                        className="px-3 py-1 rounded text-xs bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors"
                                    >
                                        回复({replyCount})
                                    </button>
                                    <button
                                        onClick={() => handleToggleActive(announcement.id, announcement.is_active)}
                                        className={`px-3 py-1 rounded text-xs transition-colors ${announcement.is_active
                                            ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                                            : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                                            }`}
                                    >
                                        {announcement.is_active ? '隐藏' : '显示'}
                                    </button>
                                    <button
                                        onClick={() => handleEdit(announcement)}
                                        className="px-3 py-1 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                                    >
                                        编辑
                                    </button>
                                    <button
                                        onClick={() => handleDelete(announcement.id)}
                                        className="px-3 py-1 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                                    >
                                        删除
                                    </button>
                                </div>
                            </div>

                            {/* 回复管理区域 */}
                            {isRepliesExpanded && (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <h4 className="text-white/80 text-sm font-medium mb-3">回复管理</h4>

                                    {loadingReplies === announcement.id && (
                                        <div className="text-center py-4 text-white/40 text-sm">
                                            <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                                            加载中...
                                        </div>
                                    )}

                                    {!loadingReplies && announcementReplies.length === 0 && (
                                        <div className="text-center py-4 text-white/40 text-sm">
                                            暂无回复
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {announcementReplies.map((reply) => (
                                            <div
                                                key={reply.id}
                                                className="bg-white/5 rounded-lg p-3 flex items-start justify-between gap-3"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-white/70 text-sm font-medium">
                                                            {reply.user_email}
                                                        </span>
                                                        <span className="text-white/40 text-xs">
                                                            {formatDate(reply.created_at)}
                                                        </span>
                                                    </div>
                                                    <p className="text-white/60 text-sm whitespace-pre-wrap">
                                                        {reply.content}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => deleteReply(reply.id, announcement.id)}
                                                    className="px-2 py-1 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors shrink-0"
                                                >
                                                    删除
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {announcements.length === 0 && (
                    <div className="text-center py-12 text-white/40">
                        暂无公告，点击"发布公告"创建第一条
                    </div>
                )}
            </div>
        </div>
    );
}
