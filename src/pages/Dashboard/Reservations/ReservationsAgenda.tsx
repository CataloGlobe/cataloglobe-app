import { useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import { addDays, todayIsoDate } from "@/utils/dateLocal";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Switch } from "@/components/ui/Switch/Switch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { OCCUPYING_STATUSES } from "@/utils/reservationTableConflicts";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import Text from "@/components/ui/Text/Text";
import { statusMeta } from "@/utils/reservationStatusMeta";
import {
    TableAssignmentBadge,
    type TableAssignmentView
} from "@/components/ui/TableAssignmentBadge/TableAssignmentBadge";
import { formatTableLabels } from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import type { V2Reservation } from "@/types/reservation";
import { agendaWeekRange } from "./loadWindow";
import ChannelMark from "./ChannelMark";
import GuestConfirmedMark from "./GuestConfirmedMark";
import { coversFor } from "./agendaCovers";
import styles from "./Reservations.module.scss";

interface Props {
    /**
     * Reservations belonging to the single selected activity, all statuses.
     * Il parent le ha chieste al server per la settimana `weekOffset` (più
     * oggi e i giorni aperti nei drawer): qui si filtra solo per sicurezza.
     */
    items: V2Reservation[];
    /**
     * Settimana mostrata, in settimane da quella di oggi. Vive nel parent
     * perché decide COSA si carica (FASE 5.2a): la settimana è la finestra
     * della fetch, non un dettaglio della vista.
     */
    weekOffset: number;
    onWeekOffsetChange: (next: number) => void;
    /** Tavoli assegnati per prenotazione (solo chi ne ha uno). Calcolato dal parent. */
    tableViews: ReadonlyMap<string, TableAssignmentView>;
    /** True se chi guarda ha `reservations.manage` sulla sede in scope. */
    canManage?: boolean;
    /**
     * Riorganizza i tavoli del giorno (RPC `reassign_activity_tables`).
     * Ritorna true se riuscita: il parent ha già ricaricato e mostrato il
     * toast col riepilogo. Assente = nessun bottone.
     */
    onReassignDay?: (date: string) => Promise<boolean>;
    /** Click any row → open detail drawer. */
    onOpenDetail: (r: V2Reservation) => void;
}

type ViewMode = "days" | "week";

// `no_show` NON sta qui, di proposito. `declined` e `cancelled` sono decisioni
// prese PRIMA del servizio: una volta prese non interessa più vederle. Un
// no-show è invece un fatto accaduto DURANTE quel servizio e fa parte di
// com'è andata la serata, quindi resta visibile nella vista del giorno —
// distinto dal badge "Non presentato". Vale anche per la correzione: annullare
// una marcatura sbagliata non deve stare dietro il toggle "mostra terminali".
//
// `completed` non ci sta per lo stesso motivo di `no_show`, e non per
// distrazione: una tavolata servita È com'è andata la serata, ed è proprio il
// dato che l'host guarda per capire quanto ha girato la sala. Nasconderla
// svuoterebbe la vista del giorno mano a mano che il servizio procede, fino a
// mostrare solo ciò che non è ancora successo. `seated`, ovviamente, resta.
const TERMINAL = new Set<V2Reservation["status"]>(["declined", "cancelled"]);

// ── Date helpers (local to this view; shared primitives in @utils/dateLocal)

function isoDateOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDayHeader(isoDate: string): string {
    const today = todayIsoDate();
    if (isoDate === today) return "Oggi";
    const t = parseLocalDate(today);
    if (isoDate === isoDateOf(addDays(t, 1))) return "Domani";
    if (isoDate === isoDateOf(addDays(t, -1))) return "Ieri";
    return new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(parseLocalDate(isoDate));
}

/** Short range label tuned for a compact toolbar.
 *  Same month → "1–7 giu". Cross-month same year → "30 giu – 6 lug".
 *  Cross-year → "29 dic 2026 – 4 gen 2027". */
function formatRangeLabel(start: Date, end: Date): string {
    const sameMonth =
        start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const sameYear = start.getFullYear() === end.getFullYear();
    if (sameMonth) {
        const monthShort = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(end);
        return `${start.getDate()}–${end.getDate()} ${monthShort}`;
    }
    if (sameYear) {
        const sMonth = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(start);
        const eMonth = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(end);
        return `${start.getDate()} ${sMonth} – ${end.getDate()} ${eMonth}`;
    }
    const fmt = new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
}

/**
 * Il tono della chip della Settimana viene dal dizionario unico (§14, §18.5):
 * la variante di `statusMeta`. Si sbiadiscono solo annullate e rifiutate —
 * «Servita» e «Non presentato» sono com'è andata la serata, non righe da
 * nascondere.
 */
function isDimmed(status: V2Reservation["status"]): boolean {
    return status === "cancelled" || status === "declined";
}

const WEEKDAY_ABBR_IT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

// ── Component ───────────────────────────────────────────────────────────────

export default function ReservationsAgenda({
    items,
    weekOffset,
    onWeekOffsetChange,
    tableViews,
    canManage = false,
    onReassignDay,
    onOpenDetail
}: Props) {
    const [mode, setMode] = useState<ViewMode>("days");
    // Giorno in attesa di conferma per "Riorganizza i tavoli".
    const [reassignDate, setReassignDate] = useState<string | null>(null);
    const [showTerminal, setShowTerminal] = useState(false);
    const today = todayIsoDate();

    // ── Range derivation ────────────────────────────────────────────────────
    // Stessa regola della finestra di caricamento: se divergessero, la
    // griglia mostrerebbe giorni che il server non ha mandato.
    const { from: weekStartIso, to: weekEndIso } = useMemo(
        () => agendaWeekRange(today, weekOffset),
        [today, weekOffset]
    );
    const weekStart = useMemo(() => parseLocalDate(weekStartIso), [weekStartIso]);
    const weekEnd = useMemo(() => parseLocalDate(weekEndIso), [weekEndIso]);
    const rangeLabel = useMemo(
        () => formatRangeLabel(weekStart, weekEnd),
        [weekStart, weekEnd]
    );

    // Il parent carica anche oggi e i giorni aperti nei drawer: qui restano
    // solo i sette della settimana.
    const rangeItems = useMemo(
        () =>
            items.filter(
                r =>
                    r.reservation_date >= weekStartIso &&
                    r.reservation_date <= weekEndIso
            ),
        [items, weekStartIso, weekEndIso]
    );

    const byDate = useMemo(() => {
        const map = new Map<string, V2Reservation[]>();
        for (const r of rangeItems) {
            const list = map.get(r.reservation_date) ?? [];
            list.push(r);
            map.set(r.reservation_date, list);
        }
        for (const list of map.values()) {
            list.sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));
        }
        return map;
    }, [rangeItems]);

    const visibleItems = (list: V2Reservation[]) =>
        showTerminal ? list : list.filter(r => !TERMINAL.has(r.status));

    // Quante prenotazioni del giorno la RPC rifarebbe (attive senza decisione
    // dell'operatore, comprese quelle ancora senza tavolo) e quante lascerebbe
    // stare (attive con assegnazione confermata). Stessi criteri della RPC,
    // sui dati già in memoria: il numero vero arriva poi nel toast.
    const reassignCounts = (list: V2Reservation[]) => {
        let redo = 0;
        let manual = 0;
        for (const r of list) {
            if (!OCCUPYING_STATUSES.has(r.status)) continue;
            const view = tableViews.get(r.id);
            if (view && !view.proposed) manual += 1;
            else redo += 1;
        }
        return { redo, manual };
    };
    const pendingReassign = reassignDate ? reassignCounts(byDate.get(reassignDate) ?? []) : null;

    const sortedDates = useMemo(
        () => Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b)),
        [byDate]
    );

    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    );

    // ── Navigator + mode + terminal filter ──────────────────────────────────
    // Giorni/Settimana, la settimana con ‹ › (e «Oggi» quando si è altrove),
    // e il filtro delle annullate: esplicito, col numero di quelle nascoste.
    const terminalCount = rangeItems.filter(r => TERMINAL.has(r.status)).length;
    const renderHeader = () => (
        <div className={styles.agendaHeader}>
            <SegmentedControl<ViewMode>
                value={mode}
                onChange={setMode}
                options={[
                    { value: "days", label: "Giorni" },
                    { value: "week", label: "Settimana" }
                ]}
            />

            {terminalCount > 0 && (
                <Switch
                    size="sm"
                    checked={showTerminal}
                    onChange={setShowTerminal}
                    ariaLabel="Mostra annullate e rifiutate"
                    description={`Annullate · ${terminalCount}`}
                    containerClassName={styles.agendaTerminalFilter}
                />
            )}

            <div className={styles.weekNav} role="group" aria-label="Naviga settimana">
                <IconButton
                    icon={<ChevronLeft size={16} strokeWidth={2} />}
                    aria-label="Settimana precedente"
                    size="sm"
                    onClick={() => onWeekOffsetChange(weekOffset - 1)}
                />
                <Text as="span" variant="body-sm" weight={600} className={styles.weekNavLabel} aria-live="polite">
                    {rangeLabel}
                </Text>
                <IconButton
                    icon={<ChevronRight size={16} strokeWidth={2} />}
                    aria-label="Settimana successiva"
                    size="sm"
                    onClick={() => onWeekOffsetChange(weekOffset + 1)}
                />
                {weekOffset !== 0 && (
                    <Button variant="outline" size="sm" onClick={() => onWeekOffsetChange(0)}>
                        Oggi
                    </Button>
                )}
            </div>
        </div>
    );

    const disclaimer = (
        <Text as="p" variant="caption" colorVariant="muted">
            Include le prenotazioni online e quelle inserite a mano. Le prenotazioni prese altrove e
            non registrate qui non compaiono.
        </Text>
    );

    // ── Days view row ───────────────────────────────────────────────────────
    // ListRow dense (48): l'agenda è un elenco lungo che si legge a colpo
    // d'occhio. Annullate e rifiutate (con l'interruttore acceso) sono
    // spente ma si aprono ancora: `muted` è solo l'aspetto.
    const renderTimelineRow = (r: V2Reservation) => {
        const badge = statusMeta(r.status);
        const tableView = tableViews.get(r.id);
        const people = `${r.party_size} ${r.party_size === 1 ? "persona" : "persone"}`;
        return (
            <ListRow
                key={r.id}
                dense
                onClick={() => onOpenDetail(r)}
                muted={isDimmed(r.status)}
                leading={
                    <Text
                        as="span"
                        variant="title-sm"
                        weight={600}
                        colorVariant={isDimmed(r.status) ? "muted" : "default"}
                        className={styles.timelineTime}
                    >
                        {r.reservation_time.slice(0, 5)}
                    </Text>
                }
                title={
                    <>
                        <ChannelMark source={r.source} variant="plain" /> {r.customer_name}
                    </>
                }
                subtitle={r.notes ? `${people} · ${r.notes}` : people}
                meta={
                    <>
                        <GuestConfirmedMark guestConfirmedAt={r.guest_confirmed_at} />
                        <StatusBadge variant={badge.variant} label={badge.label} />
                        {/* Nessun tavolo = nessun badge: è uno stato normale. */}
                        {tableView && <TableAssignmentBadge view={tableView} />}
                    </>
                }
                metaInline
            />
        );
    };

    // ── Render: Days ────────────────────────────────────────────────────────
    if (mode === "days") {
        const visibleDates = sortedDates.filter(
            d => visibleItems(byDate.get(d) ?? []).length > 0
        );

        if (visibleDates.length === 0) {
            return (
                <div className={styles.agenda}>
                    {renderHeader()}
                    <Card>
                        <EmptyState
                            variant="inline"
                            icon={<CalendarRange size={40} strokeWidth={1.5} />}
                            title="Nessuna prenotazione in questa settimana"
                            description="Passa a un'altra settimana con le frecce, o torna a oggi."
                        />
                    </Card>
                    {disclaimer}
                </div>
            );
        }

        return (
            <div className={styles.agenda}>
                {renderHeader()}
                {visibleDates.map(date => {
                    const list = byDate.get(date) ?? [];
                    const filtered = visibleItems(list);
                    const covers = coversFor(list);
                    // Attive senza tavolo né proposta: il numero che fa premere «Riorganizza».
                    const unassigned = list.filter(
                        r => OCCUPYING_STATUSES.has(r.status) && !tableViews.has(r.id)
                    ).length;
                    // Niente da rifare = niente bottone.
                    const showReassign =
                        canManage && onReassignDay !== undefined && reassignCounts(list).redo > 0;
                    const summary = [
                        `${filtered.length} ${filtered.length === 1 ? "prenotazione" : "prenotazioni"}`,
                        covers > 0 ? `~${covers} coperti` : null,
                        unassigned > 0 ? `${unassigned} senza tavolo` : null
                    ]
                        .filter(Boolean)
                        .join(" · ");
                    return (
                        <Card
                            key={date}
                            title={formatDayHeader(date)}
                            subtitle={summary}
                            actions={
                                showReassign ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        leftIcon={<RefreshCw size={14} strokeWidth={2} />}
                                        onClick={() => setReassignDate(date)}
                                    >
                                        Riorganizza i tavoli
                                    </Button>
                                ) : undefined
                            }
                            flush
                        >
                            {filtered.map(renderTimelineRow)}
                        </Card>
                    );
                })}
                {disclaimer}

                {/* Conferma sempre, anche per un giorno futuro: la RPC cancella e
                    rifà le proposte, e i numeri qui sotto dicono in anticipo cosa
                    tocca. Il riepilogo vero arriva nel toast. */}
                <ConfirmDialog
                    isOpen={reassignDate !== null}
                    onClose={() => setReassignDate(null)}
                    onConfirm={async () => {
                        if (!reassignDate || !onReassignDay) return false;
                        return onReassignDay(reassignDate);
                    }}
                    title={
                        reassignDate
                            ? `Riorganizzare i tavoli di ${formatDayHeader(reassignDate).toLowerCase()}?`
                            : "Riorganizzare i tavoli?"
                    }
                    message={
                        pendingReassign
                            ? `Rifarò le proposte per ${pendingReassign.redo} ${
                                  pendingReassign.redo === 1 ? "prenotazione" : "prenotazioni"
                              }. ${
                                  pendingReassign.manual === 0
                                      ? "Nessuna è stata sistemata a mano."
                                      : pendingReassign.manual === 1
                                        ? "Quella che hai sistemato a mano resta com'è."
                                        : `Le ${pendingReassign.manual} che hai sistemato a mano restano come sono.`
                              }`
                            : undefined
                    }
                    confirmLabel="Riorganizza"
                    confirmVariant="primary"
                />
            </div>
        );
    }

    // ── Render: Week grid ───────────────────────────────────────────────────
    const renderWeekChip = (r: V2Reservation) => {
        const badge = statusMeta(r.status);
        // La chip è già satura: il tavolo sta solo nel `title`. Il conflitto
        // invece si vede (§18.3): un segno ambra accanto all'ora.
        const tableView = tableViews.get(r.id);
        const conflict = tableView?.conflict ?? null;
        const tableTitle = tableView
            ? conflict
                ? ` · ${conflict.message}`
                : ` · ${formatTableLabels(tableView.labels)}${tableView.proposed ? " (proposto)" : ""}`
            : "";
        return (
            <button
                key={r.id}
                type="button"
                className={styles.weekChip}
                data-tone={badge.variant}
                data-dimmed={isDimmed(r.status) || undefined}
                onClick={() => onOpenDetail(r)}
                aria-label={`${r.customer_name} ${r.reservation_time.slice(0, 5)} · ${badge.label}${conflict ? ` · ${conflict.message}` : ""}`}
                title={`${badge.label} — ${r.customer_name} · ${r.party_size}${tableTitle}`}
            >
                <Text as="span" variant="caption-xs" weight={700} className={styles.weekChipTime}>
                    {r.reservation_time.slice(0, 5)}
                    {conflict && (
                        <TriangleAlert size={12} strokeWidth={2.25} className={styles.weekChipConflict} aria-hidden />
                    )}
                </Text>
                <Text as="span" variant="caption-xs" weight={500} className={styles.weekChipName}>
                    {r.customer_name} · {r.party_size}
                </Text>
            </button>
        );
    };

    return (
        <div className={styles.agenda}>
            {renderHeader()}

            <div className={styles.weekGridWrap}>
                <div className={styles.weekGrid}>
                    {weekDays.map((d, idx) => {
                        const iso = isoDateOf(d);
                        const isToday = iso === today;
                        const list = byDate.get(iso) ?? [];
                        const filtered = visibleItems(list);
                        return (
                            <div key={iso} className={styles.weekCol}>
                                <div
                                    className={
                                        isToday
                                            ? `${styles.weekColHeader} ${styles.weekColHeaderToday}`
                                            : styles.weekColHeader
                                    }
                                >
                                    <Text as="span" variant="caption-xs" className={styles.weekColLabel}>
                                        {WEEKDAY_ABBR_IT[idx]}
                                    </Text>
                                    <Text as="span" variant="title-sm" weight={600} className={styles.weekColNum}>
                                        {d.getDate()}
                                    </Text>
                                </div>
                                <div className={styles.weekColBody}>
                                    {filtered.length === 0 ? (
                                        <Text as="span" variant="body-sm" colorVariant="muted" className={styles.weekColEmpty} aria-hidden>
                                            —
                                        </Text>
                                    ) : (
                                        filtered.map(renderWeekChip)
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {disclaimer}
        </div>
    );
}
