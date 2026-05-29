import { Bell, BellOff } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import styles from "./AppHeader.module.scss";

interface Notification {
    id: string;
    text: string;
    sub?: string;
    time: string;
    unread: boolean;
    category: "order" | "review" | "team" | "billing";
}

const NOTIFICATIONS: Notification[] = [];

export function HeaderNotifications() {
    const hasUnread = NOTIFICATIONS.some(n => n.unread);

    const trigger = (
        <button
            type="button"
            className={styles.notifButton}
            aria-label={hasUnread ? "Notifiche, ci sono novità" : "Notifiche"}
        >
            <Bell size={17} />
            {hasUnread && <span className={styles.notifDot} aria-hidden="true" />}
        </button>
    );

    return (
        <Menu trigger={trigger} align="end">
            <div className={styles.emptyState}>
                <BellOff size={24} className={styles.emptyStateIcon} aria-hidden="true" />
                <div className={styles.emptyStateText}>Nessuna notifica</div>
                <div className={styles.emptyStateSub}>Le notifiche appariranno qui</div>
            </div>
        </Menu>
    );
}
