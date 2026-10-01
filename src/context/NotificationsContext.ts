import { createContext } from "react";
import type { Notification } from "@/services/supabase/notifications";

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
