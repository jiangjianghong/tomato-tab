import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  currentUser: User | null;
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  loginWithNotion: () => Promise<void>;
  linkWithGoogle: () => Promise<void>;
  linkWithGithub: () => Promise<void>;
  linkWithNotion: () => Promise<void>;
  unlinkIdentity: (provider: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  logout: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateEmail: (newEmail: string) => Promise<void>; // 修改主邮箱
  resetPasswordForEmail: (email: string) => Promise<void>;
  getPrimaryEmail: () => string | null; // 获取主邮箱（优先 email provider）
  loading: boolean;
  isNetworkOnline: boolean;
  isSupabaseConnected: boolean;
  error: string | null;
  successMessage: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

// 错误消息本地化
const getLocalizedErrorMessage = (error: any): string => {
  const message = error?.message || error?.toString() || '未知错误';

  const errorMappings: { [key: string]: string } = {
    'Invalid login credentials': '邮箱或密码错误',
    'Email not confirmed': '请先验证邮箱',
    'User already registered': '该邮箱已注册',
    'Password should be at least 6 characters': '密码至少需要6位字符',
    'Invalid email': '邮箱格式不正确',
    'Network error': '网络连接错误',
    'Too many requests': '请求过于频繁，请稍后再试',
    'Email already in use': '该邮箱已被使用',
    'Weak password': '密码强度不够',
    'Invalid password': '密码不正确',
    // 身份绑定冲突
    'Identity is already linked': '该账号已绑定到其他用户，请先登录该账号并注销后再绑定',
    'identity is already linked to another user': '该账号已绑定到其他用户，请先登录该账号并注销后再绑定',
    'User with this identity already exists': '该账号已绑定到其他用户，请先登录该账号并注销后再绑定',
  };

  // 检查是否有匹配的错误消息
  for (const [key, value] of Object.entries(errorMappings)) {
    if (message.includes(key)) {
      return value;
    }
  }

  return message;
};

// 网络状态监听
const isOnline = () => navigator.onLine;

const createNetworkStatusListener = (callback: (online: boolean) => void) => {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNetworkOnline, setIsNetworkOnline] = useState(() => isOnline());
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 清除错误
  const clearError = () => setError(null);

  // 邮箱密码登录
  const login = async (email: string, password: string) => {
    try {
      clearError();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // 邮箱密码注册
  const register = async (email: string, password: string) => {
    try {
      clearError();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            // 用户元数据，会传递到邮件模板
            app_name: '西红柿标签页',
            welcome_message: '你好呀！欢迎使用西红柿标签页，点击下面的链接确认注册哦。祝您使用愉快！',
            site_url: window.location.origin,
          },
        },
      });

      if (error) throw error;
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // 发送验证邮件
  const sendVerificationEmail = async () => {
    try {
      clearError();
      if (currentUser && !currentUser.email_confirmed_at) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: currentUser.email!,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;
      }
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // 重新加载用户信息
  const reloadUser = async () => {
    try {
      clearError();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) throw error;

      setCurrentUser(user);
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // Google 登录
  const loginWithGoogle = async () => {
    try {
      clearError();
      const redirectTo = import.meta.env.VITE_SITE_URL
        ? `${import.meta.env.VITE_SITE_URL}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // GitHub 登录
  const loginWithGithub = async () => {
    try {
      clearError();
      const redirectTo = import.meta.env.VITE_SITE_URL
        ? `${import.meta.env.VITE_SITE_URL}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // Notion 登录
  const loginWithNotion = async () => {
    try {
      clearError();
      const redirectTo = import.meta.env.VITE_SITE_URL
        ? `${import.meta.env.VITE_SITE_URL}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'notion',
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // 绑定 Google 账号
  const linkWithGoogle = async () => {
    try {
      clearError();
      if (!currentUser) throw new Error('请先登录');

      console.log('Linking with Google...');
      const redirectTo = import.meta.env.VITE_SITE_URL
        ? `${import.meta.env.VITE_SITE_URL}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo,
        }
      });
      console.log('Link identity result:', { data, error });

      if (error) throw error;
      // 链接账号通常需要跳转去Google授权
      if (data?.url) {
        console.log('Redirecting to:', data.url);
        window.location.href = data.url;
      } else {
        console.warn('No redirection URL returned from linkIdentity');
        throw new Error('未收到 Google 授权链接，请稍后重试');
      }
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  }

  // 绑定 GitHub 账号
  const linkWithGithub = async () => {
    try {
      clearError();
      if (!currentUser) throw new Error('请先登录');

      console.log('Linking with GitHub...');
      const redirectTo = import.meta.env.VITE_SITE_URL
        ? `${import.meta.env.VITE_SITE_URL}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: {
          redirectTo,
        }
      });
      console.log('Link identity result:', { data, error });

      if (error) throw error;

      if (data?.url) {
        console.log('Redirecting to:', data.url);
        window.location.href = data.url;
      } else {
        console.warn('No redirection URL returned from linkIdentity');
        throw new Error('未收到 GitHub 授权链接，请稍后重试');
      }
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  }

  // 绑定 Notion 账号
  const linkWithNotion = async () => {
    try {
      clearError();
      if (!currentUser) throw new Error('请先登录');

      console.log('Linking with Notion...');
      const redirectTo = import.meta.env.VITE_SITE_URL
        ? `${import.meta.env.VITE_SITE_URL}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'notion',
        options: {
          redirectTo,
        }
      });
      console.log('Link identity result:', { data, error });

      if (error) throw error;

      if (data?.url) {
        console.log('Redirecting to:', data.url);
        window.location.href = data.url;
      } else {
        console.warn('No redirection URL returned from linkIdentity');
        throw new Error('未收到 Notion 授权链接，请稍后重试');
      }
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  }

  // 解绑账号
  const unlinkIdentity = async (provider: string) => {
    try {
      clearError();
      if (!currentUser) throw new Error('请先登录');

      // 获取该用户的 identities
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const identity = user?.identities?.find(id => id.provider === provider);
      if (!identity) {
        throw new Error(`未找到绑定了 ${provider} 的账号`);
      }

      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;

      setSuccessMessage(`✅ 已成功解绑 ${provider} 账号`);
      await reloadUser(); // 刷新用户信息

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  }

  // 删除账号
  const deleteAccount = async () => {
    try {
      clearError();
      if (!currentUser) throw new Error('请先登录');

      const { error } = await supabase.functions.invoke('delete-user');

      if (error) throw error;

      // 删除成功后登出
      await logout();

      setSuccessMessage('账号已注销');
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // 登出
  const logout = async () => {
    clearError();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('登出失败:', error);
      }
    } catch (error) {
      console.error('登出过程发生错误:', error);
    } finally {
      // 无论成功与否，都清除本地状态
      setSession(null);
      setCurrentUser(null);
    }
  };

  // 更新密码（已登录用户）
  const updatePassword = async (newPassword: string) => {
    try {
      clearError();

      if (!currentUser) {
        throw new Error('请先登录');
      }

      if (!newPassword || newPassword.length < 6) {
        throw new Error('新密码至少需要6位字符');
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;


      setSuccessMessage('✅ 密码已更新成功！');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // 发送密码重置邮件（忘记密码）
  const resetPasswordForEmail = async (email: string) => {
    try {
      clearError();

      if (!email) {
        throw new Error('请输入邮箱地址');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      if (error) throw error;

      setSuccessMessage('✅ 密码重置邮件已发送，请检查您的邮箱');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  // 更改主邮箱
  const updateEmail = async (newEmail: string) => {
    try {
      clearError();

      if (!currentUser) {
        throw new Error('请先登录');
      }

      if (!newEmail || !newEmail.includes('@')) {
        throw new Error('请输入有效的邮箱地址');
      }

      // 检查是否和当前邮箱相同
      if (newEmail.toLowerCase() === currentUser.email?.toLowerCase()) {
        throw new Error('新邮箱与当前邮箱相同');
      }

      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) throw error;

      setSuccessMessage('✅ 验证邮件已发送到新邮箱，请点击邮件中的链接确认更改');
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (err: any) {
      const message = getLocalizedErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  };

  useEffect(() => {
    // 获取初始会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCurrentUser(session?.user ?? null);
      setLoading(false);
    });

    // 监听认证状态变化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      // 更新用户状态
      const newUser = session?.user ?? null;

      // 总是更新状态，确保数据一致性
      setSession(session);
      setCurrentUser(newUser);

      setLoading(false);

      // 处理认证事件
      switch (event) {
        case 'SIGNED_IN':
          setError(null);
          // 发送自定义事件，通知其他组件用户已登录
          if (newUser && newUser.email_confirmed_at) {
            window.dispatchEvent(
              new CustomEvent('userSignedIn', {
                detail: { user: newUser },
              })
            );
          }
          break;
        case 'SIGNED_OUT':
          setError(null);
          break;
        case 'TOKEN_REFRESHED':
          // Token 刷新不需要重新加载数据
          break;
        case 'USER_UPDATED':
          break;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 检测邮箱确认成功
  useEffect(() => {
    const checkEmailConfirmation = () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.substring(1));

      if (params.get('type') === 'signup' && params.get('access_token')) {
        // 邮箱确认成功
        // 清除URL中的hash参数
        window.history.replaceState({}, document.title, window.location.pathname);
        // 显示成功消息
        setTimeout(() => {
          setSuccessMessage('🎉 邮箱确认成功！欢迎使用西红柿标签页！');
          // 3秒后清除消息
          setTimeout(() => setSuccessMessage(null), 3000);
        }, 1000);
      }
    };

    checkEmailConfirmation();
  }, []);

  // Supabase连接状态监听（事件驱动：启动时检测一次，之后仅在断连时低频重试，
  // 网络恢复/页面重新可见时再探测，避免常驻标签页 24 小时不间断轮询）
  useEffect(() => {
    let disposed = false;
    let retryInterval: ReturnType<typeof setInterval> | null = null;

    const stopRetry = () => {
      if (retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
      }
    };

    const checkConnection = async () => {
      if (disposed || document.hidden) return;
      try {
        const { error } = await supabase.from('user_profiles').select('id').limit(1);
        if (disposed) return;
        const connected = !error;
        setIsSupabaseConnected(connected);

        if (error && error.message?.includes('网络')) {
          setError('Supabase服务暂时不可用，部分功能可能受限');
        } else if (connected) {
          setError((prev) => (prev?.includes('Supabase') ? null : prev));
        }

        if (connected) {
          stopRetry();
        } else if (!retryInterval) {
          retryInterval = setInterval(checkConnection, 30000);
        }
      } catch {
        if (disposed) return;
        setIsSupabaseConnected(false);
        setError('Supabase服务暂时不可用，部分功能可能受限');
        if (!retryInterval) {
          retryInterval = setInterval(checkConnection, 30000);
        }
      }
    };

    const handleOnline = () => checkConnection();
    const handleVisibility = () => {
      // 页面重新可见且处于断连重试状态时立即探测一次
      if (!document.hidden && retryInterval) {
        checkConnection();
      }
    };

    checkConnection();
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      stopRetry();
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // 网络状态监听
  useEffect(() => {
    const cleanup = createNetworkStatusListener((online) => {
      setIsNetworkOnline(online);
      if (!online) {
        setError('网络连接已断开');
      } else {
        // 网络恢复时清除网络相关错误
        setError((prev) => {
          if (prev?.includes('网络')) {
            return null;
          }
          return prev;
        });
      }
    });

    return cleanup;
  }, []);

  // 获取主邮箱（优先使用 email provider，确保绑定 OAuth 后显示不变）
  const getPrimaryEmail = (): string | null => {
    if (!currentUser) return null;

    // 优先查找 email provider 的身份（邮箱密码注册）
    const emailIdentity = currentUser.identities?.find(
      (identity) => identity.provider === 'email'
    );
    if (emailIdentity?.identity_data?.email) {
      return emailIdentity.identity_data.email as string;
    }

    // 如果没有 email provider，按创建时间排序，使用最早的身份邮箱
    const sortedIdentities = [...(currentUser.identities || [])].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
    if (sortedIdentities.length > 0 && sortedIdentities[0].identity_data?.email) {
      return sortedIdentities[0].identity_data.email as string;
    }

    // 最后使用 currentUser.email
    return currentUser.email || null;
  };

  const value: AuthContextType = {
    currentUser,
    session,
    login,
    register,
    loginWithGoogle,
    loginWithGithub,
    loginWithNotion,
    linkWithGoogle,
    linkWithGithub,
    linkWithNotion,
    unlinkIdentity,
    deleteAccount,
    logout,
    sendVerificationEmail,
    reloadUser,
    updatePassword,
    updateEmail,
    resetPasswordForEmail,
    getPrimaryEmail,
    loading,
    isNetworkOnline,
    isSupabaseConnected,
    error,
    successMessage,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
