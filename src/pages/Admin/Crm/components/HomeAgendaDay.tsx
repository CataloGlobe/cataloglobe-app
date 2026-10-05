import { useMemo, useState } from "react";
import { Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { listCrmAppointments } from "@/services/supabase/crmAgenda";
import { listCrmMessagesSince } from "@/services/supabase/crmWhatsappAgent";
import type { CrmAgentDraftRow, CrmVenueListItem } from "@/types/crm";
import { romeTodayStart } from "@/utils/crm/agentsOverview";
import { dayTimeline, timelineHours } from "@/utils/crm/crmHome";
import { TimelineItem } from "./HomeParts";
import { romeParts } from "@shared/crmCallSlots";
import { useCrmLoad } from "../hooks/useCrmLoad";
import { TileState } from "./TileState";
import styles from "../Home.module.scss";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "numeric", minute: "2-digit" });

/**
 * L'Agenda di oggi ingrandita (canvas R3b): la giornata ora per ora, con
 * messaggi partiti e arrivati, lead nuovi, bozze in attesa, telefonate e
 * messaggi in programma. Le ore vuote si stringono; la riga rossa è adesso.
 */
export function HomeAgendaDay({
    now,
    venues,
    drafts,
    nameOf,
    onCollapse
}: {
    now: Date;
    venues: CrmVenueListItem[];
    drafts: CrmAgentDraftRow[];
    nameOf: (userId: string | null) => string | null;
    onCollapse: () => void;
}) {
    const [offset, setOffset] = useState(0);
    const [retry, setRetry] = useState(0);
    // Da mezzogiorno di oggi: i giorni da 23 o 25 ore dei cambi d'ora non spostano il conto.
    const noon = new Date(romeTodayStart(now)).getTime() + 12 * 60 * 60 * 1000;
    const dayStart = romeTodayStart(new Date(noon + offset * DAY_MS));
    const dayEnd = romeTodayStart(new Date(noon + (offset + 1) * DAY_MS));

    const messages = useCrmLoad(() => listCrmMessagesSince(dayStart), `${dayStart}-${retry}`);
    const appointments = useCrmLoad(() => listCrmAppointments(dayStart, dayEnd), `${dayStart}-${retry}`);

    const events = useMemo(
        () =>
            dayTimeline({
                dayStart,
                dayEnd,
                venues,
                messages: messages.data ?? [],
                drafts,
                appointments: appointments.data ?? [],
                nameOf
            }),
        [dayStart, dayEnd, venues, messages.data, drafts, appointments.data, nameOf]
    );

    const isToday = offset === 0;
    const nowHour = romeParts(now).hour;
    const nowIso = now.toISOString();
    const hours = useMemo(() => {
        const all = timelineHours(events);
        const busy = new Set(events.map(e => e.hour));
        // Le ore vuote si stringono: restano la prima, l'ultima e quella di adesso.
        return all.filter(
            (h, i) => busy.has(h) || i === 0 || i === all.length - 1 || (isToday && h === nowHour)
        );
    }, [events, isToday, nowHour]);

    const title = offset === 0 ? "Agenda di oggi, ora per ora" : offset === -1 ? "Agenda di ieri" : "Agenda di domani";

    return (
        <Card
            title={title}
            subtitle="Telefonate, messaggi partiti, cose in attesa"
            actions={
                <span className={styles.dayNav}>
                    <Button variant="secondary" size="sm" onClick={() => setOffset(o => o - 1)} disabled={offset <= -1}>
                        ‹ Ieri
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setOffset(o => o + 1)} disabled={offset >= 1}>
                        Domani ›
                    </Button>
                    <IconButton
                        variant="ghost"
                        size="sm"
                        icon={<Minimize2 size={16} />}
                        aria-label="Riduci Agenda di oggi"
                        aria-expanded
                        onClick={onCollapse}
                    />
                </span>
            }
            flush
            className={styles.tileExpanded}
        >
            <TileState
                loading={messages.loading || appointments.loading}
                error={appointments.error ?? messages.error}
                onRetry={() => setRetry(r => r + 1)}
            >
                <ol className={styles.timeline}>
                    {hours.map(h => {
                        const inHour = events.filter(e => e.hour === h);
                        const showNow = isToday && h === nowHour;
                        const before = showNow ? inHour.filter(e => e.at <= nowIso) : inHour;
                        const after = showNow ? inHour.filter(e => e.at > nowIso) : [];
                        return (
                            <li key={h} className={styles.hourRow}>
                                <Text as="span" variant="caption" colorVariant="muted" className={styles.hourLabel}>
                                    {h}:00
                                </Text>
                                <div className={styles.hourEvents}>
                                    {before.map(e => (
                                        <TimelineItem key={e.key} event={e} />
                                    ))}
                                    {showNow && (
                                        <div className={styles.nowLine} role="presentation">
                                            <Text as="span" variant="caption-xs" weight={700} className={styles.nowLabel}>
                                                {HOUR.format(now)}
                                            </Text>
                                        </div>
                                    )}
                                    {after.map(e => (
                                        <TimelineItem key={e.key} event={e} />
                                    ))}
                                </div>
                            </li>
                        );
                    })}
                </ol>
                <Text as="p" variant="caption" colorVariant="muted" className={styles.tileFootnote}>
                    {events.length === 0
                        ? "Niente in questa giornata."
                        : "Le ore vuote si stringono: si vede solo la giornata che conta."}
                </Text>
            </TileState>
        </Card>
    );
}
