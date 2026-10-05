import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { listCrmTeamMembers, listCrmVenues } from "@/services/supabase/crm";
import { getCrmAgendaSettings, listCrmAppointments, listCrmCallsWithoutOutcome } from "@/services/supabase/crmAgenda";
import { listCrmMessagesSince, listCrmQueuedMessages } from "@/services/supabase/crmWhatsappAgent";
import { CRM_APPOINTMENT_STATUS_VARIANT } from "@/utils/crm/agenda";
import {
    agendaDayItems,
    agendaWeek,
    agendaWeekItems,
    dayBounds,
    nowLineIndex,
    parseAgendaView,
    shiftDayKey,
    type AgendaView,
    tomorrowLine,
    weekMonthLabel,
    weekStartKey
} from "@/utils/crm/agendaDay";
import { formatCallDay, formatCallTime, romeDayKey } from "@shared/crmCallSlots";
import { AgendaSettingsDrawer } from "./AgendaSettingsDrawer";
import { AgendaDayList, AgendaWeekGrid, AgendaWeekStrip } from "./components/AgendaParts";
import { TileState } from "./components/TileState";
import { useCrmLoad } from "./hooks/useCrmLoad";
import styles from "./Agenda.module.scss";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Solo la preferenza di vista (giorno o settimana), mai un avviso. */
const VIEW_STORAGE = "crm-agenda-vista";

function readStoredView(): string | null {
    try {
        return localStorage.getItem(VIEW_STORAGE);
    } catch {
        return null;
    }
}

/**
 * Agenda (canvas T8c, ritocchi R3 e R4 del 2026-10-05). Due viste, scelte col
 * tasto in testata: la settimana a sette colonne (ogni cosa nel suo giorno) o
 * il giorno (la striscia, la giornata in ordine d'ora con la riga di adesso e,
 * a destra sugli schermi larghi, «Com'è andata?» e domani). Al telefono solo il
 * giorno. Ogni pezzo carica da solo; le telefonate si fissano dalla scheda del
 * lead, «Sposta» ci porta.
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
    const isPhone = useMediaQuery("(max-width: 767px)");
    const view = parseAgendaView(params.get("vista"), readStoredView(), isPhone);
    const isWeek = view === "settimana";
    const day = dayBounds(selected);
    // Fino al lunedì dopo: così «Domani» c'è anche di domenica.
    const rangeStart = dayBounds(weekStart).start;
    const rangeEnd = dayBounds(shiftDayKey(weekStart, 8)).start;

    const appointments = useCrmLoad(() => listCrmAppointments(rangeStart, rangeEnd), `${weekStart}:${tick}`);
    // La settimana legge i messaggi partiti da lunedì, il giorno solo i suoi.
    const sentFrom = isWeek ? rangeStart : day.start;
    const sent = useCrmLoad(
        () => (sentFrom <= now.toISOString() ? listCrmMessagesSince(sentFrom) : Promise.resolve([])),
        `${sentFrom}:${tick}`
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

    const setView = useCallback(
        (next: AgendaView) => {
            try {
                localStorage.setItem(VIEW_STORAGE, next);
            } catch {
                // Senza storage la scelta vale finché si resta sulla pagina.
            }
            setParams(
                p => {
                    const q = new URLSearchParams(p);
                    q.set("vista", next);
                    return q;
                },
                { replace: true }
            );
        },
        [setParams]
    );
    const openDay = useCallback(
        (key: string) =>
            setParams(
                p => {
                    const q = new URLSearchParams(p);
                    q.set("vista", "giorno");
                    if (key === romeDayKey(new Date())) q.delete("giorno");
                    else q.set("giorno", key);
                    return q;
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
            <>
                {!isPhone && (
                    <SegmentedControl<AgendaView>
                        size="sm"
                        value={view}
                        onChange={setView}
                        options={[
                            { value: "settimana", label: "Settimana" },
                            { value: "giorno", label: "Giorno" }
                        ]}
                    />
                )}
                <Button variant="secondary" onClick={openSettings} disabled={!settingsReady}>
                    Impostazioni
                </Button>
            </>
        ),
        [openSettings, settingsReady, isPhone, view, setView]
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
    const weekColumns =
        isWeek && appointments.data && sent.data
            ? agendaWeekItems({
                  weekStart,
                  now,
                  venues: venues.data ?? [],
                  sent: sent.data,
                  queued: queued.data ?? [],
                  appointments: appointments.data,
                  nameOf
              })
            : [];
    const weekEmpty = weekColumns.every(c => c.items.length === 0);

    const toCloseCard = toClose.data && toClose.data.length > 0 && (
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
    );

    const tomorrow =
        selected === today && appointments.data ? (
            <Text variant="caption" colorVariant="muted" className={styles.tomorrow}>
                {tomorrowLine(appointments.data, shiftDayKey(today, 1))}
            </Text>
        ) : null;

    return (
        <div className={styles.page} data-view={view}>
            {isWeek ? (
                <>
                    {toCloseCard}
                    <div className={styles.weekHead}>
                        <Text as="span" variant="body-sm" colorVariant="muted" className={styles.weekMonth}>
                            {weekMonthLabel(weekStart)}
                        </Text>
                        {weekStart !== weekStartKey(today) && (
                            <Button variant="ghost" size="sm" onClick={() => pick(today)}>
                                Oggi
                            </Button>
                        )}
                        <IconButton
                            icon={<ChevronLeft size={16} />}
                            aria-label="Settimana prima"
                            variant="ghost"
                            size="sm"
                            onClick={() => pick(shiftDayKey(selected, -7))}
                        />
                        <IconButton
                            icon={<ChevronRight size={16} />}
                            aria-label="Settimana dopo"
                            variant="ghost"
                            size="sm"
                            onClick={() => pick(shiftDayKey(selected, 7))}
                        />
                    </div>
                    <TileState
                        loading={dayLoading}
                        error={dayError}
                        onRetry={retry}
                        empty={weekEmpty}
                        emptyText="Niente in questa settimana: nessuna telefonata e nessun messaggio."
                    >
                        <AgendaWeekGrid days={weekDays} columns={weekColumns} onOpenDay={openDay} />
                    </TileState>
                </>
            ) : (
                <div className={styles.dayLayout}>
                    <div className={styles.dayMain}>
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
                    </div>
                    <aside className={styles.dayAside} aria-label="Da chiudere e domani">
                        {toCloseCard}
                        {tomorrow}
                    </aside>
                </div>
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
