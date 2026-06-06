import { useMemo } from "react";
import { Bell, BellOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Menu } from "@/components/ui/Menu";
import { useNotifications } from "@/context/useNotifications";
import type { Notification } from "@/services/supabase/notifications";
import { formatRelativeTime } from "@/utils/relativeTime";
import styles from "./AppHeader.module.scss";

type HeaderNotificationsProps =
    | { scope: "tenant"; tenantId: string | null }
    | { scope: "account" };

// Best-effort deep link from notification → page.
// Today: reservation.new → admin Reservations inbox for the tenant.
// (Single-reservation deep link is out of scope: the inbox surfaces the new row.)
function resolveTargetPath(notification: Notification, fallbackTenantId: string | null): string | null {
    if (notification.event_type === "reservation.new") {
        const tenantId =
            notification.tenant_id ?? fallbackTenantId;
        if (tenantId) return `/business/${tenantId}/reservations`;
    }
    return null;
}

export function HeaderNotifications(props: HeaderNotificationsProps) {
    const { notifications, markAsRead } = useNotifications();
    const navigate = useNavigate();

    // Scope filter:
    //   tenant  → notifiche del tenant corrente (sezione business).
    //   account → notifiche account-level (tenant_id NULL).
    const scopedNotifications = useMemo(() => {
        if (props.scope === "tenant") {
            const tid = props.tenantId;
            if (!tid) return [];
            return notifications.filter(n => n.tenant_id === tid);
        }
        return notifications.filter(n => n.tenant_id === null);
    }, [notifications, props]);

    const unreadCount = useMemo(
        () => scopedNotifications.reduce((acc, n) => acc + (n.read_at === null ? 1 : 0), 0),
        [scopedNotifications]
    );

    const hasUnreadInScope = unreadCount > 0;

    const handleSelect = (n: Notification) => {
        if (n.read_at === null) {
            void markAsRead(n.id);
        }
        const fallbackTenantId = props.scope === "tenant" ? props.tenantId : null;
        const path = resolveTargetPath(n, fallbackTenantId);
        if (path) navigate(path);
    };

    const handleMarkAllInScope = () => {
        // Itera SOLO le non-lette del contesto corrente. Mai cross-tenant.
        for (const n of scopedNotifications) {
            if (n.read_at === null) void markAsRead(n.id);
        }
    };

    const trigger = (
        <button
            type="button"
            className={styles.notifButton}
            aria-label={
                hasUnreadInScope
                    ? `Notifiche, ${unreadCount} non lette`
                    : "Notifiche"
            }
        >
            <Bell size={17} />
            {hasUnreadInScope && (
                <span className={styles.notifBadge} aria-hidden="true">
                    {unreadCount > 99 ? "99+" : unreadCount}
                </span>
            )}
        </button>
    );

    return (
        <Menu trigger={trigger} align="end">
            {scopedNotifications.length === 0 ? (
                <div className={styles.emptyState}>
                    <BellOff size={24} className={styles.emptyStateIcon} aria-hidden="true" />
                    <div className={styles.emptyStateText}>Nessuna notifica</div>
                    <div className={styles.emptyStateSub}>Le notifiche appariranno qui</div>
                </div>
            ) : (
                <>
                    <ul className={styles.notifList}>
                        {scopedNotifications.map(n => (
                            <li key={n.id} className={styles.notifItemWrap}>
                                <button
                                    type="button"
                                    onClick={() => handleSelect(n)}
                                    className={
                                        n.read_at === null
                                            ? `${styles.notifItem} ${styles.notifItemUnread}`
                                            : styles.notifItem
                                    }
                                >
                                    <span className={styles.notifItemTitleLine}>
                                        <span className={styles.notifItemTitle}>
                                            {n.title ?? "Notifica"}
                                        </span>
                                        {n.read_at === null && (
                                            <span
                                                className={styles.notifItemUnreadDot}
                                                aria-label="Non letta"
                                            />
                                        )}
                                    </span>
                                    {n.message && (
                                        <span className={styles.notifItemMessage}>
                                            {n.message}
                                        </span>
                                    )}
                                    <span className={styles.notifItemTime}>
                                        {formatRelativeTime(n.created_at)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {hasUnreadInScope && (
                        <button
                            type="button"
                            onClick={handleMarkAllInScope}
                            className={styles.notifMarkAll}
                        >
                            Segna tutte come lette
                        </button>
                    )}
                </>
            )}
        </Menu>
    );
}
