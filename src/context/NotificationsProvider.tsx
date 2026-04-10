import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "./useAuth";
import type { Notification } from "@/services/supabase/notifications";
import {
    deleteNotification as svcDelete,
    getNotifications,
    getUnreadCount,
    markAllAsRead as svcMarkAllAsRead,
    markAsRead as svcMarkAsRead,
    subscribeToNotifications,
    unsubscribeFromNotifications,
} from "@/services/supabase/notifications";

export interface NotificationsContextType {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    markAsRead: (notificationId: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (notificationId: string) => Promise<void>;
    refetch: () => Promise<void>;
}

export const NotificationsContext = createContext<NotificationsContextType | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);

    const channelRef = useRef<RealtimeChannel | null>(null);

    // Silent refetch — does not touch loading state. Used to re-align after
    // optimistic update failures.
    const refetch = useCallback(async () => {
        if (!user?.id) return;
        const [notifs, count] = await Promise.all([
            getNotifications(user.id),
            getUnreadCount(user.id),
        ]);
        setNotifications(notifs);
        setUnreadCount(count);
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) {
            // User logged out — reset state and drop subscription
            setNotifications([]);
            setUnreadCount(0);
            setLoading(false);
            if (channelRef.current) {
                unsubscribeFromNotifications(channelRef.current);
                channelRef.current = null;
            }
            return;
        }

        let cancelled = false;

        const init = async () => {
            setLoading(true);
            const [notifs, count] = await Promise.all([
                getNotifications(user.id),
                getUnreadCount(user.id),
            ]);
            if (cancelled) return;
            setNotifications(notifs);
            setUnreadCount(count);
            setLoading(false);
        };

        void init();

        const channel = subscribeToNotifications(user.id, (notification) => {
            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);
        });
        channelRef.current = channel;

        return () => {
            cancelled = true;
            if (channelRef.current) {
                unsubscribeFromNotifications(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [user?.id]);

    const markAsRead = useCallback(async (notificationId: string) => {
        const readAt = new Date().toISOString();
        // Optimistic update: check if unread before updating, decrement count inside
        // the setNotifications updater to avoid stale closure on unreadCount.
        setNotifications(prev => {
            const target = prev.find(n => n.id === notificationId);
            if (target?.read_at === null) {
                setUnreadCount(c => Math.max(0, c - 1));
            }
            return prev.map(n =>
                n.id === notificationId && n.read_at === null ? { ...n, read_at: readAt } : n
            );
        });
        try {
            await svcMarkAsRead(notificationId);
        } catch {
            await refetch();
        }
    }, [refetch]);

    const markAllAsRead = useCallback(async () => {
        const readAt = new Date().toISOString();
        setNotifications(prev => prev.map(n => n.read_at === null ? { ...n, read_at: readAt } : n));
        setUnreadCount(0);
        try {
            if (!user?.id) return;
            await svcMarkAllAsRead(user.id);
        } catch {
            await refetch();
        }
    }, [user?.id, refetch]);

    const deleteNotification = useCallback(async (notificationId: string) => {
        setNotifications(prev => {
            const target = prev.find(n => n.id === notificationId);
            if (target?.read_at === null) {
                setUnreadCount(c => Math.max(0, c - 1));
            }
            return prev.filter(n => n.id !== notificationId);
        });
        try {
            await svcDelete(notificationId);
        } catch {
            await refetch();
        }
    }, [refetch]);

    return (
        <NotificationsContext.Provider
            value={{
                notifications,
                unreadCount,
                loading,
                markAsRead,
                markAllAsRead,
                deleteNotification,
                refetch,
            }}
        >
            {children}
        </NotificationsContext.Provider>
    );
}
