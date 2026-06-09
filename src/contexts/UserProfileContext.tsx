import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { getUserProfile, saveUserProfile, updateUserProfile, UserProfile } from '@/lib/supabaseSync';
import { useStorage } from '@/lib/storageManager';

interface UserProfileContextType {
  userProfile: UserProfile | null;
  displayName: string;
  avatarUrl?: string;
  updateDisplayName: (name: string) => Promise<boolean>;
  updateAvatar: (url: string) => Promise<boolean>;
  loading: boolean;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

// 缓存键名
const USER_PROFILE_CACHE_KEY = 'user_profile_cache';

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (context === undefined) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
}

interface UserProfileProviderProps {
  children: ReactNode;
}

export function UserProfileProvider({ children }: UserProfileProviderProps) {
  const { currentUser, loading: authLoading } = useAuth();
  const { getItem, setItem, removeItem } = useStorage();

  // 初始化状态时尝试从缓存读取
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const cached = getItem<UserProfile>(USER_PROFILE_CACHE_KEY);
    return cached || null;
  });

  const [loading, setLoading] = useState(false);

  // 获取显示名称（优先使用 profile 中的名称，否则显示“用户”）
  const displayName = userProfile?.displayName || '用户';
  const avatarUrl = userProfile?.avatarUrl;

  // 更新本地状态和缓存
  const updateUserProfileState = useCallback((profile: UserProfile | null) => {
    setUserProfile(profile);
    if (profile) {
      setItem(USER_PROFILE_CACHE_KEY, profile);
    } else {
      removeItem(USER_PROFILE_CACHE_KEY);
    }
  }, [setItem, removeItem]);

  // 更新显示名称
  const updateDisplayName = useCallback(async (name: string): Promise<boolean> => {
    if (!currentUser || !currentUser.email_confirmed_at) return false;

    setLoading(true);
    try {
      const success = await saveUserProfile(currentUser, name);
      if (success) {
        // 立即更新本地状态和缓存
        const updatedProfile = userProfile
          ? {
            ...userProfile,
            displayName: name,
            updatedAt: new Date().toISOString(),
          }
          : null;

        if (updatedProfile) {
          updateUserProfileState(updatedProfile);
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error('更新用户名失败:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentUser, userProfile, updateUserProfileState]);

  // 更新头像
  const updateAvatar = useCallback(async (url: string): Promise<boolean> => {
    if (!currentUser || !currentUser.email_confirmed_at) return false;

    setLoading(true);
    try {
      const success = await updateUserProfile(currentUser, { avatarUrl: url });
      if (success) {
        // 立即更新本地状态和缓存
        const updatedProfile = userProfile
          ? {
            ...userProfile,
            avatarUrl: url,
            updatedAt: new Date().toISOString(),
          }
          : null;

        if (updatedProfile) {
          updateUserProfileState(updatedProfile);
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error('更新头像失败:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentUser, userProfile, updateUserProfileState]);

  // 当用户登录状态变化时，加载用户资料
  useEffect(() => {
    const loadUserProfile = async () => {
      // 只有当 currentUser 存在且邮箱已验证时才加载资料
      if (currentUser && currentUser.email_confirmed_at) {
        // 即便有缓存，也静默刷新数据
        if (!userProfile) {
          setLoading(true);
        }

        try {
          const profile = await getUserProfile(currentUser);
          if (profile) {
            updateUserProfileState(profile);
          } else {
            // 云端没有数据，可能是新注册用户
            // 只有当本地也没有 userProfile 时才创建默认资料
            if (!userProfile) {
              const defaultName = currentUser.email?.split('@')[0] || '用户';
              await saveUserProfile(currentUser, defaultName);
              const newProfile = await getUserProfile(currentUser);
              if (newProfile) {
                updateUserProfileState(newProfile);
              }
            }
          }
        } catch (error) {
          console.error('加载用户资料失败:', error);
        } finally {
          setLoading(false);
        }
      } else {
        // 仅当确定用户已登出（authLoading 为 false 且 currentUser 为 null）时才清除缓存
        // 这样可以防止在 initial session loading 期间清除缓存
        if (!authLoading && !currentUser) {
          updateUserProfileState(null);
        }
      }
    };

    loadUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, authLoading]);

  const value: UserProfileContextType = useMemo(() => ({
    userProfile,
    displayName,
    avatarUrl,
    updateDisplayName,
    updateAvatar,
    loading,
  }), [userProfile, displayName, avatarUrl, updateDisplayName, updateAvatar, loading]);

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}
