import { useMemo, useState } from "react";
import { CalendarRange, Globe, PencilLine } from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import type { V2Reservation } from "@/types/reservation";
import ChannelMark from "./ChannelMark";
import styles from "./Reservations.module.scss";

interface Props {
    /** Reservations belonging to the single selected activity, all statuses. */
    items: V2Reservation[];
    /** Activity name to render in headers (also serves as gate: null = "All sites"). */
    activityName: string | null;
    /** Click any row → open detail drawer. */
    onOpenDetail: (r: V2Reservation) => void;
}

type ViewMode = "days" | "week";

function todayIsoDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoDateOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(isoDate: string): string {
    const today = todayIsoDate();
    if (isoDate === today) return "Oggi";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isoDate === isoDateOf(tomorrow)) return "Domani";
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(dt);
}

function weekStripStart(anchor: string): Date[] {
    // Start of the 7-day strip = the anchor day itself, so the user always
    // sees the day they care about + next 6.
    const [y, m, d] = anchor.split("-").map(n => parseInt(n, 10));
    const start = new Date(y, (m ?? 1) - 1, d ?? 1);
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + i);
        out.push(dt);
    }
    return out;
}

const TERMINAL = new Set<V2Reservation["status"]>(["declined", "cancelled"]);

export default function ReservationsAgenda({
    items,
    activityName,
    onOpenDetail
}: Props) {
    const [mode, setMode] = useState<ViewMode>("days");
    const [showTerminal, setShowTerminal] = useState(false);
    const today = todayIsoDate();
    const [selectedWeekDay, setSelectedWeekDay] = useState<string>(today);

    if (!activityName) {
        return (
            <div className={styles.emptyState}>
                <EmptyState
                    icon={<CalendarRange size={40} strokeWidth={1.5} />}
                    title="Scegli una sede"
                    description="L'agenda mostra timeline e coperti di una sede specifica. Seleziona una sede dalla tendina in alto."
                />
            </div>
        );
    }

    // Future items only (>= today).
    const futureItems = useMemo(
        () => items.filter(r => r.reservation_date >= today),
        [items, today]
    );

    // Group by date.
    const byDate = useMemo(() => {
        const map = new Map<string, V2Reservation[]>();
        for (const r of futureItems) {
            const list = map.get(r.reservation_date) ?? [];
            list.push(r);
            map.set(r.reservation_date, list);
        }
        for (const list of map.values()) {
            list.sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));
        }
        return map;
    }, [futureItems]);

    const sortedDates = useMemo(
        () => Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b)),
        [byDate]
    );

    // Filter helper for terminal items.
    const visibleItems = (list: V2Reservation[]) =>
        showTerminal ? list : list.filter(r => !TERMINAL.has(r.status));

    // Helper for "covers" (sum party_size of confirmed only).
    const coversFor = (list: V2Reservation[]) =>
        list.filter(r => r.status === "confirmed").reduce((s, r) => s + r.party_size, 0);

    const hasAnyTerminal = futureItems.some(r => TERMINAL.has(r.status));

    const renderTimelineRow = (r: V2Reservation) => {
        const isTerminal = TERMINAL.has(r.status);
        return (
            <button
                key={r.id}
                type="button"
                className={isTerminal ? styles.timelineRowTerminal : styles.timelineRow}
                onClick={() => onOpenDetail(r)}
            >
                <span className={styles.timelineTime}>
                    {r.reservation_time.slice(0, 5)}
                </span>
                <span className={styles.timelineMain}>
                    <span className={styles.timelineName}>
                        <ChannelMark source={r.source} />
                        {r.customer_name} · {r.party_size}{" "}
                        {r.party_size === 1 ? "persona" : "persone"}
                    </span>
                    {r.notes && (
                        <span className={styles.timelineNote}>{r.notes}</span>
                    )}
                </span>
                <span className={styles.timelineMeta}>
                    <span className={styles.timelineCovers}>
                        {r.status === "confirmed" && "✓ Confermata"}
                        {r.status === "pending" && "In attesa"}
                        {r.status === "declined" && "Rifiutata"}
                        {r.status === "cancelled" && "Annullata"}
                    </span>
                </span>
            </button>
        );
    };

    const renderHeader = () => (
        <div className={styles.agendaHeader}>
            <div className={styles.agendaModeSwitch}>
                <button
                    type="button"
                    className={mode === "days" ? `${styles.agendaModeBtn} ${styles.agendaModeBtnActive}` : styles.agendaModeBtn}
                    onClick={() => setMode("days")}
                >
                    Giorni
                </button>
                <button
                    type="button"
                    className={mode === "week" ? `${styles.agendaModeBtn} ${styles.agendaModeBtnActive}` : styles.agendaModeBtn}
                    onClick={() => setMode("week")}
                >
                    Settimana
                </button>
            </div>

            {hasAnyTerminal && (
                <label className={styles.agendaTerminalToggle}>
                    <input
                        type="checkbox"
                        className={styles.agendaTerminalCheckbox}
                        checked={showTerminal}
                        onChange={e => setShowTerminal(e.target.checked)}
                    />
                    Mostra annullate / rifiutate
                </label>
            )}

            <div className={styles.channelLegend} aria-label="Legenda origine">
                <span className={styles.channelLegendItem}>
                    <span className={styles.channelLegendIcon}>
                        <Globe size={12} strokeWidth={2} aria-hidden />
                    </span>
                    online
                </span>
                <span className={styles.channelLegendItem}>
                    <span className={styles.channelLegendIcon}>
                        <PencilLine size={12} strokeWidth={2} aria-hidden />
                    </span>
                    a mano
                </span>
            </div>
        </div>
    );

    if (mode === "days") {
        const visibleDates = sortedDates.filter(
            d => visibleItems(byDate.get(d) ?? []).length > 0
        );

        if (visibleDates.length === 0) {
            return (
                <div className={styles.agenda}>
                    {renderHeader()}
                    <div className={styles.emptyState}>
                        <EmptyState
                            icon={<CalendarRange size={40} strokeWidth={1.5} />}
                            title="Nessuna prenotazione in agenda"
                            description="Le nuove richieste compariranno qui non appena i clienti prenoteranno online."
                        />
                    </div>
                    <p className={styles.agendaDisclaimer}>
                        Include prenotazioni ricevute online e inserite a mano dal team.
                    </p>
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
                    return (
                        <section key={date} className={styles.dayGroup}>
                            <div className={styles.dayHeader}>
                                <h3 className={styles.dayHeaderTitle}>
                                    {formatDayHeader(date)}
                                </h3>
                                <span className={styles.dayHeaderMeta}>
                                    {filtered.length}{" "}
                                    {filtered.length === 1 ? "prenotazione" : "prenotazioni"}
                                    {covers > 0 && ` · ~${covers} coperti`}
                                </span>
                            </div>
                            <div className={styles.timeline}>
                                {filtered.map(renderTimelineRow)}
                            </div>
                        </section>
                    );
                })}
                <p className={styles.agendaDisclaimer}>
                    Include le prenotazioni online e quelle inserite a mano. Le prenotazioni prese altrove e non registrate qui non compaiono.
                </p>
            </div>
        );
    }

    // Week mode
    const stripDays = weekStripStart(selectedWeekDay);
    const selectedList = byDate.get(selectedWeekDay) ?? [];
    const filteredSelected = visibleItems(selectedList);
    const covers = coversFor(selectedList);

    return (
        <div className={styles.agenda}>
            {renderHeader()}

            <div className={styles.weekStrip}>
                {stripDays.map(d => {
                    const iso = isoDateOf(d);
                    const hasItems = (byDate.get(iso) ?? []).length > 0;
                    const isActive = iso === selectedWeekDay;
                    return (
                        <button
                            key={iso}
                            type="button"
                            className={isActive ? `${styles.weekDay} ${styles.weekDayActive}` : styles.weekDay}
                            onClick={() => setSelectedWeekDay(iso)}
                        >
                            <span className={styles.weekDayLabel}>
                                {new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(d)}
                            </span>
                            <span className={styles.weekDayNum}>{d.getDate()}</span>
                            {hasItems && <span className={styles.weekDayDot} />}
                        </button>
                    );
                })}
            </div>

            <section className={styles.dayGroup}>
                <div className={styles.dayHeader}>
                    <h3 className={styles.dayHeaderTitle}>
                        {formatDayHeader(selectedWeekDay)}
                    </h3>
                    <span className={styles.dayHeaderMeta}>
                        {filteredSelected.length}{" "}
                        {filteredSelected.length === 1 ? "prenotazione" : "prenotazioni"}
                        {covers > 0 && ` · ~${covers} coperti`}
                    </span>
                </div>
                {filteredSelected.length === 0 ? (
                    <p className={styles.agendaDisclaimer}>Nessuna prenotazione in questo giorno.</p>
                ) : (
                    <div className={styles.timeline}>
                        {filteredSelected.map(renderTimelineRow)}
                    </div>
                )}
            </section>

            <p className={styles.agendaDisclaimer}>
                Include le prenotazioni online e quelle inserite a mano. Le prenotazioni prese altrove e non registrate qui non compaiono.
            </p>
        </div>
    );
}
