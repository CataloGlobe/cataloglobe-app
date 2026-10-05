import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listCrmTeamMembers, listCrmVenues } from "@/services/supabase/crm";
import { getCrmAgendaSettings, listCrmAppointments, listCrmCallsWithoutOutcome } from "@/services/supabase/crmAgenda";
import { listCrmMessagesSince, listCrmQueuedMessages } from "@/services/supabase/crmWhatsappAgent";
import { CRM_APPOINTMENT_STATUS_VARIANT } from "@/utils/crm/agenda";
import {
    agendaDayItems,
    agendaWeek,
    dayBounds,
    nowLineIndex,
    shiftDayKey,
    tomorrowLine,
    weekMonthLabel,
    weekStartKey
} from "@/utils/crm/agendaDay";
import { formatCallDay, formatCallTime, romeDayKey } from "@shared/crmCallSlots";
import { AgendaSettingsDrawer } from "./AgendaSettingsDrawer";
import { AgendaDayList, AgendaWeekStrip } from "./components/AgendaParts";
import { TileState } from "./components/TileState";
import { useCrmLoad } from "./hooks/useCrmLoad";
import styles from "./Agenda.module.scss";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Agenda (canvas T8c): la settimana in una striscia, la giornata scelta in
 * ordine d'ora con la riga di adesso, e sotto la prima telefonata di domani.
 * In cima le telefonate passate senza esito. Ogni pezzo carica da solo; le
 * telefonate si fissano dalla scheda del lead, «Sposta» ci porta.
 */
export default function AgendaPage() {
    usePageTitle("Agenda");
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [tick, setTick] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Adesso si rilegge con «Riprova» o dopo un salvataggio: niente orologio che scorre.
    const now = useMemo(() => new Date(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
    const today = romeDayKey(now);
    const rawDay = params.get("giorno");
    const selected = rawDay && DAY_KEY.test(rawDay) ? rawDay : today;
    const weekStart = weekStartKey(selected);
    const day = dayBounds(selected);
    // Fino al lunedì dopo: così «Domani» c'è anche di domenica.
    const rangeStart = dayBounds(weekStart).start;
    const rangeEnd = dayBounds(shiftDayKey(weekStart, 8)).start;

    const appointments = useCrmLoad(() => listCrmAppointments(rangeStart, rangeEnd), `${weekStart}:${tick}`);
    const sent = useCrmLoad(
        () => (day.start <= now.toISOString() ? listCrmMessagesSince(day.start) : Promise.resolve([])),
        `${selected}:${tick}`
    );
    const queued = useCrmLoad(() => listCrmQueuedMessages(200), tick);
    const venues = useCrmLoad(listCrmVenues, tick);
    const team = useCrmLoad(listCrmTeamMembers, tick);
    const toClose = useCrmLoad(() => listCrmCallsWithoutOutcome(now.toISOString()), tick);
    const settings = useCrmLoad(getCrmAgendaSettings, tick);

    const retry = useCallback(() => setTick(t => t + 1), []);
    const pick = useCallback(
        (key: string) =>
            setParams(
                p => {
                    const next = new URLSearchParams(p);
                    if (key === romeDayKey(new Date())) next.delete("giorno");
                    else next.set("giorno", key);
                    return next;
                },
                { replace: true }
            ),
        [setParams]
    );

    const nameOf = useCallback((userId: string | null) => team.data?.find(m => m.user_id === userId)?.display_name ?? null, [team.data]);

    const openSettings = useCallback(() => setSettingsOpen(true), []);
    const settingsReady = settings.data !== null;
    // MEMOIZZATO: usePageHeader confronta `actions` per reference.
    const headerActions = useMemo(
        () => (
            <Button variant="secondary" onClick={openSettings} disabled={!settingsReady}>
                Impostazioni
            </Button>
        ),
        [openSettings, settingsReady]
    );
    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({ primaryAction: { label: "Impostazioni", onClick: openSettings, emphasis: "secondary" } }),
        [openSettings]
    );
    usePageHeader({
        title: "Agenda",
        actions: headerActions,
        compact: headerCompact
    });

    const weekDays = agendaWeek(weekStart, today, appointments.data ?? []);
    const dayLoading = (appointments.loading && !appointments.data) || (sent.loading && !sent.data);
    const dayError = appointments.error ?? sent.error;
    const items =
        appointments.data && sent.data
            ? agendaDayItems({
                  dayStart: day.start,
                  dayEnd: day.end,
                  now,
                  venues: venues.data ?? [],
                  sent: sent.data,
                  queued: queued.data ?? [],
                  appointments: appointments.data,
                  nameOf
              })
            : [];
    const nowIndex = nowLineIndex(items, day.start, day.end, now);

    return (
        <div className={styles.page}>
            {toClose.data && toClose.data.length > 0 && (
                <Card
                    title="Com'è andata?"
                    subtitle="Telefonate passate senza esito: aprila e scegli Fatta, Non ha risposto o Rimandata."
                    flush
                >
                    {toClose.data.map(a => {
                        const start = new Date(a.starts_at);
                        const caller = nameOf(a.caller_user_id);
                        return (
                            <ListRow
                                key={a.id}
                                to={`/admin/lead/${a.venue_id}`}
                                title={a.venue_name}
                                subtitle={`${formatCallDay(start)} alle ${formatCallTime(start)}${caller ? ` · chiama ${caller}` : ""}`}
                                trailing={<StatusBadge variant={CRM_APPOINTMENT_STATUS_VARIANT[a.status]} label="Esito da dire" />}
                            />
                        );
                    })}
                </Card>
            )}

            <AgendaWeekStrip
                days={weekDays}
                selected={selected}
                month={weekMonthLabel(weekStart)}
                showToday={selected !== today}
                onSelect={pick}
                onWeek={delta => pick(shiftDayKey(selected, delta * 7))}
                onToday={() => pick(today)}
            />

            <TileState
                loading={dayLoading}
                error={dayError}
                onRetry={retry}
                empty={items.length === 0}
                emptyText={
                    selected < today
                        ? "In questo giorno non è partito niente e non c'erano telefonate."
                        : "Niente in programma: nessuna telefonata e nessun messaggio in partenza."
                }
            >
                <AgendaDayList
                    items={items}
                    nowIndex={nowIndex}
                    now={now}
                    onMove={item => navigate(`/admin/lead/${item.venueId}?telefonata=sposta`)}
                />
            </TileState>

            {selected === today && appointments.data && (
                <Text variant="caption" colorVariant="muted" className={styles.tomorrow}>
                    {tomorrowLine(appointments.data, shiftDayKey(today, 1))}
                </Text>
            )}

            <AgendaSettingsDrawer
                open={settingsOpen}
                settings={settings.data}
                onClose={() => setSettingsOpen(false)}
                onSaved={async () => {
                    retry();
                    setSettingsOpen(false);
                    showToast({ message: "Impostazioni dell'agenda salvate.", type: "success" });
                }}
            />
        </div>
    );
}
