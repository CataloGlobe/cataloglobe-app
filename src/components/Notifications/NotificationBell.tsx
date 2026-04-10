import { Bell } from "lucide-react";
import { motion } from "framer-motion";
import { useNotifications } from "@/context/useNotifications";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import styles from "./NotificationBell.module.scss";

interface NotificationBellProps {
    collapsed: boolean;
    onClick: () => void;
}

export function NotificationBell({ collapsed, onClick }: NotificationBellProps) {
    const { unreadCount } = useNotifications();

    const badge = unreadCount > 0 ? (
        <span className={styles.badge}>
            {unreadCount > 9 ? "9+" : unreadCount}
        </span>
    ) : null;

    const inner = (
        <button
            className={[styles.bell, collapsed ? styles.bellCollapsed : ""].join(" ")}
            onClick={onClick}
            aria-label="Notifiche"
        >
            <span className={styles.iconWrap}>
                <Bell size={18} />
                {badge}
            </span>
            <motion.span
                className={styles.label}
                initial={false}
                animate={{
                    opacity: collapsed ? 0 : 1,
                    x: collapsed ? -8 : 0,
                    width: collapsed ? 0 : "auto",
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
                Notifiche
            </motion.span>
        </button>
    );

    if (collapsed) {
        return (
            <Tooltip content="Notifiche" side="right">
                {inner}
            </Tooltip>
        );
    }

    return inner;
}
