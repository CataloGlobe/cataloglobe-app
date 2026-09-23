import { useEffect, useMemo, useState } from "react";
import {
    Armchair,
    History,
    Lock,
    Plus,
    ReceiptText,
    TriangleAlert
} from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import { Badge } from "@/components/ui/Badge/Badge";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Card } from "@/components/ui/Card/Card";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection/CollapsibleSection";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import {
    TableAssignmentBadge,
    type TableAssignmentView
} from "@/components/ui/TableAssignmentBadge/TableAssignmentBadge";
import {
    compareTableLabels,
    formatTableLabels
} from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import type { V2Reservation } from "@/types/reservation";
import type { SeatingWithState } from "@/types/seating";
import {
    PREVIOUS_SERVICE_LABEL,
    isFromPreviousService,
    seatingDisplayName,
    type ServiceBoard
} from "./serviceBoard";
import { formatCovers, formatOpenFor, seatingDrawerFor, walkinTitle } from "./seatingDrawer";
import { formatPendingOrdersRow } from "./seatingClose";
import { Button } from "@/components/ui/Button/Button";
import styles from "./Reservations.module.scss";

// ── La schermata di servizio ──────────────────────────────────────────────
// Quella che l'host tiene aperta all'ingresso. Mostra, apre e — dalla 2.7 —
// crea: "+ Senza prenotazione" apre una tavolata senza passare da una
// prenotazione finta, e il drawer della tavolata la corregge e la chiude.
//
// Dalla 2.8: la tavolata aperta in un servizio precedente (prima dell'ultima
// cinque del mattino) porta una riga di segnale (`isFromPreviousService`,
// stessa regola del cron che la chiuderà alla prossima passata), e le
// chiuse dal sistema NON stanno in "Concluse"
// (`composeServiceBoard`): il loro orario di chiusura non è un fatto di sala.
//
// Fuori da questa fase, per scelta e non per dimenticanza:
//   - collegare a posteriori un walk-in a una prenotazione ("avevamo
//     prenotato a un altro nome") → non ora: raro, e va progettato a parte.
//   - l'incontro con Ordini → Tavoli (`v_tables_with_state`) → BLOCCO 3
//
// Stati vuoti: si mostra quello che c'è. "In arrivo" e "Concluse" vuoti
// spariscono. "In sala adesso" è l'unico che tiene il proprio stato vuoto,
// perché è la domanda a cui la schermata risponde — se sparisse anche lui la
// pagina resterebbe bianca. E il testo dice "nessuna tavolata aperta", mai
// "nessun dato": chi non può vedere trova il gate di `seatings.read` più
// sopra, non una sala che sembra deserta.
//
// La RIGA è cliccabile ovunque e apre il drawer dell'entità che ha più da
// dire (`seatingDrawerFor`): quello della prenotazione se ce n'è una, quello
// della tavolata per un walk-in. I NOMI restano scorciatoie verso la singola
// prenotazione — con due prenotazioni sulla stessa tavolata, ogni nome apre
// la sua. Nessuna riga che sembra uguale alle altre e non fa niente.
//
// Per un walk-in i tavoli SONO il nome ("il sette"), non un'etichetta finta.

interface Props {
    /** `null` = non ancora caricato per questa sede. */
    board: ServiceBoard | null;
    /**
     * `seatings.read` sulla sede in scope. La view è `security_invoker` e a
     * chi non può leggere risponde con liste vuote, non con un errore: senza
     * questo gate "nessuno in sala" e "non puoi vederlo" sarebbero la stessa
     * schermata.
     */
    canRead: boolean;
    /** Prenotazioni della sede per id: i nomi in sala aprono il loro drawer. */
    reservationsById: ReadonlyMap<string, V2Reservation>;
    /** Piano tavoli delle prenotazioni in arrivo (badge). */
    tableViews: ReadonlyMap<string, TableAssignmentView>;
    onOpenDetail: (r: V2Reservation) => void;
    /** Apre il drawer della tavolata (walk-in). */
    onOpenSeating: (s: SeatingWithState) => void;
    /** "+ Senza prenotazione". Assente = nessun bottone (niente permesso). */
    onOpenWalkin?: () => void;
}

const TIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
});

function formatClock(iso: string): string {
    return TIME_FORMATTER.format(new Date(iso));
}

/** Etichette dei tavoli di una tavolata, in ordine umano. */
function seatingTableLabels(s: SeatingWithState): string[] {
    return [...s.tables].map(t => t.label).sort(compareTableLabels);
}

export default function ReservationsService({
    board,
    canRead,
    reservationsById,
    tableViews,
    onOpenDetail,
    onOpenSeating,
    onOpenWalkin
}: Props) {
    // "da 45 min" deve restare vero anche se non succede niente: un tick al
    // minuto, senza refetch. I dati cambiano via realtime, l'orologio da qui.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Le concluse stanno in coda e chiuse: servono a "a che ora si è liberato
    // il 4", non a stare in mezzo.

    // seating_id → nome, per dire CHI c'è dall'altra parte di un conflitto.
    const nameBySeatingId = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of board?.inRoom ?? []) m.set(s.id, seatingDisplayName(s));
        return m;
    }, [board]);

    if (!canRead) {
        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    icon={<Lock size={40} strokeWidth={1.5} />}
                    title="Non hai accesso al servizio di questa sede"
                    description="La vista di servizio è riservata ai membri con il permesso di lettura sulla sede. Contatta il proprietario o un amministratore se hai bisogno di accedere."
                />
            </div>
        );
    }

    if (board === null) {
        return (
            <div className={styles.serviceBoard} aria-busy="true">
                <Skeleton height={160} radius="var(--radius-surface)" />
                <Skeleton height={120} radius="var(--radius-surface)" />
            </div>
        );
    }

    // La riga apre il drawer dell'entità che ha più da dire. Con più
    // prenotazioni, la prima; i nomi restano scorciatoie verso ciascuna.
    const openRow = (s: SeatingWithState) => {
        if (seatingDrawerFor(s) === "seating") {
            onOpenSeating(s);
            return;
        }
        const first = reservationsById.get(s.reservations[0].reservation_id);
        if (first) onOpenDetail(first);
        else onOpenSeating(s);
    };

    // ListRow dense (48): la sala si legge a colpo d'occhio. Niente bottoni
    // dentro la riga (un bottone in un role=button non si raggiunge bene): il
    // nome di ogni prenotazione di una tavolata condivisa si apre dal menu
    // del trailing.
    const renderSeatingRow = (s: SeatingWithState, done: boolean) => {
        const labels = seatingTableLabels(s);
        const conflicts = done ? [] : (board.conflicts.get(s.id) ?? []);
        const removed = s.tables.filter(t => t.deleted_at !== null);
        const isWalkin = s.reservations.length === 0;
        const covers = formatCovers(s.party_size);
        const stale = !done && isFromPreviousService(s, now);
        const pending = done ? 0 : s.pending_orders_count;
        const when = done
            ? s.closed_at
                ? `liberato alle ${formatClock(s.closed_at)}`
                : "concluso"
            : formatOpenFor(s.opened_at, now);
        const removedText =
            removed.length > 0
                ? `${formatTableLabels(removed.map(t => t.label))} ${removed.length === 1 ? "rimosso" : "rimossi"} dalla sala`
                : null;
        const conflictText = conflicts
            .map(c => {
                const others = c.other_seating_ids
                    .map(id => nameBySeatingId.get(id) ?? "un'altra tavolata")
                    .join(", ");
                // Il fatto, non la coincidenza. Frammento: niente punto finale.
                return `${formatTableLabels([c.label])} occupato anche da ${others}`;
            })
            .join(" · ");
        const openable = s.reservations
            .map(r => reservationsById.get(r.reservation_id))
            .filter((r): r is V2Reservation => r !== undefined);
        return (
            <ListRow
                key={s.id}
                dense
                onClick={() => openRow(s)}
                muted={done}
                title={
                    isWalkin ? (
                        // I tavoli sono il nome (§18.1); senza tavoli la riga
                        // vive di coperti e durata.
                        <>
                            {walkinTitle(s) ?? "Tavolata"}{" "}
                            <Badge variant="neutral" role="presentation">Senza prenotazione</Badge>
                        </>
                    ) : (
                        s.reservations.map(r => r.customer_name).join(" · ")
                    )
                }
                subtitle={[covers, when, removedText].filter(Boolean).join(" · ")}
                meta={
                    <>
                        {stale && (
                            // Di un servizio precedente: la chiude il cron.
                            // Grigio: informa, non chiede un'azione.
                            <Badge variant="neutral">
                                <History size={12} strokeWidth={2} aria-hidden /> {PREVIOUS_SERVICE_LABEL}
                            </Badge>
                        )}
                        {pending > 0 && (
                            <Badge variant="neutral">
                                <ReceiptText size={12} strokeWidth={2} aria-hidden /> {formatPendingOrdersRow(pending)}
                            </Badge>
                        )}
                        {conflicts.length > 0 && (
                            // Ambra, non rosso: chiede un'azione adesso (§18.1).
                            <Badge variant="warning">
                                <TriangleAlert size={12} strokeWidth={2.25} aria-hidden /> {conflictText}
                            </Badge>
                        )}
                        {/* Per un walk-in i tavoli sono già il titolo. */}
                        {!isWalkin && (
                            <Badge variant={conflicts.length > 0 ? "warning" : "outline"}>
                                <Armchair size={12} strokeWidth={2} aria-hidden />{" "}
                                {labels.length > 0 ? formatTableLabels(labels) : "Nessun tavolo"}
                            </Badge>
                        )}
                    </>
                }
                trailing={
                    openable.length > 1 ? (
                        <div onClick={e => e.stopPropagation()}>
                            <TableRowActions
                                ariaLabel={`Prenotazioni della tavolata ${s.reservations.map(r => r.customer_name).join(", ")}`}
                                actions={openable.map(r => ({
                                    label: `Apri ${r.customer_name}`,
                                    onClick: () => onOpenDetail(r)
                                }))}
                            />
                        </div>
                    ) : undefined
                }
            />
        );
    };

    return (
        <div className={styles.serviceBoard}>
            {/* ── In sala adesso ──────────────────────────────────── */}
            {/* «Senza prenotazione» qui e non nel PageHeader: lì vive «+ Nuova
                prenotazione», condivisa con l'Agenda, ed è un'altra cosa. */}
            <Card
                title="In sala adesso"
                badge={board.inRoom.length > 0 ? <Badge>{board.inRoom.length}</Badge> : undefined}
                actions={
                    onOpenWalkin ? (
                        <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} onClick={onOpenWalkin}>
                            Senza prenotazione
                        </Button>
                    ) : undefined
                }
                flush={board.inRoom.length > 0}
            >
                {board.inRoom.length === 0 ? (
                    // "Nessuna tavolata aperta", NON "nessun dato": chi arriva
                    // qui ha passato il gate, quindi la sala è davvero vuota.
                    <Text as="p" variant="body-sm" colorVariant="muted">
                        Nessuna tavolata aperta. Quando qualcuno si siede, compare qui.
                    </Text>
                ) : (
                    board.inRoom.map(s => renderSeatingRow(s, false))
                )}
            </Card>

            {/* ── In arrivo ───────────────────────────────────────── */}
            {board.arriving.length > 0 && (
                <Card title="In arrivo" badge={<Badge>{board.arriving.length}</Badge>} flush>
                    {board.arriving.map(({ reservation: r, late }) => {
                        const tableView = tableViews.get(r.id);
                        return (
                            <ListRow
                                key={r.id}
                                dense
                                onClick={() => onOpenDetail(r)}
                                leading={
                                    <Text
                                        as="span"
                                        variant="title-sm"
                                        weight={600}
                                        colorVariant={late ? "warning" : undefined}
                                        className={styles.timelineTime}
                                    >
                                        {r.reservation_time.slice(0, 5)}
                                    </Text>
                                }
                                title={r.customer_name}
                                subtitle={`${r.party_size} ${r.party_size === 1 ? "persona" : "persone"}`}
                                meta={
                                    <>
                                        {/* L'unica riga colorata del gruppo:
                                            segnala l'eccezione. */}
                                        {late && <Badge variant="warning">In ritardo</Badge>}
                                        {tableView && <TableAssignmentBadge view={tableView} />}
                                    </>
                                }
                                metaInline
                            />
                        );
                    })}
                </Card>
            )}

            {/* ── Concluse ────────────────────────────────────────
                Chiusa di default: è il servizio passato. Solo le chiuse
                dall'operatore; quelle del cron no (§18.1). */}
            {board.closed.length > 0 && (
                <CollapsibleSection label={`Concluse · ${board.closed.length}`}>
                    <Card flush>{board.closed.map(s => renderSeatingRow(s, true))}</Card>
                </CollapsibleSection>
            )}
        </div>
    );
}
