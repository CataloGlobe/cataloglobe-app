import { Bell, BellOff } from "lucide-react";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import styles from "./AppHeader.module.scss";

interface Notification {
    id: string;
    text: string;
    sub?: string;
    time: string;
    unread: boolean;
    category: "order" | "review" | "team" | "billing";
}

// Phase 3 wires this to a real backend. Empty stub keeps the bell silent.
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
        <DropdownMenu trigger={trigger} placement="bottom-end">
            <div className={styles.emptyState}>
                <BellOff size={24} className={styles.emptyStateIcon} aria-hidden="true" />
                <div className={styles.emptyStateText}>Nessuna notifica</div>
                <div className={styles.emptyStateSub}>Le notifiche appariranno qui</div>
            </div>
        </DropdownMenu>
    );
}
