import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import Text from "@/components/ui/Text/Text";
import type { AgendaItem, AgendaWeekDay } from "@/utils/crm/agendaDay";
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
