import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";

export interface Notification {
    id: string;
    user_id: string;
    tenant_id: string | null;
    event_type: string;
    type: "system" | "promo" | "info" | "invite" | "warning" | "ownership";
    title: string | null;
    message: string | null;
    data: Record<string, unknown> | null;
    read_at: string | null;
    created_at: string;
}

export async function getNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
        .from("v2_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) {
        console.error("Errore nel recupero notifiche:", error.message);
        return [];
    }

    return (data as Notification[]) ?? [];
}

export async function getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
        .from("v2_notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);

    if (error) {
        console.error("Errore nel conteggio notifiche non lette:", error.message);
        return 0;
    }

    return count ?? 0;
}

export async function markAsRead(notificationId: string): Promise<void> {
    const { error } = await supabase
        .from("v2_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId);

    if (error) throw error;
}

export async function markAllAsRead(userId: string): Promise<void> {
    const { error } = await supabase
        .from("v2_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);

    if (error) throw error;
}

export async function deleteNotification(notificationId: string): Promise<void> {
    const { error } = await supabase
        .from("v2_notifications")
        .delete()
        .eq("id", notificationId);

    if (error) throw error;
}

export function subscribeToNotifications(
    userId: string,
    onNew: (notification: Notification) => void
): RealtimeChannel {
    return supabase
        .channel(`notifications:${userId}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "v2_notifications",
                filter: `user_id=eq.${userId}`,
            },
            (payload) => onNew(payload.new as Notification)
        )
        .subscribe();
}

export function unsubscribeFromNotifications(channel: RealtimeChannel): void {
    supabase.removeChannel(channel);
}
