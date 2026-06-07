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
import {
    canAccept,
    type CapacityReservation
} from "@/utils/reservationCapacity";
import type { V2Reservation } from "@/types/reservation";
import type { DeferredAction } from "./useDeferredCommit";
import styles from "./Reservations.module.scss";

const DEFAULT_DURATION_MINUTES = 120;

interface Props {
    open: boolean;
    onClose: () => void;
    /** Reservation as currently rendered (with optimistic override applied if any). */
    reservation: V2Reservation | null;
    activityName: string | null;
    /** Same-list reservations (with overrides applied) for the peak engine. */
    allReservations: V2Reservation[];
    /** Sede capienza coperti (NULL = nessun limite configurato). */
    activityCapacity: number | null;
    /** Durata standard del tavolo (minuti). Fallback 120 se non passata. */
    activityDurationMinutes?: number;
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

export default function ReservationDetailDrawer({
    open,
    onClose,
    reservation,
    activityName,
    allReservations,
    activityCapacity,
    activityDurationMinutes,
    canManage,
    onAction,
    onEdit
}: Props) {
    const durationMin = activityDurationMinutes ?? DEFAULT_DURATION_MINUTES;

    // Peak concurrent covers in the window [start, start+duration), via the
    // shared capacity engine. Counts pending + confirmed for THIS activity;
    // self is excluded by id so the candidate isn't double-counted (the
    // reservation we're looking at is the "candidate" of canAccept).
    //
    // When `activityCapacity` is NULL the callout still shows the peak but
    // without the "/ capienza" comparison.
    const capacityCallout = useMemo(() => {
        if (!reservation) return null;
        const rows: CapacityReservation[] = allReservations.map(r => ({
            id: r.id,
            activity_id: r.activity_id,
            reservation_date: r.reservation_date,
            reservation_time: r.reservation_time,
            party_size: r.party_size,
            status: r.status
        }));
        const result = canAccept(
            { capacity: activityCapacity, durationMin },
            rows,
            {
                id: reservation.id,
                activity_id: reservation.activity_id,
                reservation_date: reservation.reservation_date,
                reservation_time: reservation.reservation_time,
                party_size: reservation.party_size
            }
        );
        return {
            peak: result.peakWithCandidate,
            capacity: activityCapacity,
            durationMin
        };
    }, [reservation, allReservations, activityCapacity, durationMin]);

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

                    {/* ── Capacity callout (solo pending) ────────────────
                         Mostra il PICCO concorrente di coperti nella finestra
                         [orario, orario+durata) calcolato dal motore di
                         capacità condiviso. Quando la capienza è impostata,
                         compara picco vs capienza con colore semaforo
                         (verde <80%, ambra 80-100%, rosso >100%). Senza
                         capienza, callout informativo "X coperti nella
                         finestra di Y minuti". */}
                    {reservation.status === "pending" && capacityCallout && (
                        <div className={styles.drawerAggregate}>
                            <Clock
                                size={16}
                                strokeWidth={2}
                                aria-hidden
                                className={styles.drawerAggregateIcon}
                            />
                            <div className={styles.drawerAggregateText}>
                                {capacityCallout.capacity !== null ? (
                                    <>
                                        Picco previsto in finestra ±{capacityCallout.durationMin} min:{" "}
                                        <strong
                                            style={{
                                                color:
                                                    capacityCallout.peak > capacityCallout.capacity
                                                        ? "#b91c1c"
                                                        : capacityCallout.peak / capacityCallout.capacity >= 0.8
                                                            ? "#b45309"
                                                            : "#15803d"
                                            }}
                                        >
                                            {capacityCallout.peak} / {capacityCallout.capacity}
                                        </strong>{" "}
                                        coperti.
                                    </>
                                ) : (
                                    <>
                                        Circa <strong>{capacityCallout.peak}</strong>{" "}
                                        coperti nella finestra di {capacityCallout.durationMin}{" "}
                                        min. Capienza non impostata.
                                    </>
                                )}
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
