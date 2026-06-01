import { useMemo } from "react";
import { Globe, PencilLine } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type { V2Reservation } from "@/types/reservation";
import type { DeferredAction } from "./useDeferredCommit";
import styles from "./Reservations.module.scss";

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
    return new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(dt);
}

function formatTimeIt(time: string): string {
    return time.slice(0, 5);
}

function timeWindowMinutes(time: string): { start: number; end: number } {
    const [hh, mm] = time.slice(0, 5).split(":").map(n => parseInt(n, 10));
    const center = hh * 60 + mm;
    return { start: center - 90, end: center + 90 };
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
    // Aggregate "±90 min same site, confirmed only", excluding current row.
    const aggregate = useMemo(() => {
        if (!reservation) return null;
        const win = timeWindowMinutes(reservation.reservation_time);
        const sameSlot = allReservations.filter(r => {
            if (r.id === reservation.id) return false;
            if (r.status !== "confirmed") return false;
            if (r.activity_id !== reservation.activity_id) return false;
            if (r.reservation_date !== reservation.reservation_date) return false;
            const [hh, mm] = r.reservation_time.slice(0, 5).split(":").map(n => parseInt(n, 10));
            const t = hh * 60 + mm;
            return t >= win.start && t <= win.end;
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
                    <section className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>Quando</h3>
                        <dl className={styles.drawerKv}>
                            <dt>Sede</dt>
                            <dd>{activityName ?? "—"}</dd>
                            <dt>Data</dt>
                            <dd>{formatDateIt(reservation.reservation_date)}</dd>
                            <dt>Ora</dt>
                            <dd>{formatTimeIt(reservation.reservation_time)}</dd>
                            <dt>Persone</dt>
                            <dd>{reservation.party_size}</dd>
                            <dt>Origine</dt>
                            <dd>
                                <span className={styles.drawerOriginValue}>
                                    {reservation.source === "manual" ? (
                                        <>
                                            <PencilLine size={14} strokeWidth={2} aria-hidden />
                                            Inserita a mano
                                        </>
                                    ) : (
                                        <>
                                            <Globe size={14} strokeWidth={2} aria-hidden />
                                            Ricevuta online
                                        </>
                                    )}
                                </span>
                            </dd>
                        </dl>
                    </section>

                    <section className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>Cliente</h3>
                        <dl className={styles.drawerKv}>
                            <dt>Nome</dt>
                            <dd>{reservation.customer_name}</dd>
                            {reservation.customer_email?.trim() && (
                                <>
                                    <dt>Email</dt>
                                    <dd>
                                        <a href={`mailto:${reservation.customer_email}`}>
                                            {reservation.customer_email}
                                        </a>
                                    </dd>
                                </>
                            )}
                            <dt>Telefono</dt>
                            <dd>
                                <a href={`tel:${reservation.customer_phone}`}>
                                    {reservation.customer_phone}
                                </a>
                            </dd>
                        </dl>
                    </section>

                    {reservation.notes && (
                        <section className={styles.drawerSection}>
                            <h3 className={styles.drawerSectionTitle}>Note</h3>
                            <div className={styles.drawerNotes}>{reservation.notes}</div>
                        </section>
                    )}

                    {reservation.status === "pending" && aggregate && (
                        <div className={styles.drawerAggregate}>
                            Per questa fascia (±90 min stessa sede):{" "}
                            <strong>{aggregate.count}</strong> confermate · ~
                            <strong>{aggregate.totalCovers}</strong> coperti
                        </div>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
