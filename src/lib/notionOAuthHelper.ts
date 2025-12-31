import { supabase } from '@/lib/supabase';

/**
 * Token 数据结构
 */
interface NotionTokenData {
    access_token: string;
    refresh_token?: string | null;
    expires_at?: string | null;
}

/**
 * 从 Supabase session 或数据库中获取 Notion OAuth access token
 * 优先从 session.provider_token 获取（OAuth 回调后立即可用），
 * 如果 session 中没有，则从 user_notion_tokens 表获取（持久化的 token）
 * @returns Notion OAuth token 或 null
 */
export async function getNotionOAuthToken(): Promise<string | null> {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('获取 session 失败:', error);
            return null;
        }

        if (!session) {
            console.warn('用户未登录');
            return null;
        }

        // 检查是否有 Notion 身份绑定
        const isNotionAuth = session.user?.identities?.some(
            (identity) => identity.provider === 'notion'
        );

        if (!isNotionAuth) {
            console.warn('用户未绑定 Notion 账号');
            return null;
        }

        // 方式1: 优先从 session.provider_token 获取（OAuth 回调后立即可用）
        if (session.provider_token) {
            console.log('✅ 从 session 获取 Notion OAuth token');
            return session.provider_token;
        }

        // 方式2: 从数据库获取持久化的 token
        console.log('🔍 session 中无 provider_token，尝试从数据库获取...');
        const tokenData = await getTokenFromDatabase(session.user.id);

        if (tokenData?.access_token) {
            console.log('✅ 从数据库获取 Notion OAuth token');
            return tokenData.access_token;
        }

        console.warn('未找到 Notion OAuth token，可能需要重新授权');
        return null;
    } catch (error) {
        console.error('获取 Notion OAuth token 失败:', error);
        return null;
    }
}

/**
 * 从数据库获取 token 数据
 */
async function getTokenFromDatabase(userId: string): Promise<NotionTokenData | null> {
    try {
        const { data: tokenData, error: dbError } = await supabase
            .from('user_notion_tokens')
            .select('access_token, refresh_token, expires_at')
            .eq('user_id', userId)
            .single();

        if (dbError) {
            if (dbError.code === 'PGRST116') {
                // 记录不存在
                console.warn('数据库中未找到 Notion token 记录');
            } else {
                console.error('从数据库获取 Notion token 失败:', dbError);
            }
            return null;
        }

        return tokenData;
    } catch (error) {
        console.error('查询数据库时出错:', error);
        return null;
    }
}

/**
 * 检查用户是否已绑定 Notion 并且有可用的 token
 * @returns 是否有 Notion 认证
 */
export async function hasNotionAuth(): Promise<boolean> {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            console.log('❌ hasNotionAuth: 用户未登录');
            return false;
        }

        // 检查是否有 Notion 身份绑定
        const isNotionAuth = session.user?.identities?.some(
            (identity) => identity.provider === 'notion'
        );

        if (!isNotionAuth) {
            console.log('❌ hasNotionAuth: identities 中没有 notion');
            return false;
        }

        // 方式1: session 中有 provider_token
        if (session.provider_token) {
            console.log('✅ hasNotionAuth: session 中有 provider_token');
            return true;
        }

        // 方式2: 数据库中有持久化的 token
        console.log('🔍 hasNotionAuth: session 中无 provider_token，检查数据库...');
        const tokenData = await getTokenFromDatabase(session.user.id);

        if (!tokenData?.access_token) {
            console.log('❌ hasNotionAuth: 数据库中也没有 token');
            return false;
        }

        console.log('✅ hasNotionAuth: 数据库中有 token');
        return true;
    } catch (error) {
        console.error('检查 Notion 认证状态失败:', error);
        return false;
    }
}

/**
 * 获取 Notion OAuth token 的详细信息（用于调试）
 * @returns Token 信息对象
 */
export async function getNotionOAuthInfo(): Promise<{
    hasToken: boolean;
    isNotionAuth: boolean;
    userId?: string;
    email?: string;
} | null> {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return {
                hasToken: false,
                isNotionAuth: false,
            };
        }

        const isNotionAuth = session.user?.identities?.some(
            (identity) => identity.provider === 'notion'
        );

        return {
            hasToken: !!session.provider_token,
            isNotionAuth: !!isNotionAuth,
            userId: session.user?.id,
            email: session.user?.email,
        };
    } catch (error) {
        console.error('获取 Notion OAuth 信息失败:', error);
        return null;
    }
}

/**
 * 测试 Notion OAuth token 是否有效
 * 通过调用 Notion API 的 /users/me 端点验证
 * @returns Token 是否有效
 */
export async function validateNotionOAuthToken(): Promise<boolean> {
    try {
        const token = await getNotionOAuthToken();

        if (!token) {
            return false;
        }

        // 使用 Supabase Edge Function 代理测试连接
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) {
            console.error('未配置 VITE_SUPABASE_URL');
            return false;
        }

        const proxyUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/notion-proxy/users/me`;

        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
            },
        });

        if (response.ok) {
            console.log('✅ Notion OAuth token 验证成功');
            return true;
        } else {
            console.error('❌ Notion OAuth token 验证失败:', response.status, response.statusText);
            return false;
        }
    } catch (error) {
        console.error('验证 Notion OAuth token 时出错:', error);
        return false;
    }
}
