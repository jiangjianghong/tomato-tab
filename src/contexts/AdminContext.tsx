import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useAuth } from './SupabaseAuthContext';
import { supabase } from '@/lib/supabase';

type Role = 'user' | 'admin' | 'super_admin';

interface AdminContextType {
    isAdmin: boolean;
    isSuperAdmin: boolean;
    adminLoading: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function useAdmin() {
    const context = useContext(AdminContext);
    if (context === undefined) {
        throw new Error('useAdmin must be used within an AdminProvider');
    }
    return context;
}

interface AdminProviderProps {
    children: ReactNode;
}

export function AdminProvider({ children }: AdminProviderProps) {
    const { currentUser, loading: authLoading } = useAuth();
    const [role, setRole] = useState<Role | null>(null);
    const [adminLoading, setAdminLoading] = useState(true);

    useEffect(() => {
        // 等 auth 完成
        if (authLoading) return;

        // 未登录：直接清空角色
        if (!currentUser?.id) {
            setRole(null);
            setAdminLoading(false);
            return;
        }

        let cancelled = false;
        setAdminLoading(true);

        (async () => {
            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('role')
                    .eq('id', currentUser.id)
                    .maybeSingle();

                if (cancelled) return;

                if (error) {
                    console.warn('Failed to load user role:', error.message);
                    setRole(null);
                } else {
                    setRole((data?.role as Role) ?? 'user');
                }
            } catch (err) {
                if (!cancelled) {
                    console.warn('Failed to load user role:', err);
                    setRole(null);
                }
            } finally {
                if (!cancelled) setAdminLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentUser?.id, authLoading]);

    const isAdmin = useMemo(() => role === 'admin' || role === 'super_admin', [role]);
    const isSuperAdmin = useMemo(() => role === 'super_admin', [role]);

    const value = useMemo<AdminContextType>(() => ({
        isAdmin,
        isSuperAdmin,
        adminLoading,
    }), [isAdmin, isSuperAdmin, adminLoading]);

    return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
