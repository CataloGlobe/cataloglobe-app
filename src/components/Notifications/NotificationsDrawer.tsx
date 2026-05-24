import { useNavigate } from "react-router-dom";
import {
    X,
    Bell,
    Trash2,
    Megaphone,
    Info,
    UserPlus,
    AlertTriangle,
    Shield,
} from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { IconButton } from "@/components/ui/Button/IconButton";
import Text from "@/components/ui/Text/Text";
import { useNotifications } from "@/context/useNotifications";
import { useToast } from "@/context/Toast/ToastContext";
import type { Notification } from "@/services/supabase/notifications";
import { formatRelativeTime } from "@/utils/relativeTime";
import styles from "./NotificationsDrawer.module.scss";

// --- Type icon mapping ---

const TYPE_ICONS: Record<Notification["type"], React.ElementType> = {
    system: Bell,
    promo: Megaphone,
    info: Info,
    invite: UserPlus,
    warning: AlertTriangle,
    ownership: Shield,
};

// --- Helpers ---

function getDateGroup(dateStr: string): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 6 * 86400000);
    const date = new Date(dateStr);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateOnly.getTime() === today.getTime()) return "Oggi";
    if (dateOnly.getTime() === yesterday.getTime()) return "Ieri";
    if (dateOnly >= weekAgo) return "Questa settimana";
    return "Precedenti";
}

const GROUP_ORDER = ["Oggi", "Ieri", "Questa settimana", "Precedenti"];

function groupNotifications(
    notifications: Notification[]
): { label: string; items: Notification[] }[] {
    const map = new Map<string, Notification[]>();
    for (const n of notifications) {
        const group = getDateGroup(n.created_at);
        if (!map.has(group)) map.set(group, []);
        map.get(group)!.push(n);
    }
    return GROUP_ORDER.filter(label => map.has(label)).map(label => ({
        label,
        items: map.get(label)!,
    }));
}

// --- Sub-components ---

function NotificationSkeleton() {
    return (
        <div className={styles.skeleton}>
            <div className={styles.skeletonIcon} />
            <div className={styles.skeletonContent}>
                <div className={[styles.skeletonLine, styles.skeletonShort].join(" ")} />
                <div className={[styles.skeletonLine, styles.skeletonLong].join(" ")} />
                <div className={[styles.skeletonLine, styles.skeletonXShort].join(" ")} />
            </div>
        </div>
    );
}

// --- Main component ---

interface NotificationsDrawerProps {
    open: boolean;
    onClose: () => void;
}

export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
    const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } =
        useNotifications();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const handleNotificationClick = async (n: Notification) => {
        if (!n.read_at) await markAsRead(n.id);
        const link = n.data?.link;
        if (typeof link === "string") {
            navigate(link);
            onClose();
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        await deleteNotification(id);
        showToast({ message: "Notifica eliminata", type: "success" });
    };

    const groups = groupNotifications(notifications);

    const header = (
        <div className={styles.drawerHeader}>
            <Text variant="title-sm" weight={700}>
                Notifiche
            </Text>
            <div className={styles.headerActions}>
                {unreadCount > 0 && (
                    <button className={styles.markAllBtn} onClick={() => markAllAsRead()}>
                        Segna tutte come lette
                    </button>
                )}
                <IconButton
                    variant="ghost"
                    icon={<X size={18} />}
                    aria-label="Chiudi notifiche"
                    onClick={onClose}
                />
            </div>
        </div>
    );

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout header={header}>
                {loading ? (
                    <div className={styles.skeletonList}>
                        <NotificationSkeleton />
                        <NotificationSkeleton />
                        <NotificationSkeleton />
                        <NotificationSkeleton />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className={styles.empty}>
                        <Bell size={48} className={styles.emptyIcon} />
                        <p className={styles.emptyTitle}>Nessuna notifica</p>
                        <p className={styles.emptySubtitle}>
                            Le tue notifiche appariranno qui
                        </p>
                    </div>
                ) : (
                    <div className={styles.list}>
                        {groups.map(group => (
                            <div key={group.label} className={styles.group}>
                                <div className={styles.groupLabel}>{group.label}</div>
                                {group.items.map(n => {
                                    const TypeIcon = TYPE_ICONS[n.type] ?? Bell;
                                    const isUnread = n.read_at === null;
                                    return (
                                        <div
                                            key={n.id}
                                            className={[
                                                styles.item,
                                                isUnread ? styles.unread : "",
                                            ].join(" ")}
                                            onClick={() => handleNotificationClick(n)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={e =>
                                                e.key === "Enter" && handleNotificationClick(n)
                                            }
                                        >
                                            <span className={styles.unreadIndicator}>
                                                {isUnread && (
                                                    <span className={styles.unreadDot} />
                                                )}
                                            </span>
                                            <span className={styles.typeIcon}>
                                                <TypeIcon size={16} />
                                            </span>
                                            <div className={styles.itemContent}>
                                                {n.title && (
                                                    <p
                                                        className={[
                                                            styles.itemTitle,
                                                            isUnread ? styles.bold : "",
                                                        ].join(" ")}
                                                    >
                                                        {n.title}
                                                    </p>
                                                )}
                                                {n.message && (
                                                    <p className={styles.itemMessage}>
                                                        {n.message}
                                                    </p>
                                                )}
                                                <p className={styles.itemTime}>
                                                    {formatRelativeTime(n.created_at)}
                                                </p>
                                            </div>
                                            <button
                                                className={styles.deleteBtn}
                                                onClick={e => handleDelete(e, n.id)}
                                                aria-label="Elimina notifica"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
