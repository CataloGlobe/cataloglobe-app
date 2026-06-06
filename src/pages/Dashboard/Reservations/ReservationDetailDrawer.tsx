import { useMemo } from "react";
import {
    CalendarDays,
    Clock,
    Globe,
    Mail,
    MapPin,
    PencilLine,
    Phone,
    Users
} from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import { addDays } from "@/utils/dateLocal";
import type { V2Reservation } from "@/types/reservation";
import type { DeferredAction } from "./useDeferredCommit";
import styles from "./Reservations.module.scss";

const AGGREGATE_WINDOW_MINUTES = 90;
const MINUTES_PER_DAY = 1440;

interface Props {
    open: boolean;
    onClose: () => void;
    /** Reservation as currently rendered (with optimistic override applied if any). */
    reservation: V2Reservation | null;
    activityName: string | null;
    /** Same-list reservations (with overrides applied) for the ±90min aggregate. */
    allReservations: V2Reservation[];
    /** True if the caller has reservations.manage on this reservation's activity. */
    canManage: boolean;
    /** Deferred-commit dispatcher (caller closes drawer + shows undo toast). */
    onAction: (action: DeferredAction) => void;
    /** Apre il drawer di modifica dati. Visibile solo se canManage e stato non terminale. */
    onEdit?: () => void;
}

function statusInfo(status: V2Reservation["status"]): {
    variant: StatusBadgeVariant;
    label: string;
} {
    switch (status) {
        case "pending":   return { variant: "warning", label: "Da gestire" };
        case "confirmed": return { variant: "success", label: "Confermata" };
        case "declined":  return { variant: "neutral", label: "Rifiutata" };
        case "cancelled": return { variant: "neutral", label: "Annullata" };
    }
}

function formatDateIt(isoDate: string): string {
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    const raw = new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(dt);
    // Intl IT renders weekday lowercase ("venerdì 12 giugno 2026"). Capitalize
    // only the first letter — leaves accented characters and following words
    // untouched.
    return raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
}

function formatTimeIt(time: string): string {
    return time.slice(0, 5);
}

function timeToMinutes(time: string): number {
    const [hh, mm] = time.slice(0, 5).split(":").map(n => parseInt(n, 10));
    return hh * 60 + mm;
}

/** Parse "YYYY-MM-DD" with LOCAL fields — no UTC drift. */
function parseLocalDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Reformat a local Date as "YYYY-MM-DD". */
function isoDateOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReservationDetailDrawer({
    open,
    onClose,
    reservation,
    activityName,
    allReservations,
    canManage,
    onAction,
    onEdit
}: Props) {
    // Aggregate "±AGGREGATE_WINDOW_MINUTES same site, confirmed only",
    // excluding self. Window is evaluated on a continuous-minute axis across
    // 3 adjacent dates (D-1, D, D+1) so a slot near midnight correctly
    // includes its counterpart on the neighbouring day (e.g. 23:30 vs 00:30).
    const aggregate = useMemo(() => {
        if (!reservation) return null;
        const centerDate = parseLocalDate(reservation.reservation_date);
        const centerMinutes = timeToMinutes(reservation.reservation_time);
        const dayByIso = new Map<string, number>([
            [isoDateOf(addDays(centerDate, -1)), -1],
            [isoDateOf(centerDate), 0],
            [isoDateOf(addDays(centerDate, +1)), +1]
        ]);
        const sameSlot = allReservations.filter(r => {
            if (r.id === reservation.id) return false;
            if (r.status !== "confirmed") return false;
            if (r.activity_id !== reservation.activity_id) return false;
            const dayDiff = dayByIso.get(r.reservation_date);
            if (dayDiff === undefined) return false;
            const candMinutes = timeToMinutes(r.reservation_time);
            const offset =
                dayDiff * MINUTES_PER_DAY + (candMinutes - centerMinutes);
            return Math.abs(offset) <= AGGREGATE_WINDOW_MINUTES;
        });
        return {
            count: sameSlot.length,
            totalCovers: sameSlot.reduce((s, r) => s + r.party_size, 0)
        };
    }, [reservation, allReservations]);

    if (!reservation) {
        return (
            <SystemDrawer open={open} onClose={onClose} width={560}>
                <DrawerLayout
                    header={<Text variant="title-sm" weight={600}>Prenotazione</Text>}
                >
                    <div className={styles.drawerBody}>
                        <Text variant="body" colorVariant="muted">
                            Nessuna prenotazione selezionata.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        );
    }

    const handleAction = (action: DeferredAction) => {
        onAction(action);
        onClose();
    };

    const st = statusInfo(reservation.status);
    const canEdit =
        canManage &&
        onEdit !== undefined &&
        (reservation.status === "pending" || reservation.status === "confirmed");

    const footer = (
        <div className={styles.drawerFooter}>
            {!canManage ? (
                <p className={styles.drawerFooterHint}>
                    Solo chi ha il permesso "Gestione prenotazioni" sulla sede può confermare, rifiutare o annullare.
                </p>
            ) : reservation.status === "pending" ? (
                <>
                    {canEdit && (
                        <Button variant="secondary" onClick={onEdit}>
                            Modifica
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => handleAction("decline")}>
                        Rifiuta
                    </Button>
                    <Button variant="primary" onClick={() => handleAction("confirm")}>
                        Conferma
                    </Button>
                </>
            ) : reservation.status === "confirmed" ? (
                <>
                    {canEdit && (
                        <Button variant="secondary" onClick={onEdit}>
                            Modifica
                        </Button>
                    )}
                    <Button variant="danger" onClick={() => handleAction("cancel")}>
                        Annulla
                    </Button>
                </>
            ) : (
                <p className={styles.drawerFooterHint}>
                    Questa prenotazione è in stato terminale. Nessuna azione disponibile.
                </p>
            )}
        </div>
    );

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeaderTitle}>
                        <Text variant="title-sm" weight={600}>Prenotazione</Text>
                        <StatusBadge variant={st.variant} label={st.label} />
                    </div>
                }
                footer={footer}
            >
                <div className={styles.drawerBody}>
                    {/* ── Hero: data eroe + meta + sede ─────────────────── */}
                    <section className={styles.drawerHero}>
                        <div className={styles.drawerHeroDate}>
                            <CalendarDays
                                size={18}
                                strokeWidth={2}
                                aria-hidden
                                className={styles.drawerHeroDateIcon}
                            />
                            <span className={styles.drawerHeroDateText}>
                                {formatDateIt(reservation.reservation_date)}
                            </span>
                        </div>

                        <div className={styles.drawerHeroMeta}>
                            <span className={styles.drawerHeroMetaItem}>
                                <Clock size={15} strokeWidth={2} aria-hidden />
                                {formatTimeIt(reservation.reservation_time)}
                            </span>
                            <span className={styles.drawerHeroMetaDot} aria-hidden>·</span>
                            <span className={styles.drawerHeroMetaItem}>
                                <Users size={15} strokeWidth={2} aria-hidden />
                                {reservation.party_size}{" "}
                                {reservation.party_size === 1 ? "persona" : "persone"}
                            </span>
                            <span className={styles.drawerHeroMetaDot} aria-hidden>·</span>
                            <span className={styles.drawerHeroChannel}>
                                {reservation.source === "manual" ? (
                                    <>
                                        <PencilLine size={13} strokeWidth={2} aria-hidden />
                                        Inserita a mano
                                    </>
                                ) : (
                                    <>
                                        <Globe size={13} strokeWidth={2} aria-hidden />
                                        Online
                                    </>
                                )}
                            </span>
                        </div>

                        <div className={styles.drawerHeroVenue}>
                            <MapPin size={13} strokeWidth={2} aria-hidden />
                            {activityName ?? "—"}
                        </div>
                    </section>

                    {/* ── Cliente ───────────────────────────────────────── */}
                    <section className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>Cliente</h3>
                        <div className={styles.drawerCustomer}>
                            <div className={styles.drawerCustomerName}>
                                {reservation.customer_name}
                            </div>
                            <ul className={styles.drawerCustomerList}>
                                {reservation.customer_email?.trim() && (
                                    <li className={styles.drawerCustomerItem}>
                                        <Mail
                                            size={14}
                                            strokeWidth={2}
                                            aria-hidden
                                            className={styles.drawerCustomerIcon}
                                        />
                                        <a
                                            className={styles.drawerCustomerLink}
                                            href={`mailto:${reservation.customer_email}`}
                                        >
                                            {reservation.customer_email}
                                        </a>
                                    </li>
                                )}
                                <li className={styles.drawerCustomerItem}>
                                    <Phone
                                        size={14}
                                        strokeWidth={2}
                                        aria-hidden
                                        className={styles.drawerCustomerIcon}
                                    />
                                    <a
                                        className={styles.drawerCustomerLink}
                                        href={`tel:${reservation.customer_phone}`}
                                    >
                                        {reservation.customer_phone}
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </section>

                    {/* ── Aggregate callout (solo pending) ──────────────── */}
                    {reservation.status === "pending" && aggregate && (
                        <div className={styles.drawerAggregate}>
                            <Clock
                                size={16}
                                strokeWidth={2}
                                aria-hidden
                                className={styles.drawerAggregateIcon}
                            />
                            <div className={styles.drawerAggregateText}>
                                Vicino a questo orario (±1h30){" "}
                                {aggregate.count === 1 ? (
                                    <>
                                        c&apos;è <strong>1</strong> prenotazione confermata
                                    </>
                                ) : (
                                    <>
                                        ci sono <strong>{aggregate.count}</strong>{" "}
                                        prenotazioni confermate
                                    </>
                                )}
                                , circa <strong>{aggregate.totalCovers}</strong> coperti.
                            </div>
                        </div>
                    )}

                    {/* ── Note ──────────────────────────────────────────── */}
                    {reservation.notes && (
                        <section className={styles.drawerSection}>
                            <h3 className={styles.drawerSectionTitle}>Note</h3>
                            <div className={styles.drawerNotes}>{reservation.notes}</div>
                        </section>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
