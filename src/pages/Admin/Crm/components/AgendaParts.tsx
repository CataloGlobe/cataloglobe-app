import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import Text from "@/components/ui/Text/Text";
import type { AgendaItem, AgendaWeekColumn, AgendaWeekDay } from "@/utils/crm/agendaDay";
import { formatCallTime } from "@shared/crmCallSlots";
import styles from "../Agenda.module.scss";

/**
 * La striscia della settimana (T8c): sette giorni, il puntino dove c'è una
 * telefonata, il giorno scelto in un riquadro scuro. Le frecce cambiano
 * settimana; «Oggi» torna a oggi quando si è altrove.
 */
export function AgendaWeekStrip({
    days,
    selected,
    month,
    showToday,
    onSelect,
    onWeek,
    onToday
}: {
    days: AgendaWeekDay[];
    selected: string;
    month: string;
    showToday: boolean;
    onSelect: (key: string) => void;
    onWeek: (delta: number) => void;
    onToday: () => void;
}) {
    return (
        <div className={styles.week}>
            <div className={styles.weekHead}>
                <Text as="span" variant="body-sm" colorVariant="muted" className={styles.weekMonth}>
                    {month}
                </Text>
                {showToday && (
                    <Button variant="ghost" size="sm" onClick={onToday}>
                        Oggi
                    </Button>
                )}
                <IconButton
                    icon={<ChevronLeft size={16} />}
                    aria-label="Settimana prima"
                    variant="ghost"
                    size="sm"
                    onClick={() => onWeek(-1)}
                />
                <IconButton
                    icon={<ChevronRight size={16} />}
                    aria-label="Settimana dopo"
                    variant="ghost"
                    size="sm"
                    onClick={() => onWeek(1)}
                />
            </div>
            <div className={styles.weekDays} role="group" aria-label="Giorni della settimana">
                {days.map(d => (
                    <button
                        key={d.key}
                        type="button"
                        className={styles.weekDay}
                        data-selected={d.key === selected}
                        data-today={d.isToday || undefined}
                        aria-pressed={d.key === selected}
                        aria-label={`${d.weekday} ${d.day}${d.isToday ? ", oggi" : ""}${d.hasCalls ? ", con telefonate" : ""}`}
                        onClick={() => onSelect(d.key)}
                    >
                        <span className={styles.weekName}>
                            <Text as="span" variant="caption" color="inherit">
                                {d.weekday}
                            </Text>
                        </span>
                        <span className={styles.weekNumber}>
                            <Text as="span" variant="body" weight={700} color="inherit">
                                {d.day}
                            </Text>
                        </span>
                        <span className={styles.weekDot} data-on={d.hasCalls || undefined} aria-hidden="true" />
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * La giornata in ordine d'ora: ciò che è partito, ciò che parte da solo (spento,
 * «parte da solo») e le telefonate col filo brand, «Chiama» e «Sposta». Oggi la
 * riga rossa segna l'ora di adesso.
 */
export function AgendaDayList({
    items,
    nowIndex,
    now,
    onMove
}: {
    items: AgendaItem[];
    nowIndex: number | null;
    now: Date;
    onMove: (item: AgendaItem) => void;
}) {
    const nowLine = (
        <li className={styles.nowLine} aria-label={`Adesso, ${formatCallTime(now)}`}>
            <Text as="span" variant="caption" weight={600} color="inherit">
                {formatCallTime(now)}
            </Text>
            <span className={styles.nowRule} aria-hidden="true" />
        </li>
    );
    return (
        <ol className={styles.dayList}>
            {items.map((item, i) => (
                <Fragment key={item.key}>
                    {nowIndex === i && nowLine}
                    <li className={styles.item} data-kind={item.kind} data-past={item.past || undefined}>
                        <Text as="span" variant="body" weight={700} color="inherit" className={styles.itemTime}>
                            {item.time}
                        </Text>
                        <div className={styles.itemBody}>
                            {item.kind === "telefonata" ? (
                                <Link to={`/admin/lead/${item.venueId}`} className={styles.itemVenue}>
                                    <Text as="span" variant="body" weight={700} color="inherit">
                                        {item.venueName}
                                    </Text>
                                </Link>
                            ) : (
                                <Text as="span" variant="body" color="inherit">
                                    {item.before}{" "}
                                    <Link to={`/admin/lead/${item.venueId}`} className={styles.itemVenue}>
                                        <Text as="strong" variant="body" weight={item.kind === "programma" ? 400 : 700} color="inherit">
                                            {item.venueName}
                                        </Text>
                                    </Link>
                                </Text>
                            )}
                            {item.detail && (
                                <Text as="span" variant="caption" colorVariant="muted">
                                    {item.detail}
                                </Text>
                            )}
                            {item.appointment && (
                                <div className={styles.itemActions}>
                                    {item.phone && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => {
                                                window.location.href = `tel:${item.phone}`;
                                            }}
                                        >
                                            Chiama
                                        </Button>
                                    )}
                                    <Button variant="secondary" size="sm" onClick={() => onMove(item)}>
                                        Sposta
                                    </Button>
                                </div>
                            )}
                        </div>
                    </li>
                </Fragment>
            ))}
            {nowIndex === items.length && nowLine}
        </ol>
    );
}

const WEEK_KIND: Record<AgendaItem["kind"], string> = {
    telefonata: "telefonata",
    partito: "partito",
    programma: "parte da solo"
};

/**
 * La settimana a sette colonne (R4): ogni cosa nel suo giorno, a colpo
 * d'occhio. Il giorno in testa porta alla vista del giorno, il locale alla
 * sua scheda.
 */
export function AgendaWeekGrid({
    days,
    columns,
    loading = false,
    onOpenDay
}: {
    days: AgendaWeekDay[];
    columns: AgendaWeekColumn[];
    /** Mentre carica la griglia resta, coi giorni vuoti e senza «libero». */
    loading?: boolean;
    onOpenDay: (key: string) => void;
}) {
    return (
        <div className={styles.grid} role="group" aria-label="La settimana" aria-busy={loading || undefined}>
            {days.map((d, i) => {
                const items = columns[i]?.items ?? [];
                return (
                    <section key={d.key} className={styles.gridDay} data-today={d.isToday || undefined} aria-label={`${d.weekday} ${d.day}`}>
                        <button type="button" className={styles.gridHead} onClick={() => onOpenDay(d.key)} aria-label={`Apri ${d.weekday} ${d.day}`}>
                            <Text as="span" variant="caption" color="inherit">
                                {d.weekday}
                            </Text>
                            <Text as="span" variant="body" weight={700} color="inherit">
                                {d.day}
                            </Text>
                        </button>
                        {loading ? null : items.length === 0 ? (
                            <Text as="span" variant="caption" colorVariant="muted" className={styles.gridFree}>
                                libero
                            </Text>
                        ) : (
                            <ol className={styles.gridList}>
                                {items.map(item => (
                                    <li key={item.key} className={styles.gridItem} data-kind={item.kind} data-past={item.past || undefined}>
                                        <Link to={`/admin/lead/${item.venueId}`} className={styles.gridLink}>
                                            <Text as="span" variant="caption" weight={700} color="inherit">
                                                {item.time}
                                            </Text>{" "}
                                            <Text as="span" variant="caption" weight={600} color="inherit">
                                                {item.venueName}
                                            </Text>
                                        </Link>
                                        <Text as="span" variant="caption" colorVariant="muted">
                                            {WEEK_KIND[item.kind]}
                                        </Text>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

/** Le ore del giorno vuoto: la forma della giornata anche quando non c'è niente. */
const EMPTY_DAY_HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

/**
 * Il giorno senza niente in programma: la frase in testa e sotto le ore come
 * riquadri vuoti, così la pagina non resta bianca e si vede dove andrebbero
 * le telefonate.
 */
export function AgendaEmptyDay({ message, loading = false }: { message: string; loading?: boolean }) {
    return (
        <div className={styles.emptyDay} aria-busy={loading || undefined}>
            <Text as="p" variant="body-sm" colorVariant="muted" className={styles.emptyDayMessage}>
                {loading ? "Carico…" : message}
            </Text>
            <ol className={styles.emptyDayHours} aria-hidden="true">
                {EMPTY_DAY_HOURS.map(hour => (
                    <li key={hour} className={styles.emptyDayHour}>
                        <Text as="span" variant="caption" colorVariant="muted" className={styles.emptyDayTime}>
                            {hour}
                        </Text>
                        <span className={styles.emptyDaySlot} />
                    </li>
                ))}
            </ol>
        </div>
    );
}
