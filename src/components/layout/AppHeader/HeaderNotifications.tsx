import { useEffect, useMemo, useRef } from "react";
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Menu } from "@/components/ui/Menu";
import { useNotifications } from "@/context/useNotifications";
import type { Notification } from "@/services/supabase/notifications";
import { useNotificationChime } from "@/hooks/useNotificationChime";
import { formatRelativeTime } from "@/utils/relativeTime";
import styles from "./AppHeader.module.scss";

type HeaderNotificationsProps =
    | { scope: "tenant"; tenantId: string | null }
    | { scope: "account" };

// Best-effort deep link from notification → page.
// Both `reservation.new` (pending awaiting admin) and
// `reservation.auto_confirmed` (auto-confirm path) route to the same
// admin Reservations inbox for the tenant. Single-reservation deep link
// is out of scope: the inbox surfaces the row.
function resolveTargetPath(notification: Notification, fallbackTenantId: string | null): string | null {
    if (
        notification.event_type === "reservation.new" ||
        notification.event_type === "reservation.auto_confirmed"
    ) {
        const tenantId =
            notification.tenant_id ?? fallbackTenantId;
        if (tenantId) return `/business/${tenantId}/reservations`;
    }
    return null;
}

export function HeaderNotifications(props: HeaderNotificationsProps) {
    const { notifications, markAsRead } = useNotifications();
    const { soundEnabled, toggleSound, triggerChime } = useNotificationChime();
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

    // Contesto corrente del subset filtrato: tenant per scope business,
    // sentinella `null` per scope account. Stessa chiave usata dal filtro
    // `scopedNotifications`.
    const tenantId = props.scope === "tenant" ? props.tenantId : null;

    // Chime sull'arrivo di NUOVE notifiche nel subset filtrato.
    // Osserviamo `length` (non `unreadCount`) così il mark-as-read non
    // triggera il suono. Primo render salta (hasMountedRef): le notifiche
    // gia' caricate all'apertura della pagina non devono suonare.
    // `lastTenantRef` rende la baseline consapevole del contesto: al cambio
    // tenant `scopedNotifications.length` oscilla (array cross-tenant unico
    // filtrato per tenant_id) e senza questo guard un count maggiore del
    // tenant precedente verrebbe letto come finto "arrivo" → chime spurio.
    const hasMountedRef = useRef(false);
    const lastLengthRef = useRef(scopedNotifications.length);
    const lastTenantRef = useRef(tenantId);
    useEffect(() => {
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            lastLengthRef.current = scopedNotifications.length;
            lastTenantRef.current = tenantId;
            return;
        }
        if (tenantId !== lastTenantRef.current) {
            // Switch di contesto, non un arrivo: risemina la baseline muta.
            lastTenantRef.current = tenantId;
            lastLengthRef.current = scopedNotifications.length;
            return;
        }
        if (scopedNotifications.length > lastLengthRef.current) {
            triggerChime();
        }
        lastLengthRef.current = scopedNotifications.length;
    }, [scopedNotifications.length, tenantId, triggerChime]);

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
            <div className={styles.notifCard}>
            <div className={styles.notifHeader}>
                <div className={styles.notifHeaderTitle}>
                    <Bell size={14} aria-hidden="true" />
                    <span>Notifiche</span>
                </div>
                <label className={styles.notifSoundSwitch}>
                    {soundEnabled ? (
                        <Volume2
                            size={14}
                            aria-hidden="true"
                            className={styles.notifSoundSwitchIconOn}
                        />
                    ) : (
                        <VolumeX
                            size={14}
                            aria-hidden="true"
                            className={styles.notifSoundSwitchIconOff}
                        />
                    )}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={soundEnabled}
                        aria-label={
                            soundEnabled
                                ? "Disattiva suono notifiche"
                                : "Attiva suono notifiche"
                        }
                        onClick={toggleSound}
                        className={
                            soundEnabled
                                ? `${styles.notifSoundSwitchTrack} ${styles.notifSoundSwitchTrackOn}`
                                : styles.notifSoundSwitchTrack
                        }
                    >
                        <span className={styles.notifSoundSwitchKnob} aria-hidden="true" />
                    </button>
                </label>
            </div>

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
            </div>
        </Menu>
    );
}
