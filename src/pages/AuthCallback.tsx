import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// 保存 Notion OAuth token 到数据库（如果存在）
async function saveNotionTokenIfExists(session: any) {
    try {
        if (!session?.provider_token || !session?.user?.id) {
            return;
        }

        // 检查是否是 Notion OAuth（通过 identities 判断）
        const isNotionAuth = session.user?.identities?.some(
            (identity: any) => identity.provider === 'notion'
        );

        if (!isNotionAuth) {
            return;
        }

        console.log('🔐 检测到 Notion OAuth token，正在保存到数据库...');
        console.log('📝 provider_refresh_token 存在:', !!session.provider_refresh_token);

        // 尝试获取 Notion workspace 信息（通过 /users/me API）
        let workspaceId = '';
        let workspaceName = '';
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            if (supabaseUrl) {
                const proxyUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/notion-proxy/users/me`;
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${session.provider_token}`,
                        'Content-Type': 'application/json',
                        'Notion-Version': '2022-06-28',
                    },
                });
                if (response.ok) {
                    const data = await response.json();
                    // Notion API 返回的 bot 用户信息包含 workspace
                    if (data.bot?.workspace_name) {
                        workspaceName = data.bot.workspace_name;
                    }
                }
            }
        } catch (error) {
            console.warn('获取 Notion workspace 信息失败（非关键错误）:', error);
        }

        // 计算 token 过期时间（Notion token 通常1小时过期，但我们设置保守的30天检查周期）
        // 如果有 expires_in 信息则使用，否则默认30天
        const expiresAt = session.expires_in
            ? new Date(Date.now() + session.expires_in * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30天

        // 使用 upsert 保存 token（如果已存在则更新）
        // 同时保存 refresh_token 用于后续刷新
        const { error } = await supabase
            .from('user_notion_tokens')
            .upsert({
                user_id: session.user.id,
                access_token: session.provider_token,
                refresh_token: session.provider_refresh_token || null,
                expires_at: expiresAt,
                workspace_id: workspaceId || null,
                workspace_name: workspaceName || null,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id'
            });

        if (error) {
            console.error('❌ 保存 Notion token 失败:', error);
        } else {
            console.log('✅ Notion OAuth token 已保存到数据库');
            if (session.provider_refresh_token) {
                console.log('✅ Refresh token 也已保存，支持自动刷新');
            }
        }
    } catch (error) {
        console.error('保存 Notion token 时出错:', error);
    }
}

export default function AuthCallback() {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // 处理 Supabase OAuth 回调
        const handleAuthCallback = async () => {
            try {
                // 检查 URL hash 中是否有 access_token (默认 implicit flow)
                // 或者 query param 中是否有 code (PKCE flow)

                // Supabase JS 客户端会自动检测 URL params 并建立 session
                // 我们只需要确保它有机会运行，然后重定向回主页

                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    throw error;
                }

                if (session) {
                    // 检查并保存 Notion token（如果存在）
                    await saveNotionTokenIfExists(session);

                    // 登录成功，重定向到主页
                    // 使用 replace 防止用户点后退再次触发认证流程
                    navigate('/', { replace: true });
                } else {
                    // 处理 hash 中可能存在的 token（有时 getSession 可能在 hash 被处理前返回 null）
                    // 实际上 supabase-js在初始化时会监听 URL。
                    // 如果这里没有 session，可能是因为还没有处理完。
                    // 我们可以给一点延迟或者监听 onAuthStateChange

                    // 监听一次状态变化
                    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                        if (event === 'SIGNED_IN' && session) {
                            // 检查并保存 Notion token（如果存在）
                            await saveNotionTokenIfExists(session);
                            navigate('/', { replace: true });
                        }
                    });

                    // 如果 3秒内没有反应，则报错或跳转
                    setTimeout(() => {
                        if (!session) {
                            navigate('/'); // 尝试直接跳回主页看看
                        }
                    }, 3000);

                    return () => {
                        subscription.unsubscribe();
                    };
                }
            } catch (err: any) {
                console.error('Auth callback error:', err);
                setError(err.message || '认证失败');
                setTimeout(() => navigate('/'), 3000);
            }
        };

        handleAuthCallback();
    }, [navigate]);

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-100">
                <div className="text-center p-8 bg-white rounded-lg shadow-md">
                    <div className="text-red-500 text-5xl mb-4">
                        <i className="fas fa-exclamation-circle"></i>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">登录出错了</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <p className="text-sm text-gray-500">正在返回主页...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <h2 className="text-xl font-medium text-gray-700">正在验证登录...</h2>
                <p className="text-gray-500 mt-2">请稍候</p>
            </div>
        </div>
    );
}
