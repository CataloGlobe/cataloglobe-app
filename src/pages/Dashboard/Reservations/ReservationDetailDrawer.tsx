import { useEffect, useId, useMemo, useState } from "react";
import {
    Armchair,
    CalendarDays,
    Clock,
    Globe,
    Mail,
    MapPin,
    PencilLine,
    Phone,
    User,
    Users
} from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import type { TableAssignmentView } from "@/components/ui/TableAssignmentBadge/TableAssignmentBadge";
import { formatTableLabels } from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import { TableMultiSelect } from "@/components/ui/TableMultiSelect/TableMultiSelect";
import { SeatsInput } from "@/components/ui/SeatsInput/SeatsInput";
import type { V2Table } from "@/types/orders";
import GuestConfirmedMark from "./GuestConfirmedMark";
import ReminderStatusMark from "./ReminderStatusMark";
import { seatingActionsFor, type SeatingActionKey } from "./seatingActions";
import {
    seatingCloseFlowFor,
    type SeatingCloseAction,
    type SeatingPendingOrders
} from "./seatingClose";
import { SeatingCloseQuestionBody, SeatingCloseQuestionFooter } from "./SeatingCloseQuestion";
import { tableSectionFor, type TableSectionNote } from "./tableSection";
import { statusMeta } from "@/utils/reservationStatusMeta";
import {
    canAccept,
    occupiesCapacity,
    type CapacityReservation
} from "@/utils/reservationCapacity";
import type { V2Reservation } from "@/types/reservation";
import type { ReservationGuestSummary, V2ReservationGuestNote } from "@/types/reservationGuest";
import { formatAbsenceCount, formatVisitCount } from "@/utils/guestVisibilityCopy";
import type { DeferredAction } from "./useDeferredCommit";
import styles from "./Reservations.module.scss";

const DEFAULT_DURATION_MINUTES = 120;

interface Props {
    open: boolean;
    onClose: () => void;
    /** Reservation as currently rendered (with optimistic override applied if any). */
    reservation: V2Reservation | null;
    activityName: string | null;
    /** Tenant-scoped user_id → display name map fetched once by the parent
     *  via `get_tenant_member_names`. Used to attribute manual reservations
     *  to the operator. Optional: missing/empty map → "Staff" fallback. */
    operatorNames?: Map<string, string>;
    /**
     * Tavoli assegnati a QUESTA prenotazione, già ordinati e con i conflitti
     * spiegati (calcolati dal parent una volta per tutte). NULL = nessuna
     * assegnazione: la sezione non compare, non è un errore.
     */
    tableView?: TableAssignmentView | null;
    /**
     * I tavoli REALMENTE occupati dalla tavolata, nella stessa forma del
     * piano (il render è lo stesso: un elenco di etichette con la zona).
     * `conflict` è sempre null — il rilevamento conflitti lavora sul piano,
     * vedi il commento della sezione TAVOLO.
     *
     * `undefined` = non caricati; `null` = nessuna tavolata.
     */
    seatingTableView?: TableAssignmentView | null;
    /**
     * La tavolata collegata alla prenotazione.
     *   `undefined` = non ancora caricata, oppure mai cercata (sugli stati di
     *                 piano non serve).
     *   `null`      = cercata e non trovata.
     * Decide, insieme allo stato, se la sezione guarda il piano o il fatto.
     */
    seatingId?: string | null;
    /**
     * Tavoli della sede per "Cambia tavolo" (senza soft-deleted). `undefined`
     * = non ancora caricati; il parent li carica quando il drawer si apre con
     * `canManage`. Nessun fetch qui dentro.
     */
    tables?: V2Table[];
    /** table_id → chi lo occupa nella finestra di QUESTA prenotazione. */
    tableOccupancy?: ReadonlyMap<string, string>;
    /**
     * Gesti sui tavoli (RPC immediate, il drawer resta aperto). Ritornano
     * true se l'operazione è riuscita: il parent ha già ricaricato e mostrato
     * il toast. Assenti = nessun bottone.
     */
    onSetTables?: (tableIds: string[]) => Promise<boolean>;
    onResetTables?: () => Promise<boolean>;
    /** Same-list reservations (with overrides applied) for the peak engine. */
    allReservations: V2Reservation[];
    /** Sede capienza coperti (NULL = nessun limite configurato). */
    activityCapacity: number | null;
    /** Durata standard del tavolo (minuti). Fallback 120 se non passata. */
    activityDurationMinutes?: number;
    /** True if the caller has reservations.manage on this reservation's activity. */
    canManage: boolean;
    /**
     * `activities.reservation_reminder_enabled` della sede. `undefined` = sede
     * non ancora caricata: lo stato promemoria assume acceso, perché dichiarare
     * "non previsto" senza saperlo è peggio che tacere.
     */
    activityReminderEnabled?: boolean;
    /**
     * Profilo del cliente, se la prenotazione è agganciata a uno e il caller ha
     * `guests.read`. NULL è normale in tre casi diversi che l'UI non distingue:
     * telefono non canonicalizzabile, prenotazione anteriore alla rubrica,
     * oppure permesso assente. In tutti e tre non si mostra nulla.
     */
    guestSummary?: ReservationGuestSummary | null;
    /**
     * Nota ed etichette del locale su questo cliente, IN QUESTA SEDE (FASE
     * 5.3): quel che un altro locale ha scritto non arriva qui. `null` è
     * normale: niente scritto, o nessun `guests.read` su questa sede.
     */
    guestNote?: V2ReservationGuestNote | null;
    /** `isTenantWide(permissions)` — governa il "nelle tue sedi" sui conteggi. */
    tenantWide?: boolean;
    /** Apre la scheda cliente completa. Assente = nessun bottone. */
    onOpenGuest?: () => void;
    /** Deferred-commit dispatcher (caller closes drawer + shows undo toast). */
    onAction: (action: DeferredAction) => void;
    /** Apre il drawer di modifica dati. Visibile solo se canManage e stato non terminale. */
    onEdit?: () => void;
    /** `canDoOnActivity(perms, 'seatings.manage', activityId)`. */
    canManageSeatings?: boolean;
    /**
     * I tre gesti della tavolata. IMMEDIATI, non differiti come le azioni di
     * `onAction`: in sala un tavolo che risulta libero per cinque secondi dopo
     * che l'host ha premuto "arrivato" è un tavolo che qualcun altro può
     * assegnare. L'annullamento esiste ed è un gesto esplicito, che è anche
     * più onesto di una finestra che scade da sola.
     *
     * Il drawer resta aperto e mostra il risultato; il parent ha già ricaricato
     * e mostrato il toast. Assenti = nessun bottone.
     */
    onArrive?: () => Promise<boolean>;
    /**
     * `action` solo quando la domanda «serviti o annullati?» è stata fatta e
     * risposta (vedi `seatingPendingOrders`).
     */
    onCompleteService?: (action?: SeatingCloseAction) => Promise<boolean>;
    onUndoArrival?: () => Promise<boolean>;
    /**
     * Ordini dei conti della tavolata che aspettano una decisione, dalla
     * view. `undefined` = non caricati: il gesto chiude diretto e, se il
     * server chiede, la rete di sicurezza lo dice in italiano.
     */
    seatingPendingOrders?: SeatingPendingOrders;
    /**
     * `seatings.party_size` della tavolata aperta: i coperti REALI. `null` =
     * non indicati; `undefined` = tavolata non caricata (o non c'è).
     * Rilevante solo nella forma `seated` della sezione TAVOLO.
     */
    seatingPartySize?: number | null;
    /**
     * Corregge i coperti reali (`set_seating_party_size`). Scrive sulla
     * TAVOLATA, non sulla prenotazione: la prenotazione è la promessa fatta
     * ieri e resta quella che era. Stessa regola piano/fatto dei tavoli.
     */
    onSetSeatingPartySize?: (partySize: number) => Promise<boolean>;
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

/**
 * True quando data+ora della prenotazione sono già passate.
 *
 * Gate dell'azione "Segna non presentato": su una prenotazione di domani il
 * bottone sarebbe solo rumore — nessuno può ancora non essersi presentato.
 * Wall-clock locale, coerente con come sono salvati date e ora (nessuna
 * aritmetica di fuso: `reservation_time` è TIME senza timezone).
 */
function isInThePast(reservation: V2Reservation, now: Date = new Date()): boolean {
    const [y, m, d] = reservation.reservation_date.split("-").map(n => parseInt(n, 10));
    const [hh, mm] = reservation.reservation_time.split(":").map(n => parseInt(n, 10));
    if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return false;
    return new Date(y, m - 1, d, hh, mm).getTime() < now.getTime();
}

/**
 * La frase sotto l'elenco dei tavoli. `null` = nessuna frase.
 *
 * È la sola cosa che distingue le quattro forme della sezione: il titolo resta
 * "Tavolo"/"Tavoli" in tutti i casi, perché a cambiare non è l'argomento ma da
 * dove viene la risposta.
 *
 * `plan_live` distingue chi ha scelto: la proposta del sistema si rifà se la
 * prenotazione cambia, la scelta a mano no — e va detto (§14), perché è la
 * differenza che l'operatore non vede. `plan_past` parla sempre — un
 * elenco di tavoli su una prenotazione annullata, senza una frase, si legge
 * come un fatto avvenuto.
 */
/** La scelta a mano sul piano: il motore non la ricalcola più (`set_reservation_tables`, manual). */
const MANUAL_PLAN_HINT = "Scelto a mano: resta questo anche se la prenotazione cambia.";

function tableSectionHint(
    note: TableSectionNote | undefined,
    view: TableAssignmentView | null
): string | null {
    const many = (view?.rows.length ?? 0) > 1;
    switch (note) {
        case "plan_live":
            if (!view || view.rows.length === 0) return null;
            return view.proposed === true
                ? "Proposto dal sistema. Se la prenotazione viene spostata o cambia il numero di persone, la proposta viene rifatta."
                : MANUAL_PLAN_HINT;
        case "plan_past":
            return many ? "Erano i tavoli previsti." : "Era il tavolo previsto.";
        case "seated":
            // Non conta le persone: su una prenotazione per uno "sono seduti"
            // si rompe, e al bar è la norma.
            return "Tavolo occupato adesso. Cambiando tavolo sposti la tavolata, non la proposta.";
        case "closed":
            // In coppia con "Era il tavolo previsto." dei terminali senza
            // tavolata: stesso tempo, stesso soggetto (il tavolo). Non conta
            // le persone — su una prenotazione per uno "erano seduti" si
            // rompe — e non dice "mangiato": in un bar non si mangia.
            return many ? "Erano i tavoli occupati." : "Era il tavolo occupato.";
        // Senza tavolata non ci sono righe da commentare: la frase la dà il
        // caso vuoto, qui non serve.
        default:
            return null;
    }
}

/** La frase quando non c'è nessun tavolo da elencare. */
function tableSectionEmptyHint(note: TableSectionNote | undefined): string {
    switch (note) {
        case "plan_past":
            return "Nessun tavolo era previsto.";
        // Seduti o conclusi senza tavolo: la stessa frase del drawer della
        // tavolata, senza contare le persone.
        case "seated":
        case "closed":
            return "Nessun tavolo assegnato.";
        case "fact_loading":
            // Impersonale: l'applicazione non parla in prima persona altrove.
            return "Caricamento della tavolata…";
        // Stato `seated`/`completed` senza tavolata: è una divergenza col
        // database, non un esito normale. Si dice che manca invece di
        // mostrare il piano al suo posto.
        case "fact_missing":
            return "Nessuna tavolata collegata a questa prenotazione.";
        default:
            return "Nessun tavolo assegnato.";
    }
}

export default function ReservationDetailDrawer({
    open,
    onClose,
    reservation,
    activityName,
    operatorNames,
    tableView = null,
    seatingTableView,
    seatingId,
    tables,
    tableOccupancy,
    onSetTables,
    onResetTables,
    allReservations,
    activityCapacity,
    activityDurationMinutes,
    canManage,
    activityReminderEnabled,
    guestSummary,
    guestNote,
    tenantWide = false,
    onOpenGuest,
    onAction,
    onEdit,
    canManageSeatings = false,
    onArrive,
    onCompleteService,
    onUndoArrival,
    seatingPendingOrders,
    seatingPartySize,
    onSetSeatingPartySize
}: Props) {
    // Il titolo canonico di DrawerLayout nomina il dialog (`aria-labelledby`).
    const titleId = useId();
    const durationMin = activityDurationMinutes ?? DEFAULT_DURATION_MINUTES;

    // ── Quale tavolo si sta guardando ────────────────────────────────
    // Piano o fatto: la regola sta in `tableSection.ts`, testata. Qui si
    // sceglie solo la vista da rendere, che ha la stessa forma per entrambi.
    const tableSection = reservation
        ? tableSectionFor({
              status: reservation.status,
              seatingId,
              canManage,
              canManageSeatings
          })
        : null;
    const activeTableView: TableAssignmentView | null =
        tableSection === null
            ? null
            : tableSection.source === "seating"
              ? seatingTableView ?? null
              : tableView;

    // ── Gesti sui tavoli ─────────────────────────────────────────────
    // Il picker vive inline nella sezione: un secondo SystemDrawer sopra il
    // primo romperebbe il pattern (un drawer per volta) e nasconderebbe
    // proprio la prenotazione di cui si sta scegliendo il tavolo.
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerIds, setPickerIds] = useState<string[]>([]);
    const [savingTables, setSavingTables] = useState(false);
    const [resettingTables, setResettingTables] = useState(false);

    // Coperti reali, inline: stepper + conferma. Parte dai coperti della
    // tavolata, o da quelli prenotati se la tavolata non li ha ancora.
    const [coversOpen, setCoversOpen] = useState(false);
    const [coversDraft, setCoversDraft] = useState(2);
    const [savingCovers, setSavingCovers] = useState(false);

    // Quale gesto della tavolata è in volo. Uno per volta: sono operazioni che
    // si escludono a vicenda, e due spinner insieme sarebbero solo confusione.
    const [seatingBusy, setSeatingBusy] = useState<SeatingActionKey | null>(null);

    // La domanda di «Servizio concluso» (3.2): uno stato del drawer, non un
    // altro drawer. `answering` = quale risposta è in volo.
    const [asking, setAsking] = useState(false);
    const [answering, setAnswering] = useState<SeatingCloseAction | null>(null);

    // Cambiare prenotazione o chiudere il drawer azzera il picker: una scelta
    // a metà non deve sopravvivere a un'altra prenotazione.
    const reservationId = reservation?.id ?? null;
    useEffect(() => {
        setPickerOpen(false);
        setPickerIds([]);
        setCoversOpen(false);
        setSeatingBusy(null);
        setAsking(false);
        setAnswering(null);
    }, [reservationId, open]);

    const handleConfirmCovers = async () => {
        if (!onSetSeatingPartySize) return;
        setSavingCovers(true);
        const ok = await onSetSeatingPartySize(coversDraft);
        setSavingCovers(false);
        if (ok) setCoversOpen(false);
    };

    const openPicker = () => {
        setPickerIds(activeTableView ? activeTableView.rows.map(r => r.table_id) : []);
        setPickerOpen(true);
    };

    const handleConfirmTables = async () => {
        if (!onSetTables || pickerIds.length === 0) return;
        setSavingTables(true);
        const ok = await onSetTables(pickerIds);
        setSavingTables(false);
        if (ok) setPickerOpen(false);
    };

    const handleResetTables = async () => {
        if (!onResetTables) return;
        setResettingTables(true);
        await onResetTables();
        setResettingTables(false);
    };

    // Peak concurrent covers in the window [start, start+duration), via the
    // shared capacity engine. Counts pending + confirmed for THIS activity;
    // self is excluded by id so the candidate isn't double-counted (the
    // reservation we're looking at is the "candidate" of canAccept).
    //
    // When `activityCapacity` is NULL the callout still shows the peak but
    // without the "/ capienza" comparison.
    const capacityCallout = useMemo(() => {
        if (!reservation) return null;
        // Quali stati occupano capienza lo dice il motore (`occupiesCapacity`),
        // non questo file: stessa terna delle funzioni SQL.
        const rows: CapacityReservation[] = allReservations
            .filter(r => occupiesCapacity(r.status))
            .map(r => ({
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
        const [h, m] = reservation.reservation_time.split(":").map(n => parseInt(n, 10));
        const endMin = (h ?? 0) * 60 + (m ?? 0) + durationMin;
        return {
            peak: result.peakWithCandidate,
            capacity: activityCapacity,
            from: reservation.reservation_time.slice(0, 5),
            to: `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`
        };
    }, [reservation, allReservations, activityCapacity, durationMin]);

    if (!reservation) {
        return (
            <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby={titleId} autoFocusFirstInput={false}>
                <DrawerLayout title="Prenotazione" titleId={titleId} onClose={onClose}>
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

    const st = statusMeta(reservation.status);
    const isPast = isInThePast(reservation);
    // Il gesto esiste solo dove ha una destinazione: `tableSection` la nega
    // quando lo stato è terminale, quando manca il permesso giusto per quella
    // tabella, e quando la fonte è la tavolata ma la tavolata non si trova.
    const canEditTables =
        tableSection !== null && tableSection.target !== null && onSetTables !== undefined;
    const hasTables = activeTableView !== null && activeTableView.rows.length > 0;
    const tableHint = tableSectionHint(tableSection?.note, activeTableView);
    const tableEmptyHint = tableSectionEmptyHint(tableSection?.note);
    const canEdit =
        canManage &&
        onEdit !== undefined &&
        (reservation.status === "pending" || reservation.status === "confirmed");

    // ── Gesti della tavolata ─────────────────────────────────────────
    const seatingActions = seatingActionsFor({
        status: reservation.status,
        canManageSeatings
    });

    const runSeatingAction = async (
        key: SeatingActionKey,
        handler: (() => Promise<boolean>) | undefined
    ) => {
        if (!handler || seatingBusy !== null) return;
        setSeatingBusy(key);
        await handler();
        setSeatingBusy(null);
    };

    // «Servizio concluso»: chiede solo se c'è qualcosa da decidere. Senza il
    // dato (tavolata non ancora letta) chiude diretto: è il server l'autorità.
    const closeFlow = seatingCloseFlowFor(
        seatingPendingOrders ?? { pending_orders_count: 0, pending_orders_deliverable: true }
    );
    const handleCompleteClick = () => {
        if (closeFlow.kind === "ask") {
            setAsking(true);
            return;
        }
        void runSeatingAction("complete", onCompleteService);
    };
    const handleCloseAnswer = async (action: SeatingCloseAction) => {
        if (!onCompleteService || answering !== null) return;
        setAnswering(action);
        const ok = await onCompleteService(action);
        setAnswering(null);
        if (ok) setAsking(false);
        // Se non è riuscita il parent ha già mostrato il toast; si resta
        // sulla domanda, che è ancora quella giusta.
    };

    const showArrive = seatingActions.includes("arrive") && onArrive !== undefined;
    const showComplete =
        seatingActions.includes("complete") && onCompleteService !== undefined;
    const showUndoArrival =
        seatingActions.includes("undo_arrival") && onUndoArrival !== undefined;

    const footer = (
        <div className={styles.drawerFooter}>
            {!canManage ? (
                // Come l'hint dei gesti della tavolata più sotto: si dice cosa
                // non si può fare, non quale permesso manca. Il nome del
                // permesso vive nella schermata Team, dove serve a chi lo
                // assegna.
                <Text as="p" variant="caption-xs" colorVariant="muted" className={styles.drawerFooterHint}>
                    Non hai i permessi per gestire questa prenotazione.
                </Text>
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
                    {/* Solo su prenotazioni già passate: prima non ha senso. */}
                    {isPast && (
                        <Button variant="outline" onClick={() => handleAction("mark_no_show")}>
                            Segna non presentato
                        </Button>
                    )}
                    <Button variant="danger" onClick={() => handleAction("cancel")}>
                        Annulla prenotazione
                    </Button>
                    {/* Immediato, non differito: vedi la nota sulle props. */}
                    {showArrive && (
                        <Button
                            variant="primary"
                            loading={seatingBusy === "arrive"}
                            onClick={() => void runSeatingAction("arrive", onArrive)}
                        >
                            Arrivato
                        </Button>
                    )}
                </>
            ) : reservation.status === "seated" ? (
                <>
                    {/* "Annulla apertura" e "Servizio concluso" dicono due cose
                        opposte — "non è successo" contro "è finito" — e la
                        prima cancella mentre la seconda conserva. Lo spazio in
                        mezzo è il modo in cui l'interfaccia dice che non sono
                        due varianti dello stesso gesto: chi ha fretta non deve
                        poterle scambiare guardando la posizione. */}
                    {showUndoArrival && (
                        <Button
                            variant="ghost"
                            loading={seatingBusy === "undo_arrival"}
                            disabled={seatingBusy !== null}
                            onClick={() => void runSeatingAction("undo_arrival", onUndoArrival)}
                        >
                            Annulla apertura
                        </Button>
                    )}
                    <span className={styles.drawerFooterSpacer} aria-hidden />
                    {showComplete && (
                        <Button
                            variant="primary"
                            loading={seatingBusy === "complete"}
                            disabled={seatingBusy !== null}
                            onClick={handleCompleteClick}
                        >
                            Servizio concluso
                        </Button>
                    )}
                    {/* Si dice cosa non si può fare, non quale permesso manca:
                        il nome del permesso vive nella schermata Team, dove
                        serve a chi lo assegna. Qui, in sala, citarlo chiede a
                        chi lavora di tradurre. */}
                    {!showUndoArrival && !showComplete && (
                        <Text as="p" variant="caption-xs" colorVariant="muted" className={styles.drawerFooterHint}>
                            Non hai i permessi per gestire il servizio su questa sede.
                        </Text>
                    )}
                </>
            ) : reservation.status === "no_show" ? (
                <>
                    <Text as="p" variant="caption-xs" colorVariant="muted" className={styles.drawerFooterHint}>
                        Il cliente non si è presentato.
                    </Text>
                    <Button variant="primary" onClick={() => handleAction("undo_no_show")}>
                        Annulla non presentato
                    </Button>
                </>
            ) : (
                <Text as="p" variant="caption-xs" colorVariant="muted" className={styles.drawerFooterHint}>
                    Questa prenotazione è in stato terminale. Nessuna azione disponibile.
                </Text>
            )}
        </div>
    );


    if (asking && closeFlow.kind === "ask") {
        return (
            <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby={titleId} autoFocusFirstInput={false}>
                <DrawerLayout
                    title="Prenotazione"
                    titleId={titleId}
                    onClose={onClose}
                    footer={
                        <SeatingCloseQuestionFooter
                            flow={closeFlow}
                            busy={answering}
                            onAnswer={action => void handleCloseAnswer(action)}
                            onBack={() => setAsking(false)}
                        />
                    }
                >
                    <SeatingCloseQuestionBody flow={closeFlow} />
                </DrawerLayout>
            </SystemDrawer>
        );
    }

    return (
        <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby={titleId} autoFocusFirstInput={false}>
            <DrawerLayout title="Prenotazione" titleId={titleId} onClose={onClose} footer={footer}>
                <div className={styles.drawerBody}>
                    {/* ── Hero: data eroe + meta + sede ─────────────────── */}
                    <section className={styles.drawerHero}>
                        <Text as="div" variant="title-sm" weight={600} className={styles.drawerHeroDate}>
                            <CalendarDays
                                size={18}
                                strokeWidth={2}
                                aria-hidden
                                className={styles.drawerHeroDateIcon}
                            />
                            <span className={styles.drawerHeroDateText}>
                                {formatDateIt(reservation.reservation_date)}
                            </span>
                            {/* Lo stato stava nell'intestazione: quella
                                canonica di DrawerLayout ha solo titolo e chiudi. */}
                            <StatusBadge variant={st.variant} label={st.label} />
                        </Text>

                        {/* Conferma del cliente, per esteso con data e ora.
                            Compare solo se ha risposto: chi tace non produce
                            alcun segno (vedi GuestConfirmedMark). */}
                        {reservation.guest_confirmed_at && (
                            <div className={styles.drawerHeroConfirmed}>
                                <GuestConfirmedMark
                                    guestConfirmedAt={reservation.guest_confirmed_at}
                                    variant="labelled"
                                />
                            </div>
                        )}

                        {/* Stato del promemoria della sera prima. A differenza
                            della conferma cliente questo compare sempre finché
                            la prenotazione è prima del servizio: il silenzio
                            del cliente è normale e non si commenta, un
                            promemoria che non è partito no. Al tavolo o
                            servita, il componente non rende niente. */}
                        <div className={styles.drawerHeroReminder}>
                            <ReminderStatusMark
                                reservation={reservation}
                                reminderEnabled={activityReminderEnabled}
                            />
                        </div>

                        <Text as="div" variant="body-sm" colorVariant="muted" className={styles.drawerHeroMeta}>
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
                            <Text as="span" variant="caption-xs" weight={500} colorVariant="muted" className={styles.drawerHeroChannel}>
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
                            </Text>
                            {/* Puntino e "Creata da" in UN blocco che non si
                                spezza: la riga va a capo, e lasciare il
                                separatore in coda alla riga sopra con il
                                nome sotto è il "·" penzolante. */}
                            {reservation.source === "manual" &&
                                reservation.created_by_user_id && (
                                    <span className={styles.drawerHeroMetaGroup}>
                                        <span
                                            className={styles.drawerHeroMetaDot}
                                            aria-hidden
                                        >
                                            ·
                                        </span>
                                        <span className={styles.drawerHeroMetaItem}>
                                            <User
                                                size={13}
                                                strokeWidth={2}
                                                aria-hidden
                                            />
                                            Creata da{" "}
                                            {operatorNames?.get(
                                                reservation.created_by_user_id
                                            ) ?? "Staff"}
                                        </span>
                                    </span>
                                )}
                        </Text>

                        <Text as="div" variant="caption" colorVariant="muted" className={styles.drawerHeroVenue}>
                            <MapPin size={13} strokeWidth={2} aria-hidden />
                            {activityName ?? "—"}
                        </Text>
                    </section>

                    {/* ── Tavolo ────────────────────────────────────────
                         Solo se c'è un'assegnazione, oppure se l'operatore
                         può cambiarla. La sezione ha QUATTRO forme, decise da
                         `tableSection.ts`: prima del servizio mostra e cambia
                         il PIANO (`reservation_tables`), da quando sono seduti
                         mostra e cambia il FATTO (`seating_tables`), a servizio
                         concluso mostra il fatto in sola lettura, e sugli stati
                         terminali senza tavolata mostra il piano al passato.
                         "Proposto" = scelta del sistema, ricalcolabile; la
                         decisione dell'operatore non si annuncia. Il conflitto
                         è l'unica riga colorata della sezione. I gesti sono RPC
                         immediate: il drawer resta aperto e mostra il risultato.

                         Una cosa che questa sezione NON fa, per scelta: il
                         rilevamento conflitti lavora solo su
                         `reservation_tables`, quindi sul fatto non compare:
                         estenderlo alle tavolate aperte richiede i dati
                         dell'intera giornata. Farlo a metà qui darebbe avvisi
                         incompleti, che sono peggio di nessun avviso. */}
                    {(hasTables || canEditTables) && (
                        <section className={styles.drawerSection}>
                            <div className={styles.drawerSectionHead}>
                                <Text as="h3" variant="caption-xs" weight={600} colorVariant="muted" className={styles.drawerSectionTitle}>
                                    {hasTables && activeTableView.rows.length > 1
                                        ? "Tavoli"
                                        : "Tavolo"}
                                </Text>
                                {canEditTables && !pickerOpen && (
                                    <div className={styles.drawerTableActions}>
                                        {/* "Restituisci al sistema" riguarda la
                                            proposta, e la proposta esiste solo
                                            nel piano: sul fatto non c'è niente
                                            che il motore possa rifare. */}
                                        {tableSection?.source === "plan" &&
                                            hasTables &&
                                            !activeTableView.proposed &&
                                            onResetTables && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                loading={resettingTables}
                                                disabled={savingTables}
                                                onClick={handleResetTables}
                                            >
                                                Restituisci al sistema
                                            </Button>
                                        )}
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={resettingTables}
                                            onClick={openPicker}
                                        >
                                            {hasTables ? "Cambia tavolo" : "Scegli tavolo"}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {pickerOpen ? (
                                <div className={styles.drawerTablePicker}>
                                    {tables === undefined ? (
                                        <Text as="p" variant="caption" colorVariant="muted" className={styles.drawerTableHint}>Carico i tavoli…</Text>
                                    ) : (
                                        <TableMultiSelect
                                            tables={tables}
                                            value={pickerIds}
                                            onChange={setPickerIds}
                                            occupiedBy={tableOccupancy}
                                            disabled={savingTables}
                                        />
                                    )}
                                    {/* Prima di confermare, non dopo: scegliere qui
                                        toglie la prenotazione al motore (§14). */}
                                    {tableSection?.target === "plan" && (
                                        <Text as="p" variant="caption" colorVariant="muted" className={styles.drawerTableHint}>{MANUAL_PLAN_HINT}</Text>
                                    )}
                                    <div className={styles.drawerTablePickerActions}>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={savingTables}
                                            onClick={() => setPickerOpen(false)}
                                        >
                                            Annulla
                                        </Button>
                                        {/* Array vuoto rifiutato dalla RPC del piano: chi vuole
                                            liberare la prenotazione usa "Restituisci al sistema".
                                            `set_seating_tables` lo accetterebbe, ma "togli tutti i
                                            tavoli alla tavolata" è un gesto che oggi non esiste
                                            altrove: non lo si introduce di sponda da un picker. */}
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            loading={savingTables}
                                            disabled={pickerIds.length === 0 || tables === undefined}
                                            onClick={handleConfirmTables}
                                        >
                                            Conferma
                                        </Button>
                                    </div>
                                </div>
                            ) : hasTables ? (
                                <>
                                    <ul className={styles.drawerTableList}>
                                        {activeTableView.rows.map(row => (
                                            <li key={row.table_id} className={styles.drawerTableRow}>
                                                <Armchair
                                                    size={15}
                                                    strokeWidth={2}
                                                    aria-hidden
                                                    className={styles.drawerTableIcon}
                                                />
                                                <span className={styles.drawerTableLabel}>
                                                    {formatTableLabels([row.label])}
                                                </span>
                                                {row.zone_name && (
                                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.drawerTableZone}>
                                                        {row.zone_name}
                                                    </Text>
                                                )}
                                                {row.deleted && (
                                                    <Text as="span" variant="caption-xs" weight={500} colorVariant="warning">
                                                        rimosso dalla sala
                                                    </Text>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    {tableHint !== null && (
                                        <Text as="p" variant="caption" colorVariant="muted" className={styles.drawerTableHint}>{tableHint}</Text>
                                    )}
                                    {activeTableView.conflict && (
                                        <InlineBanner variant="warning">
                                            {activeTableView.conflict.message}.
                                        </InlineBanner>
                                    )}
                                </>
                            ) : (
                                <Text as="p" variant="caption" colorVariant="muted" className={styles.drawerTableHint}>{tableEmptyHint}</Text>
                            )}
                        </section>
                    )}

                    {/* ── Coperti reali ──────────────────────────────────
                         Solo nella forma `seated`: è la regola della sezione
                         TAVOLO estesa dai tavoli ai coperti. La prenotazione
                         diceva quattro, ne sono arrivati cinque: cambia la
                         tavolata (`seatings.party_size`), non la prenotazione,
                         che è la promessa fatta ieri e resta quella che era.
                         Su `completed` i coperti sono storia e non si toccano
                         (la RPC rifiuta con 22023, e qui il gesto non c'è). */}
                    {tableSection?.note === "seated" && (
                        <section className={styles.drawerSection}>
                            <div className={styles.drawerSectionHead}>
                                <Text as="h3" variant="caption-xs" weight={600} colorVariant="muted" className={styles.drawerSectionTitle}>Coperti</Text>
                                {tableSection.target === "seating" &&
                                    onSetSeatingPartySize &&
                                    !coversOpen && (
                                        <div className={styles.drawerTableActions}>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => {
                                                    setCoversDraft(
                                                        seatingPartySize ??
                                                            reservation.party_size
                                                    );
                                                    setCoversOpen(true);
                                                }}
                                            >
                                                Correggi i coperti
                                            </Button>
                                        </div>
                                    )}
                            </div>
                            {coversOpen ? (
                                <div className={styles.drawerTablePicker}>
                                    <SeatsInput
                                        value={coversDraft}
                                        onChange={setCoversDraft}
                                        min={1}
                                        max={99}
                                        disabled={savingCovers}
                                    />
                                    <div className={styles.drawerTablePickerActions}>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={savingCovers}
                                            onClick={() => setCoversOpen(false)}
                                        >
                                            Annulla
                                        </Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            loading={savingCovers}
                                            onClick={handleConfirmCovers}
                                        >
                                            Conferma
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Text as="p" variant="caption" colorVariant="muted" className={styles.drawerTableHint}>
                                    {seatingPartySize === undefined || seatingPartySize === null
                                        ? `Al tavolo: non indicati · prenotati ${reservation.party_size}`
                                        : seatingPartySize === reservation.party_size
                                          ? `Al tavolo: ${seatingPartySize}, come prenotato`
                                          : `Al tavolo: ${seatingPartySize} · prenotati ${reservation.party_size}`}
                                </Text>
                            )}
                        </section>
                    )}

                    {/* ── Cliente ───────────────────────────────────────── */}
                    <section className={styles.drawerSection}>
                        <Text as="h3" variant="caption-xs" weight={600} colorVariant="muted" className={styles.drawerSectionTitle}>Cliente</Text>
                        <div className={styles.drawerCustomer}>
                            <Text as="div" variant="body" weight={600}>
                                {reservation.customer_name}
                            </Text>
                            <ul className={styles.drawerCustomerList}>
                                {reservation.customer_email?.trim() && (
                                    <Text as="li" variant="body-sm" colorVariant="muted" className={styles.drawerCustomerItem}>
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
                                    </Text>
                                )}
                                <Text as="li" variant="body-sm" colorVariant="muted" className={styles.drawerCustomerItem}>
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
                                </Text>
                            </ul>

                            {/* ── Chi è questa persona ───────────────────
                                 La rubrica serve qui, non solo nella sua
                                 pagina: un elenco che si consulta di proposito
                                 non lo consulta nessuno. Allergie e note del
                                 locale compaiono PRIMA del servizio, dov'è
                                 possibile evitare l'errore.

                                 I conteggi passano da formatVisitCount, che
                                 aggiunge "nelle tue sedi" ai ruoli scoped: un
                                 manager non deve credere che 1 assenza sia il
                                 totale del cliente quando ne ha 5 altrove. */}
                            {guestSummary && (
                                <div className={styles.guestInlineCard}>
                                    <Text as="div" variant="caption" className={styles.guestInlineStats}>
                                        <span className={styles.guestInlineVisits}>
                                            {formatVisitCount(guestSummary.visible_visits, tenantWide)}
                                        </span>
                                        {guestSummary.visible_no_shows > 0 && (
                                            <>
                                                <span className={styles.guestSummaryDot} aria-hidden>·</span>
                                                <span className={styles.guestSummaryAlert}>
                                                    {formatAbsenceCount(
                                                        guestSummary.visible_no_shows,
                                                        tenantWide
                                                    )}
                                                </span>
                                            </>
                                        )}
                                    </Text>

                                    {guestNote && guestNote.tags.length > 0 && (
                                        <div className={styles.guestTags}>
                                            {guestNote.tags.map(t => (
                                                <Badge key={t} role="presentation">{t}</Badge>
                                            ))}
                                        </div>
                                    )}

                                    {guestNote?.notes && (
                                        <Text as="div" variant="caption" className={styles.guestInlineNotes}>
                                            {guestNote.notes}
                                        </Text>
                                    )}

                                    {onOpenGuest && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={styles.guestInlineLink}
                                            onClick={onOpenGuest}
                                        >
                                            Apri scheda cliente
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ── Capienza (solo da gestire) ────────────────────
                         Il PICCO di coperti nella finestra [ora, ora+durata)
                         col motore di capacità condiviso — la finestra parte
                         dall'arrivo, non è «±durata». Sopra l'80% della
                         capienza è un avviso, sotto un'informazione; senza
                         capienza dice il numero e che manca il tetto. */}
                    {reservation.status === "pending" && capacityCallout && (
                        <InlineBanner
                            variant={
                                capacityCallout.capacity !== null &&
                                capacityCallout.peak / capacityCallout.capacity >= 0.8
                                    ? "warning"
                                    : "info"
                            }
                        >
                            {capacityCallout.capacity !== null ? (
                                <>
                                    Con questa, dalle {capacityCallout.from} alle {capacityCallout.to} i
                                    coperti arrivano a <strong>{capacityCallout.peak}</strong> su{" "}
                                    {capacityCallout.capacity}
                                    {capacityCallout.peak > capacityCallout.capacity
                                        ? `: ${capacityCallout.peak - capacityCallout.capacity} oltre la capienza.`
                                        : "."}
                                </>
                            ) : (
                                <>
                                    Con questa, dalle {capacityCallout.from} alle {capacityCallout.to} ci
                                    sono circa <strong>{capacityCallout.peak}</strong> coperti. Capienza non
                                    impostata.
                                </>
                            )}
                        </InlineBanner>
                    )}

                    {/* ── Note ──────────────────────────────────────────── */}
                    {reservation.notes && (
                        <section className={styles.drawerSection}>
                            <Text as="h3" variant="caption-xs" weight={600} colorVariant="muted" className={styles.drawerSectionTitle}>Note</Text>
                            <Text as="div" variant="body-sm" className={styles.drawerNotes}>{reservation.notes}</Text>
                        </section>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
