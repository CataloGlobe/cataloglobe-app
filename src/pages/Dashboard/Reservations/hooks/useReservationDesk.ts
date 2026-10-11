import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, canDoOnAnyActivity, isTenantWide } from "@/lib/permissions";
import { shiftIsoDate, todayIsoDate } from "@/utils/dateLocal";
import {
    listPendingReservations,
    listReservations,
    PENDING_QUEUE_LIMIT,
    listReservationTablesForReservations,
    resetReservationTablesToSystem,
    setReservationTables
} from "@/services/supabase/reservations";
import {
    closeSeating,
    getSeatingForReservation,
    getSeatingState,
    listSeatingTables,
    openSeatingForReservation,
    setSeatingPartySize,
    setSeatingTables,
    undoSeating
} from "@/services/supabase/seatings";
import { listTables } from "@/services/supabase/tables";
import type { V2Table } from "@/types/orders";
import { getActivities } from "@/services/supabase/activities";
import { getTenantMemberNames } from "@/services/supabase/team";
import { getReservationGuest, getReservationGuestNoteForActivity } from "@/services/supabase/reservationGuests";
import type { V2Activity } from "@/types/activity";
import type { ReservationTableAssignmentWithTable, V2Reservation } from "@/types/reservation";
import type { ReservationGuestSummary, V2ReservationGuestNote } from "@/types/reservationGuest";
import type { SeatingTableWithTable } from "@/types/seating";
import {
    DEFAULT_TABLE_DURATION_MINUTES,
    OCCUPYING_STATUSES,
    detectReservationTableConflicts,
    reservationWindowsOverlap,
    type ReservationTableConflict
} from "@/utils/reservationTableConflicts";
import type { TableAssignmentView } from "@/components/ui/TableAssignmentBadge/TableAssignmentBadge";
import {
    bareTableLabel,
    compareTableLabels,
    formatTableLabels
} from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import type { SeatingCloseAction, SeatingPendingOrders } from "../seatingClose";
import { tableWriteTargetFor } from "../tableSection";
import { useDeferredCommit, type DeferredAction } from "../useDeferredCommit";
import {
    applyRealtimeEvents,
    dayContextRange,
    mergeDateRanges,
    type DateRange,
    type ReservationRealtimeEvent
} from "../loadWindow";
import { useReservationsRealtime } from "./useReservationsRealtime";
import { useDetailParam } from "@/hooks/useDetailParam";

/**
 * Il banco delle prenotazioni di una sede (lotto B-b): i dati, il realtime,
 * i gesti differiti e i due drawer (dettaglio, crea/modifica). Lo usano due
 * pagine: Prenotazioni (l'Agenda) e Servizio (l'Elenco, dove una riga «In
 * arrivo» o «In sala adesso» apre lo stesso dettaglio). Estratto da
 * `Reservations.tsx` senza cambiare regole né testi: un'implementazione sola
 * dei gesti della prenotazione.
 *
 * La finestra di caricamento è sempre oggi più i giorni aperti nei drawer;
 * la pagina aggiunge i suoi (`baseRanges`: la settimana dell'Agenda).
 */

const EMPTY_VIEWS: ReadonlyMap<string, TableAssignmentView> = new Map();
const NO_RANGES: DateRange[] = [];

/**
 * I tavoli REALMENTE occupati da una tavolata, nella stessa forma del piano:
 * la sezione TAVOLO del drawer rende un elenco di etichette con la zona, e
 * quell'elenco non cambia a seconda di dove viene il dato.
 *
 * `proposed: false` perché "proposto" è una qualità del piano — il motore non
 * propone tavolate, le registra. `conflict: null` perché il rilevamento
 * conflitti lavora su `reservation_tables` (vedi il commento della sezione
 * TAVOLO nel drawer).
 */
function seatingTableView(rows: SeatingTableWithTable[]): TableAssignmentView {
    const mapped = rows
        .map(r => ({
            table_id: r.table_id,
            label: r.table?.label ?? "sconosciuto",
            zone_name: r.table?.zone_name ?? null,
            deleted: r.table === null || r.table.deleted_at !== null
        }))
        .sort((x, y) => compareTableLabels(x.label, y.label));
    return {
        labels: mapped.map(r => r.label),
        rows: mapped,
        proposed: false,
        conflict: null
    };
}

/**
 * Una riga di spiegazione per ogni conflitto, unite con " · ". Nomina le
 * altre prenotazioni con nome e ora: l'operatore deve sapere CHI, non solo
 * che c'è un problema.
 */
function describeConflicts(
    conflicts: ReservationTableConflict[],
    labelByTableId: Map<string, string>,
    reservationById: Map<string, V2Reservation>
): string {
    return conflicts
        .map(c => {
            const label = bareTableLabel(labelByTableId.get(c.table_id) ?? "sconosciuto");
            if (c.kind === "table_deleted") {
                return `Il tavolo ${label} è stato rimosso dalla sala`;
            }
            const others = c.other_reservation_ids
                .map(id => reservationById.get(id))
                .filter((r): r is V2Reservation => r !== undefined)
                .map(r => `${r.customer_name} (${r.reservation_time.slice(0, 5)})`);
            const who =
                others.length === 0
                    ? "un'altra prenotazione"
                    : others.length === 1
                      ? others[0]
                      : `${others.slice(0, -1).join(", ")} e ${others[others.length - 1]}`;
            return `Tavolo ${label} assegnato anche a ${who}`;
        })
        .join(" · ");
}

const ACTION_LABEL: Record<DeferredAction, string> = {
    confirm:      "Prenotazione confermata.",
    decline:      "Prenotazione rifiutata.",
    cancel:       "Prenotazione annullata.",
    mark_no_show: "Segnata come non presentato.",
    undo_no_show: "Non presentato annullato."
};

export interface ReservationDeskOptions {
    /** La sede della pagina (dal path). `null` solo prima che la rotta risolva. */
    activityId: string | null;
    /** Si carica solo quando chi guarda può leggere: il pre-check evita il 42501. */
    enabled: boolean;
    /** Giorni in più da tenere in memoria (la settimana dell'Agenda). */
    baseRanges?: DateRange[];
    /** Righe fuori dalla memoria che il dettaglio può aprire (i risultati di ricerca). */
    snapshotRows?: readonly V2Reservation[];
    /** Un'altra sede di cui servono i tavoli (walk-in e drawer della tavolata). */
    wantTablesFor?: string | null;
    /** Dopo ogni rilettura e ogni gesto sulla tavolata: la sala si ricarica insieme. */
    onSalaChanged?: () => void;
}

/** L'Elenco di Servizio apre anche le tavolate: un dettaglio per volta. */
const DETAIL_SIBLINGS = ["tavolata"] as const;

export function useReservationDesk({
    activityId,
    enabled,
    baseRanges = NO_RANGES,
    snapshotRows,
    wantTablesFor = null,
    onSalaChanged
}: ReservationDeskOptions) {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { permissions } = usePermissions();

    // La sala si ricarica dal chiamante: ref, così `loadData` non cambia
    // identità a ogni render del chiamante.
    const onSalaChangedRef = useRef(onSalaChanged);
    useEffect(() => {
        onSalaChangedRef.current = onSalaChanged;
    }, [onSalaChanged]);

    // Rubrica clienti. Permesso distinto da `reservations.read`: la singola
    // prenotazione è il turno, la rubrica è l'archivio completo dei clienti
    // dell'azienda. Staff e viewer non ce l'hanno.
    const canReadGuests = useMemo(
        () => (permissions ? canDoOnAnyActivity(permissions, "guests.read") : false),
        [permissions]
    );
    // Owner/admin vedono l'intera azienda: a loro il "nelle tue sedi" sui
    // conteggi sarebbe rumore. A tutti gli altri serve, perché i loro numeri
    // sono parziali per costruzione (view security_invoker).
    const tenantWide = useMemo(() => (permissions ? isTenantWide(permissions) : false), [permissions]);

    const [reservations, setReservations] = useState<V2Reservation[]>([]);
    // La coda «Da gestire» ha un tetto (`PENDING_QUEUE_LIMIT`): se il server
    // ne ha di più, la pagina lo dice invece di troncare in silenzio.
    const [pendingTruncated, setPendingTruncated] = useState(false);
    const [activities, setActivities] = useState<V2Activity[]>([]);
    // Tenant-scoped map (user_id → display name) used to attribute manual
    // reservations to the operator who created them. Mirrors the pattern in
    // Orders.tsx. Fetched once per tenant via the SECURITY DEFINER RPC
    // `get_tenant_member_names` — failure resolves to an empty map and the
    // drawer falls back to a generic "Staff" label.
    const [operatorNames, setOperatorNames] = useState<Map<string, string>>(() => new Map());
    // Assegnazioni tavolo delle prenotazioni da ieri in avanti (vedi
    // `loadData`): le passate non si mostrano, non si pagano.
    const [tableAssignments, setTableAssignments] = useState<ReservationTableAssignmentWithTable[]>([]);
    // Tavoli per sede, caricati on-demand quando il drawer si apre con
    // `canManage` (servono solo al picker "Cambia tavolo"). Cache per sede:
    // la sala non cambia mentre si gestisce una serata.
    const [tablesByActivity, setTablesByActivity] = useState<Map<string, V2Table[]>>(() => new Map());
    const [isLoading, setIsLoading] = useState(true);
    // Distingue "non ho ancora niente da mostrare" da "sto aggiornando ciò che
    // già mostro". Senza, lo scheletro sostituisce l'intera pagina a OGNI
    // `loadData` — drawer compreso, che viene smontato e rimontato: ogni gesto
    // lo fa lampeggiare due volte, una per il ricaricamento esplicito
    // dell'handler e una per quello che il realtime scatena sull'UPDATE della
    // riga. Un aggiornamento con dati in mano non deve cambiare il layout.
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    // La prenotazione aperta accanto (D131) sta nell'indirizzo
    // (`?prenotazione=`): link da mandare, «indietro» che la chiude.
    const [selectedId, openSelected, closeSelected] = useDetailParam("prenotazione", DETAIL_SIBLINGS);
    const isDrawerOpen = selectedId !== null;

    // La data che il form crea/modifica sta guardando (`null` a form chiuso).
    const [formDate, setFormDate] = useState<string | null>(null);

    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [createEditMode, setCreateEditMode] = useState<"create" | "edit">("create");
    const [editingReservation, setEditingReservation] = useState<V2Reservation | null>(null);

    const handleOpenCreate = useCallback(() => {
        setCreateEditMode("create");
        setEditingReservation(null);
        setIsCreateEditOpen(true);
    }, []);

    const activityNames = useMemo(() => {
        const m = new Map<string, string>();
        for (const a of activities) m.set(a.id, a.name);
        return m;
    }, [activities]);

    const canManageActivity = useCallback(
        (id: string) => {
            if (!permissions) return false;
            return canDoOnActivity(permissions, "reservations.manage", id);
        },
        [permissions]
    );

    // Permesso separato da `reservations.manage`: chi gestisce la sala non è
    // necessariamente chi decide se accettare una prenotazione.
    const canManageSeatingsOn = useCallback(
        (id: string) => {
            if (!permissions) return false;
            return canDoOnActivity(permissions, "seatings.manage", id);
        },
        [permissions]
    );

    const manageableActivities = useMemo(
        () =>
            activities
                .filter(a => canManageActivity(a.id))
                .map(a => ({
                    id: a.id,
                    name: a.name,
                    reservation_capacity: a.reservation_capacity ?? null,
                    reservation_duration_minutes: a.reservation_duration_minutes ?? 120,
                    // Pacing: `?? null` è "nessun limite", non un default di
                    // comodo. Il passo ricade su 15 come il default a schema.
                    reservation_pacing_slot_minutes: a.reservation_pacing_slot_minutes ?? 15,
                    reservation_pacing_max_covers: a.reservation_pacing_max_covers ?? null,
                    reservation_pacing_max_bookings: a.reservation_pacing_max_bookings ?? null
                })),
        [activities, canManageActivity]
    );

    // ── Load ──────────────────────────────────────────────────────────
    // Il giorno della prenotazione aperta nel drawer. Derivato dalla riga in
    // memoria e non salvato a parte: se la riga cambia data (realtime, o
    // modifica), la finestra la segue.
    // Un risultato di ricerca aperto non è (ancora) in memoria: la sua data
    // entra nella finestra da qui, e al giro dopo la riga c'è.
    const selectedDate = useMemo(() => {
        if (!isDrawerOpen || !selectedId) return null;
        const row = reservations.find(r => r.id === selectedId) ?? snapshotRows?.find(r => r.id === selectedId);
        return row?.reservation_date ?? null;
    }, [isDrawerOpen, selectedId, reservations, snapshotRows]);

    const today = todayIsoDate();
    const loadRanges = useMemo<DateRange[]>(() => {
        const ranges: DateRange[] = [
            // Quelli della pagina (la settimana che l'Agenda disegna).
            ...baseRanges,
            // Oggi, sempre: i contatori in testa e l'Elenco di Servizio lo
            // guardano qualunque settimana sia aperta in Agenda.
            dayContextRange(today)
        ];
        // I giorni aperti nei drawer, con il giorno prima e il giorno dopo.
        //
        // ATTENZIONE — accoppiamento al contrario, voluto per questa fase.
        // L'avviso di overbooking del form (`ReservationForm`) e il callout di
        // capienza del drawer (`ReservationDetailDrawer`) calcolano il picco
        // dai dati che questa pagina ha in memoria: è il caricamento che si
        // piega a quello che serve a loro, non il contrario. Per le
        // prenotazioni manuali quell'avviso è l'UNICO controllo di capienza:
        // `createReservation` è un INSERT diretto, il server non verifica
        // niente. Togliere questi giorni dalla finestra non rompe nessun
        // test e nessuna vista: rende semplicemente cieco l'avviso, in
        // silenzio. Va tolto SOLO quando form e drawer chiederanno i numeri
        // al server (`get_reservation_day_availability` esiste già).
        // `D-1 .. D+1` perché le finestre di durata scavalcano la mezzanotte:
        // è la stessa finestra di `reservation_peak_with_candidate`.
        if (selectedDate) ranges.push(dayContextRange(selectedDate));
        if (formDate) ranges.push(dayContextRange(formDate));
        return mergeDateRanges(ranges);
    }, [baseRanges, today, selectedDate, formDate]);
    // Chiave stabile: un array nuovo con le stesse date non deve ricaricare.
    const loadRangesKey = loadRanges.map(r => `${r.from}..${r.to}`).join("|");
    // Il realtime e i gesti leggono la finestra corrente dal ref: `loadData`
    // non cambia identità a ogni navigazione di settimana.
    const loadRangesRef = useRef(loadRanges);
    useEffect(() => {
        loadRangesRef.current = loadRanges;
    }, [loadRanges]);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        setIsLoading(true);
        try {
            const ranges = loadRangesRef.current;
            const [windows, pending, acts, names] = await Promise.all([
                Promise.all(ranges.map(range => listReservations(tenantId, range, activityId))),
                listPendingReservations(tenantId, activityId),
                getActivities(tenantId),
                getTenantMemberNames(tenantId)
            ]);
            // Le finestre sono disgiunte (`mergeDateRanges`), ma una pending
            // dentro una finestra arriva due volte: si deduplica per id.
            const byId = new Map<string, V2Reservation>();
            for (const rows of windows) for (const r of rows) byId.set(r.id, r);
            for (const r of pending.rows) byId.set(r.id, r);
            const rows = Array.from(byId.values()).sort((a, b) =>
                a.reservation_date !== b.reservation_date
                    ? a.reservation_date.localeCompare(b.reservation_date)
                    : a.reservation_time.localeCompare(b.reservation_time)
            );
            // Una sola query aggiuntiva, sugli id da ieri in avanti: le
            // assegnazioni delle prenotazioni passate non si mostrano, non si
            // pagano. Con la finestra la lista di id resta corta — con 1000 id
            // l'URL superava i 37 KB e il gateway rispondeva 400.
            const sinceIso = shiftIsoDate(todayIsoDate(), -1);
            const recentIds = rows.filter(r => r.reservation_date >= sinceIso).map(r => r.id);
            const assignments = await listReservationTablesForReservations(recentIds, tenantId);
            setReservations(rows);
            setPendingTruncated(pending.truncated);
            setActivities(acts);
            setOperatorNames(names);
            setTableAssignments(assignments);
            // La sala si ricarica insieme: ogni gesto della tavolata passa da
            // qui, e l'Elenco deve rispecchiarlo senza aspettare l'evento
            // realtime (che arriva, ma dopo).
            onSalaChangedRef.current?.();
        } catch {
            showToast({ message: "Errore nel caricamento delle prenotazioni.", type: "error" });
        } finally {
            setIsLoading(false);
            // Nel `finally` e non nel `try`: anche un caricamento fallito ha
            // già mostrato il suo toast, e ripresentare lo scheletro al
            // tentativo successivo nasconderebbe la pagina invece di spiegare
            // cosa non va.
            setHasLoadedOnce(true);
        }
    }, [tenantId, activityId, showToast]);

    // Ricarica quando cambia la finestra (settimana, giorno aperto in un
    // drawer), oltre che al primo giro. `loadRangesKey` e non `loadRanges`:
    // stesse date, stessa fetch.
    useEffect(() => {
        if (!enabled) return;
        void loadData();
    }, [enabled, loadData, loadRangesKey]);

    // Live updates: gli eventi si applicano alle righe in memoria, senza
    // rileggere la finestra (che si rilegge solo alla (ri)connessione del
    // canale). Una riga fuori finestra e non pending si scarta.
    const handleRealtimeEvents = useCallback(
        (events: ReservationRealtimeEvent[]) => {
            if (!tenantId) return;
            const ranges = loadRangesRef.current;
            let touched: string[] = [];
            let removed: string[] = [];
            let pendingNow = 0;
            setReservations(prev => {
                const result = applyRealtimeEvents(prev, events, ranges);
                touched = result.touchedIds;
                removed = result.removedIds;
                pendingNow = result.rows.filter(r => r.status === "pending").length;
                return result.rows;
            });
            // Una pending in più via realtime può superare il tetto: la pagina
            // lo dice anche qui, senza aspettare la prossima rilettura.
            if (pendingNow > PENDING_QUEUE_LIMIT) setPendingTruncated(true);
            if (removed.length > 0) {
                const gone = new Set(removed);
                setTableAssignments(prev => prev.filter(a => !gone.has(a.reservation_id)));
            }
            if (touched.length > 0) {
                // Il trigger di riassegnazione può aver cambiato i tavoli delle
                // righe toccate: una query sui loro id, non sulla finestra.
                void listReservationTablesForReservations(touched, tenantId)
                    .then(fresh => {
                        const ids = new Set(touched);
                        setTableAssignments(prev => [...prev.filter(a => !ids.has(a.reservation_id)), ...fresh]);
                    })
                    .catch(() => {
                        // Le assegnazioni restano quelle di prima: la prossima
                        // rilettura le allinea. Niente toast per un dettaglio.
                    });
            }
        },
        [tenantId]
    );

    useReservationsRealtime(tenantId, activityId, enabled, handleRealtimeEvents, loadData);

    // ── Deferred commit ───────────────────────────────────────────────
    const { overrides, schedule, cancel } = useDeferredCommit({
        onCommitSuccess: loadData,
        onCommitError: (_id, message) => {
            void loadData();
            showToast({ message, type: "error" });
        }
    });

    // Apply optimistic overrides to the source list before any downstream
    // filtering/grouping. Keeps all derived views in sync without each
    // component knowing about the override layer.
    const effectiveReservations = useMemo<V2Reservation[]>(() => {
        if (overrides.size === 0) return reservations;
        return reservations.map(r => {
            const ov = overrides.get(r.id);
            return ov ? { ...r, status: ov } : r;
        });
    }, [reservations, overrides]);

    const reservationsById = useMemo(
        () => new Map(effectiveReservations.map(r => [r.id, r])),
        [effectiveReservations]
    );

    // ── Tavoli: vista per prenotazione + conflitti ────────────────────
    // Calcolato UNA volta su `effectiveReservations` (con gli override
    // ottimistici: una prenotazione appena annullata smette subito di essere
    // in conflitto) e passato ai figli come i dati già esistenti.
    const tableViews = useMemo<ReadonlyMap<string, TableAssignmentView>>(() => {
        if (tableAssignments.length === 0) return EMPTY_VIEWS;

        const durationByActivity = new Map<string, number>();
        for (const a of activities) {
            durationByActivity.set(a.id, a.reservation_duration_minutes ?? DEFAULT_TABLE_DURATION_MINUTES);
        }
        const reservationById = new Map(effectiveReservations.map(r => [r.id, r]));
        const conflicts = detectReservationTableConflicts(effectiveReservations, tableAssignments, durationByActivity);

        const labelByTableId = new Map<string, string>();
        const byReservation = new Map<string, ReservationTableAssignmentWithTable[]>();
        for (const a of tableAssignments) {
            labelByTableId.set(a.table_id, a.table?.label ?? "sconosciuto");
            const list = byReservation.get(a.reservation_id);
            if (list) list.push(a);
            else byReservation.set(a.reservation_id, [a]);
        }

        const views = new Map<string, TableAssignmentView>();
        for (const [reservationId, list] of byReservation) {
            // Le righe arrivano ordinate per `table_id` (uuid): l'ordine
            // sensato è per etichetta, e si decide qui.
            const rows = list
                .map(a => ({
                    table_id: a.table_id,
                    label: a.table?.label ?? "sconosciuto",
                    zone_name: a.table?.zone_name ?? null,
                    deleted: a.table === null || a.table.deleted_at !== null
                }))
                .sort((x, y) => compareTableLabels(x.label, y.label));
            const own = conflicts.get(reservationId) ?? [];
            views.set(reservationId, {
                labels: rows.map(r => r.label),
                rows,
                // Basta UNA riga `manual` perché l'intera assegnazione sia
                // una decisione dell'operatore.
                proposed: !list.some(a => a.assignment_source === "manual"),
                conflict:
                    own.length > 0
                        ? {
                              kind: own[0].kind,
                              message: describeConflicts(own, labelByTableId, reservationById)
                          }
                        : null
            });
        }
        return views;
    }, [tableAssignments, effectiveReservations, activities]);

    const handleAction = useCallback(
        (r: V2Reservation, action: DeferredAction) => {
            schedule(r.id, action);
            showToast({
                message: ACTION_LABEL[action],
                type: "info",
                duration: 5000,
                actionLabel: "Annulla",
                onAction: () => cancel(r.id)
            });
        },
        [schedule, cancel, showToast]
    );

    const handleOpenDetail = useCallback((r: V2Reservation) => openSelected(r.id), [openSelected]);

    const handleCloseDrawer = closeSelected;

    // «Modifica» apre il drawer sopra: il dettaglio accanto resta, e quando
    // si salva cambia con la riga.
    const handleOpenEdit = useCallback((r: V2Reservation) => {
        setEditingReservation(r);
        setCreateEditMode("edit");
        setIsCreateEditOpen(true);
    }, []);

    const handleCloseCreateEdit = useCallback(() => {
        setIsCreateEditOpen(false);
    }, []);

    const handleCreateEditSuccess = useCallback(async () => {
        await loadData();
    }, [loadData]);

    // La memoria vince (ha gli override e il realtime); il risultato di
    // ricerca copre l'attimo fra il click e il caricamento del suo giorno.
    const selectedReservation = useMemo(
        () =>
            selectedId
                ? effectiveReservations.find(r => r.id === selectedId) ??
                  snapshotRows?.find(r => r.id === selectedId) ??
                  null
                : null,
        [selectedId, effectiveReservations, snapshotRows]
    );

    // Profilo del cliente della prenotazione aperta. Caricato on-demand
    // all'apertura del drawer: la lista prenotazioni non ha bisogno dei
    // profili, e caricarli tutti sarebbe una query per riga.
    const [detailGuest, setDetailGuest] = useState<ReservationGuestSummary | null>(null);
    // Nota e tag del locale: quelli DELLA SEDE della prenotazione (FASE 5.3),
    // non del cliente in generale. `null` = niente scritto qui, o nessun
    // `guests.read` su questa sede.
    const [detailGuestNote, setDetailGuestNote] = useState<V2ReservationGuestNote | null>(null);
    const detailGuestId = selectedReservation?.guest_id ?? null;
    const detailActivityId = selectedReservation?.activity_id ?? null;

    useEffect(() => {
        if (!isDrawerOpen || !detailGuestId || !detailActivityId || !tenantId || !canReadGuests) {
            setDetailGuest(null);
            setDetailGuestNote(null);
            return;
        }
        let alive = true;
        Promise.all([
            getReservationGuest(detailGuestId, tenantId),
            getReservationGuestNoteForActivity(detailGuestId, detailActivityId, tenantId)
        ])
            .then(([g, note]) => {
                if (!alive) return;
                setDetailGuest(g);
                setDetailGuestNote(note);
            })
            // Silenzioso: il profilo è un arricchimento del drawer, la sua
            // assenza non deve disturbare chi sta gestendo una prenotazione.
            .catch(() => {
                if (!alive) return;
                setDetailGuest(null);
                setDetailGuestNote(null);
            });
        return () => {
            alive = false;
        };
    }, [isDrawerOpen, detailGuestId, detailActivityId, tenantId, canReadGuests]);

    const selectedActivity = useMemo(
        () => (selectedReservation ? activities.find(a => a.id === selectedReservation.activity_id) ?? null : null),
        [selectedReservation, activities]
    );

    // ── Tavoli: dati e gesti per il drawer ────────────────────────────
    // I tavoli della sede servono al picker, che su una prenotazione seduta
    // sposta la TAVOLATA: il permesso che lo apre è `seatings.manage`, non
    // `reservations.manage`. Caricarli solo per il secondo lascerebbe l'host
    // di sala davanti a un "Carico i tavoli…" che non finisce mai.
    const selectedCanManage = selectedReservation
        ? canManageActivity(selectedReservation.activity_id) || canManageSeatingsOn(selectedReservation.activity_id)
        : false;
    const selectedActivityId = selectedReservation?.activity_id ?? null;

    // Sede di cui servono i tavoli, ADESSO: quella della prenotazione aperta
    // nel drawer, oppure quella che chiede la pagina (walk-in e drawer della
    // tavolata usano lo stesso picker). Una sola cache per sede.
    const tablesWantedFor: string | null =
        isDrawerOpen && selectedActivityId && selectedCanManage ? selectedActivityId : wantTablesFor;

    useEffect(() => {
        if (!tenantId || !tablesWantedFor) return;
        if (tablesByActivity.has(tablesWantedFor)) return;
        let alive = true;
        listTables(tenantId, tablesWantedFor)
            .then(rows => {
                if (!alive) return;
                setTablesByActivity(prev => new Map(prev).set(tablesWantedFor, rows));
            })
            .catch(() => {
                if (!alive) return;
                showToast({ message: "Errore nel caricamento dei tavoli.", type: "error" });
            });
        return () => {
            alive = false;
        };
    }, [tenantId, tablesWantedFor, tablesByActivity, showToast]);

    const selectedTables = selectedActivityId ? tablesByActivity.get(selectedActivityId) : undefined;

    // Chi occupa ogni tavolo nella finestra della prenotazione aperta
    // (esclusa lei stessa). Stessa regola del motore, via l'util condivisa:
    // il picker lo MOSTRA, non impedisce la scelta.
    const selectedTableOccupancy = useMemo<ReadonlyMap<string, string>>(() => {
        const out = new Map<string, string>();
        if (!selectedReservation) return out;
        const duration = selectedActivity?.reservation_duration_minutes ?? DEFAULT_TABLE_DURATION_MINUTES;
        const byId = new Map(effectiveReservations.map(r => [r.id, r]));
        const names = new Map<string, string[]>();
        for (const a of tableAssignments) {
            if (a.activity_id !== selectedReservation.activity_id) continue;
            if (a.reservation_id === selectedReservation.id) continue;
            const other = byId.get(a.reservation_id);
            if (!other || !OCCUPYING_STATUSES.has(other.status)) continue;
            if (!reservationWindowsOverlap(selectedReservation, other, duration)) continue;
            const list = names.get(a.table_id) ?? [];
            list.push(`${other.customer_name} (${other.reservation_time.slice(0, 5)})`);
            names.set(a.table_id, list);
        }
        for (const [tableId, list] of names) out.set(tableId, list.join(", "));
        return out;
    }, [selectedReservation, selectedActivity, effectiveReservations, tableAssignments]);

    // ── La tavolata della prenotazione aperta ─────────────────────────
    // Serve solo a chi si è seduto: `seated` e `completed` sono gli unici
    // stati che hanno una tavolata, e sono anche gli unici in cui la sezione
    // TAVOLO del drawer guarda il fatto invece del piano.
    //
    // `undefined` = non ancora caricata; `{ id: null }` = cercata e non
    // trovata. Il drawer tratta i due casi diversamente, e vanno tenuti
    // distinti: "sto caricando" e "non c'è" dicono cose opposte all'operatore.
    const [detailSeating, setDetailSeating] = useState<
        | {
              id: string | null;
              view: TableAssignmentView | null;
              partySize: number | null;
              /** Dalla view: serve alla domanda di «Servizio concluso». */
              pending: SeatingPendingOrders | undefined;
          }
        | undefined
    >(undefined);
    // Le scritture sulla tavolata non passano da `loadData` (che ricarica
    // prenotazioni e piano): questo token le fa ricaricare.
    const [seatingReloadToken, setSeatingReloadToken] = useState(0);

    const detailReservationId = selectedReservation?.id ?? null;
    const detailReservationStatus = selectedReservation?.status ?? null;
    const detailHasSeating = detailReservationStatus === "seated" || detailReservationStatus === "completed";

    useEffect(() => {
        if (!isDrawerOpen || !tenantId || !detailReservationId || !detailHasSeating) {
            setDetailSeating(undefined);
            return;
        }
        let alive = true;
        setDetailSeating(undefined);
        (async () => {
            try {
                const seating = await getSeatingForReservation(detailReservationId, tenantId, {
                    // Una prenotazione conclusa ha una tavolata CHIUSA: senza
                    // questo la si cercherebbe solo fra le aperte e non la si
                    // troverebbe mai. Sola lettura: nessun gesto parte da qui.
                    includeClosed: detailReservationStatus === "completed"
                });
                if (!alive) return;
                if (!seating) {
                    setDetailSeating({ id: null, view: null, partySize: null, pending: undefined });
                    return;
                }
                const [rows, state] = await Promise.all([
                    listSeatingTables(seating.id, tenantId),
                    getSeatingState(seating.id, tenantId)
                ]);
                if (!alive) return;
                setDetailSeating({
                    id: seating.id,
                    view: seatingTableView(rows),
                    partySize: seating.party_size,
                    pending: state
                        ? {
                              pending_orders_count: state.pending_orders_count,
                              pending_orders_deliverable: state.pending_orders_deliverable
                          }
                        : undefined
                });
            } catch {
                if (!alive) return;
                // Non si ripiega su `{ id: null }` in silenzio: "non c'è
                // tavolata" e "non sono riuscito a leggerla" portano
                // l'operatore a due conclusioni diverse.
                setDetailSeating({ id: null, view: null, partySize: null, pending: undefined });
                showToast({ message: "Errore nel caricamento della tavolata.", type: "error" });
            }
        })();
        return () => {
            alive = false;
        };
    }, [isDrawerOpen, tenantId, detailReservationId, detailReservationStatus, detailHasSeating, seatingReloadToken, showToast]);

    /** L'etichetta di un tavolo: dalla sala della sede, poi dalle assegnazioni. */
    const tableLabel = useCallback(
        (tableId: string, forActivityId: string | null): string => {
            const fromTables = (forActivityId ? tablesByActivity.get(forActivityId) : undefined)?.find(
                t => t.id === tableId
            )?.label;
            if (fromTables) return fromTables;
            const fromAssignments = tableAssignments.find(a => a.table_id === tableId)?.table?.label;
            return fromAssignments ?? "sconosciuto";
        },
        [tablesByActivity, tableAssignments]
    );

    const labelForTableId = useCallback(
        (tableId: string): string => tableLabel(tableId, selectedActivityId),
        [tableLabel, selectedActivityId]
    );

    // "Cambia tavolo" sceglie la destinazione dallo STATO della prenotazione,
    // non da dove si trova il bottone: prima del servizio riscrive il piano,
    // da quando sono seduti sposta la tavolata. La regola è la stessa che
    // decide cosa disegnare (`tableSection.ts`), così bottone e scrittura non
    // possono divergere.
    const handleSetTables = useCallback(
        async (tableIds: string[]): Promise<boolean> => {
            if (!selectedReservation || !tenantId) return false;
            const seatingId = detailSeating === undefined ? undefined : detailSeating.id;
            const target = tableWriteTargetFor({
                status: selectedReservation.status,
                seatingId,
                canManage: canManageActivity(selectedReservation.activity_id),
                canManageSeatings: canManageSeatingsOn(selectedReservation.activity_id)
            });

            if (target === null || (target === "seating" && !seatingId)) {
                // La tavolata non si trova (o il permesso è cambiato sotto le
                // mani). NON si ripiega sul piano: scrivere nel posto
                // sbagliato perché quello giusto non risponde produce due
                // verità. Stessa reazione di `handleCompleteService`.
                await loadData();
                setSeatingReloadToken(t => t + 1);
                showToast({
                    message:
                        selectedReservation.status === "seated"
                            ? "Nessuna tavolata aperta per questa prenotazione."
                            : "Questa prenotazione non accetta più cambi di tavolo.",
                    type: "error"
                });
                return false;
            }

            try {
                if (target === "seating" && seatingId) {
                    await setSeatingTables(seatingId, tableIds, tenantId);
                    setSeatingReloadToken(t => t + 1);
                } else {
                    await setReservationTables(selectedReservation.id, tableIds, tenantId);
                }
                await loadData();
                const labels = formatTableLabels(tableIds.map(labelForTableId));
                showToast({
                    message:
                        target === "seating"
                            ? // Frase intera invece di "Tavolo 4: tavolata spostata": lo
                              // spostamento è il fatto, il tavolo è dove è finito.
                              // `formatTableLabels` produce "Tavolo 4" o "Tavoli 3 + 4",
                              // quindi l'articolo va concordato col numero di tavoli.
                              `Tavolata spostata a${tableIds.length > 1 ? "i" : "l"} ${labels}.`
                            : `${labels}: assegnazione confermata.`,
                    type: "success"
                });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [
            selectedReservation,
            tenantId,
            detailSeating,
            canManageActivity,
            canManageSeatingsOn,
            loadData,
            showToast,
            labelForTableId
        ]
    );

    const handleResetTables = useCallback(async (): Promise<boolean> => {
        if (!selectedReservation || !tenantId) return false;
        try {
            const outcomes = await resetReservationTablesToSystem(selectedReservation.id, tenantId);
            await loadData();
            const assigned = outcomes
                .filter(o => o.assigned && o.table_id)
                .map(o => labelForTableId(o.table_id as string));
            showToast({
                message:
                    assigned.length > 0
                        ? `Il sistema propone ${formatTableLabels(assigned)}.`
                        : "Nessun tavolo libero in questa fascia: la prenotazione resta senza tavolo.",
                type: "info"
            });
            return true;
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore inatteso",
                type: "error"
            });
            return false;
        }
    }, [selectedReservation, tenantId, loadData, showToast, labelForTableId]);

    // ── Gesti della tavolata ──────────────────────────────────────────
    // Immediati, non differiti come `handleAction`: in sala cinque secondi di
    // finestra di annullamento sono cinque secondi in cui il tavolo risulta
    // libero a chiunque altro stia guardando. Stessa forma di
    // `handleSetTables`: RPC → loadData → toast, drawer aperto.

    const handleArrive = useCallback(async (): Promise<boolean> => {
        if (!selectedReservation || !tenantId) return false;
        try {
            await openSeatingForReservation(selectedReservation.id, tenantId);
            await loadData();
            showToast({ message: "Ospite al tavolo.", type: "success" });
            return true;
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore inatteso",
                type: "error"
            });
            return false;
        }
    }, [selectedReservation, tenantId, loadData, showToast]);

    // Chiusura e annullamento partono dalla prenotazione, non dalla tavolata:
    // il drawer conosce la prima e non la seconda. La si risolve al momento
    // del gesto invece di tenerla in stato — una tavolata caricata all'apertura
    // del drawer sarebbe già vecchia quando l'host preme il bottone.
    const resolveOpenSeatingId = useCallback(async (): Promise<string | null> => {
        if (!selectedReservation || !tenantId) return null;
        const seating = await getSeatingForReservation(selectedReservation.id, tenantId);
        return seating?.id ?? null;
    }, [selectedReservation, tenantId]);

    const handleCompleteService = useCallback(
        async (action?: SeatingCloseAction): Promise<boolean> => {
            if (!tenantId) return false;
            try {
                const seatingId = await resolveOpenSeatingId();
                if (!seatingId) {
                    // Nessuna tavolata aperta ma la prenotazione risulta
                    // `seated`: è una divergenza, e ricaricare è il modo di
                    // vederla invece di insistere su una riga che non c'è.
                    await loadData();
                    showToast({
                        message: "Nessuna tavolata aperta per questa prenotazione.",
                        type: "error"
                    });
                    return false;
                }
                await closeSeating(seatingId, "operator", tenantId, action);
                await loadData();
                showToast({ message: "Servizio concluso.", type: "success" });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                // La tavolata può essere cambiata sotto le mani (un ordine
                // arrivato mentre si chiudeva): si rilegge, così la prossima
                // pressione fa la domanda giusta.
                setSeatingReloadToken(t => t + 1);
                return false;
            }
        },
        [tenantId, resolveOpenSeatingId, loadData, showToast]
    );

    const handleUndoArrival = useCallback(async (): Promise<boolean> => {
        if (!tenantId) return false;
        try {
            const seatingId = await resolveOpenSeatingId();
            if (!seatingId) {
                await loadData();
                showToast({
                    message: "Nessuna tavolata aperta per questa prenotazione.",
                    type: "error"
                });
                return false;
            }
            await undoSeating(seatingId, tenantId);
            await loadData();
            // §48.2/1: nessuna conferma, e il toast dice come si ripara.
            showToast({ message: "Apertura annullata. Per riaprirla: Arrivato.", type: "info" });
            return true;
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore inatteso",
                type: "error"
            });
            return false;
        }
    }, [tenantId, resolveOpenSeatingId, loadData, showToast]);

    // I coperti reali dal drawer della PRENOTAZIONE (forma `seated`): scrive
    // sulla tavolata collegata, mai su `reservations.party_size`.
    const handleSetSeatingPartySizeFromReservation = useCallback(
        async (partySize: number): Promise<boolean> => {
            if (!tenantId) return false;
            const seatingId = detailSeating?.id ?? null;
            if (!seatingId) {
                await loadData();
                setSeatingReloadToken(t => t + 1);
                showToast({
                    message: "Nessuna tavolata aperta per questa prenotazione.",
                    type: "error"
                });
                return false;
            }
            try {
                const row = await setSeatingPartySize(seatingId, partySize, tenantId);
                setDetailSeating(prev =>
                    prev && prev.id === seatingId ? { ...prev, partySize: row.party_size } : prev
                );
                onSalaChangedRef.current?.();
                showToast({ message: `Coperti al tavolo: ${partySize}.`, type: "success" });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [tenantId, detailSeating, loadData, showToast]
    );

    return {
        tenantId,
        // Dati
        effectiveReservations,
        reservationsById,
        pendingTruncated,
        activities,
        activityNames,
        operatorNames,
        tableViews,
        tablesByActivity,
        tableLabel,
        isLoading,
        hasLoadedOnce,
        loadData,
        // Permessi
        canManageActivity,
        canManageSeatingsOn,
        tenantWide,
        manageableActivities,
        // Gesti differiti
        handleAction,
        // Dettaglio
        isDrawerOpen,
        selectedReservation,
        selectedActivity,
        selectedTables,
        selectedTableOccupancy,
        detailSeating,
        detailGuest,
        detailGuestNote,
        handleOpenDetail,
        handleCloseDrawer,
        handleSetTables,
        handleResetTables,
        handleArrive,
        handleCompleteService,
        handleUndoArrival,
        handleSetSeatingPartySizeFromReservation,
        // Crea / modifica
        isCreateEditOpen,
        createEditMode,
        editingReservation,
        handleOpenCreate,
        handleOpenEdit,
        handleCloseCreateEdit,
        handleCreateEditSuccess,
        setFormDate
    };
}

export type ReservationDesk = ReturnType<typeof useReservationDesk>;
