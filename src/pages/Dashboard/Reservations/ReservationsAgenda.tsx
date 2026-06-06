import { useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import { addDays, todayIsoDate } from "@/utils/dateLocal";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
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

const TERMINAL = new Set<V2Reservation["status"]>(["declined", "cancelled"]);

// ── Date helpers (local to this view; shared primitives in @utils/dateLocal)

function isoDateOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(n => parseInt(n, 10));
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Monday of the ISO-style week (Mon..Sun) containing `d`. */
function mondayOf(d: Date): Date {
    const day = d.getDay(); // 0=Sun..6=Sat
    const shift = day === 0 ? -6 : 1 - day; // back to Mon
    return addDays(d, shift);
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

function statusBadgeFor(status: V2Reservation["status"]): {
    variant: StatusBadgeVariant;
    label: string;
} {
    switch (status) {
        case "confirmed":
            return { variant: "success", label: "Confermata" };
        case "pending":
            return { variant: "warning", label: "In attesa" };
        case "declined":
            return { variant: "neutral", label: "Rifiutata" };
        case "cancelled":
            return { variant: "neutral", label: "Annullata" };
    }
}

/** Status tone used by the Settimana grid chips. Mirrors StatusBadge palette. */
function statusToneFor(status: V2Reservation["status"]): "confirmed" | "pending" | "terminal" {
    if (status === "confirmed") return "confirmed";
    if (status === "pending") return "pending";
    return "terminal";
}

const WEEKDAY_ABBR_IT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

// ── Component ───────────────────────────────────────────────────────────────

export default function ReservationsAgenda({
    items,
    activityName,
    onOpenDetail
}: Props) {
    const [mode, setMode] = useState<ViewMode>("days");
    const [showTerminal, setShowTerminal] = useState(false);
    const [weekOffset, setWeekOffset] = useState(0);
    const today = todayIsoDate();

    // ── Range derivation ────────────────────────────────────────────────────
    const todayDate = useMemo(() => parseLocalDate(today), [today]);
    const weekStart = useMemo(
        () => addDays(mondayOf(todayDate), weekOffset * 7),
        [todayDate, weekOffset]
    );
    const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
    const weekStartIso = useMemo(() => isoDateOf(weekStart), [weekStart]);
    const weekEndIso = useMemo(() => isoDateOf(weekEnd), [weekEnd]);
    const rangeLabel = useMemo(
        () => formatRangeLabel(weekStart, weekEnd),
        [weekStart, weekEnd]
    );

    // Range filter replaces the old `>= today` gate so the user can navigate
    // backward in time. Dataset is already filtered upstream by tenant scope +
    // channel, so this is a pure date-window narrowing.
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

    const coversFor = (list: V2Reservation[]) =>
        list.filter(r => r.status === "confirmed").reduce((s, r) => s + r.party_size, 0);

    const hasAnyTerminal = rangeItems.some(r => TERMINAL.has(r.status));

    const sortedDates = useMemo(
        () => Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b)),
        [byDate]
    );

    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    );

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

    // ── Navigator + mode + terminal toggle ──────────────────────────────────
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

            <div className={styles.weekNav} role="group" aria-label="Naviga settimana">
                {weekOffset !== 0 && (
                    <>
                        <button
                            type="button"
                            className={styles.weekNavToday}
                            aria-label="Torna a oggi"
                            onClick={() => setWeekOffset(0)}
                        >
                            Oggi
                        </button>
                        <span
                            className={styles.weekNavDivider}
                            aria-hidden="true"
                        />
                    </>
                )}
                <button
                    type="button"
                    className={styles.weekNavArrow}
                    aria-label="Settimana precedente"
                    onClick={() => setWeekOffset(o => o - 1)}
                >
                    <ChevronLeft size={16} strokeWidth={2} />
                </button>
                <span className={styles.weekNavLabel} aria-live="polite">
                    {rangeLabel}
                </span>
                <button
                    type="button"
                    className={styles.weekNavArrow}
                    aria-label="Settimana successiva"
                    onClick={() => setWeekOffset(o => o + 1)}
                >
                    <ChevronRight size={16} strokeWidth={2} />
                </button>
            </div>

            {hasAnyTerminal && (
                <label
                    className={styles.agendaTerminalSwitch}
                    title="Mostra annullate e rifiutate"
                >
                    <input
                        type="checkbox"
                        role="switch"
                        className={styles.agendaTerminalSwitchInput}
                        checked={showTerminal}
                        onChange={e => setShowTerminal(e.target.checked)}
                        aria-label="Mostra annullate e rifiutate"
                    />
                    <span className={styles.agendaTerminalSwitchTrack} aria-hidden="true">
                        <span className={styles.agendaTerminalSwitchThumb} />
                    </span>
                    <span className={styles.agendaTerminalSwitchLabel}>Annullate</span>
                </label>
            )}
        </div>
    );

    // ── Days view row ───────────────────────────────────────────────────────
    const renderTimelineRow = (r: V2Reservation) => {
        const isTerminal = TERMINAL.has(r.status);
        const badge = statusBadgeFor(r.status);
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
                    <span className={styles.timelineTitleLine}>
                        <ChannelMark source={r.source} variant="plain" />
                        <span className={styles.timelineName}>
                            {r.customer_name}
                        </span>
                        <span className={styles.timelineNameMeta}>
                            · {r.party_size}{" "}
                            {r.party_size === 1 ? "persona" : "persone"}
                        </span>
                    </span>
                    {r.notes && (
                        <div className={styles.rowNote}>
                            <MessageSquare
                                size={13}
                                strokeWidth={2}
                                aria-hidden
                                className={styles.rowNoteIconInline}
                            />
                            <span className={styles.rowNoteText}>{r.notes}</span>
                        </div>
                    )}
                </span>
                <span className={styles.timelineMeta}>
                    <StatusBadge variant={badge.variant} label={badge.label} />
                </span>
            </button>
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
                    <div className={styles.emptyState}>
                        <EmptyState
                            icon={<CalendarRange size={40} strokeWidth={1.5} />}
                            title="Nessuna prenotazione in questo periodo"
                            description="Naviga ad altre settimane con le frecce in alto, oppure torna a oggi."
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
                    Include le prenotazioni online e quelle inserite a mano. Le prenotazioni
                    prese altrove e non registrate qui non compaiono.
                </p>
            </div>
        );
    }

    // ── Render: Week grid ───────────────────────────────────────────────────
    const renderWeekChip = (r: V2Reservation) => {
        const tone = statusToneFor(r.status);
        const badge = statusBadgeFor(r.status);
        return (
            <button
                key={r.id}
                type="button"
                className={styles.weekChip}
                data-tone={tone}
                onClick={() => onOpenDetail(r)}
                aria-label={`${r.customer_name} ${r.reservation_time.slice(0, 5)} · ${badge.label}`}
                title={`${badge.label} — ${r.customer_name} · ${r.party_size}`}
            >
                <span className={styles.weekChipTime}>
                    {r.reservation_time.slice(0, 5)}
                </span>
                <span className={styles.weekChipName}>
                    {r.customer_name} · {r.party_size}
                </span>
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
                                    <span className={styles.weekColLabel}>
                                        {WEEKDAY_ABBR_IT[idx]}
                                    </span>
                                    <span className={styles.weekColNum}>{d.getDate()}</span>
                                </div>
                                <div className={styles.weekColBody}>
                                    {filtered.length === 0 ? (
                                        <span className={styles.weekColEmpty} aria-hidden>
                                            —
                                        </span>
                                    ) : (
                                        filtered.map(renderWeekChip)
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <p className={styles.agendaDisclaimer}>
                Include le prenotazioni online e quelle inserite a mano. Le prenotazioni
                prese altrove e non registrate qui non compaiono.
            </p>
        </div>
    );
}
