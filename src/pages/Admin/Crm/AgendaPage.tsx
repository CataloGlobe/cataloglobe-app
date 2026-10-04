import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listCrmTeamMembers } from "@/services/supabase/crm";
import { getCrmAgendaSettings, listCrmAppointments, listCrmCallsWithoutOutcome } from "@/services/supabase/crmAgenda";
import type { CrmAgendaSettings, CrmAppointmentWithVenue, CrmTeamMember } from "@/types/crm";
import {
    CRM_APPOINTMENT_STATUS_LABEL,
    CRM_APPOINTMENT_STATUS_VARIANT,
    describeCallWindows,
    isActiveAppointment
} from "@/utils/crm/agenda";
import { formatCallDay, formatCallTime, romeDayKey } from "@shared/crmCallSlots";
import { AgendaSettingsDrawer } from "./AgendaSettingsDrawer";
import styles from "./Crm.module.scss";

const DAYS_AHEAD = 14;

/**
 * Agenda delle telefonate (F1-4a): quelle da chiudere con l'esito, poi i
 * prossimi 14 giorni giorno per giorno. Si fissano dalla scheda del lead;
 * qui si leggono e si cambiano le impostazioni (fasce, testi, calendario).
 */
export default function AgendaPage() {
    usePageTitle("Agenda");
    const { showToast } = useToast();
    const [upcoming, setUpcoming] = useState<CrmAppointmentWithVenue[]>([]);
    const [toClose, setToClose] = useState<CrmAppointmentWithVenue[]>([]);
    const [team, setTeam] = useState<CrmTeamMember[]>([]);
    const [settings, setSettings] = useState<CrmAgendaSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const load = useCallback(async () => {
        const now = new Date();
        const to = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60_000);
        try {
            const [rows, open, members, agenda] = await Promise.all([
                listCrmAppointments(now.toISOString(), to.toISOString()),
                listCrmCallsWithoutOutcome(now.toISOString()),
                listCrmTeamMembers(),
                getCrmAgendaSettings()
            ]);
            setUpcoming(rows.filter(isActiveAppointment));
            setToClose(open);
            setTeam(members);
            setSettings(agenda);
            setPageError(null);
        } catch {
            setPageError("Non riesco a leggere l'agenda.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const teamName = useCallback(
        (userId: string | null) => team.find(m => m.user_id === userId)?.display_name ?? "—",
        [team]
    );

    const byDay = useMemo(() => {
        const groups = new Map<string, CrmAppointmentWithVenue[]>();
        for (const a of upcoming) {
            const key = romeDayKey(new Date(a.starts_at));
            groups.set(key, [...(groups.get(key) ?? []), a]);
        }
        return [...groups.entries()];
    }, [upcoming]);

    const openSettings = useCallback(() => setSettingsOpen(true), []);
    // MEMOIZZATO: usePageHeader confronta `actions` per reference.
    const headerActions = useMemo(
        () => (
            <div className={styles.headerActions}>
                <Button variant="secondary" onClick={openSettings}>
                    Impostazioni
                </Button>
            </div>
        ),
        [openSettings]
    );
    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({ primaryAction: { label: "Impostazioni", onClick: openSettings } }),
        [openSettings]
    );
    usePageHeader({
        title: "Agenda",
        subtitle: "Le telefonate coi lead. Si fissano dalla scheda del lead.",
        actions: headerActions,
        compact: headerCompact
    });

    if (isLoading) return <LoadingState message="Caricamento agenda…" />;

    const todayKey = romeDayKey(new Date());
    const row = (a: CrmAppointmentWithVenue, showDay: boolean) => {
        const start = new Date(a.starts_at);
        return (
            <ListRow
                key={a.id}
                to={`/admin/lead/${a.venue_id}`}
                title={`${showDay ? `${formatCallDay(start)} ` : ""}${formatCallTime(start)} · ${a.venue_name}`}
                subtitle={[a.venue_city, `chiama ${teamName(a.caller_user_id)}`, a.note].filter(Boolean).join(" · ")}
                trailing={
                    <StatusBadge
                        variant={CRM_APPOINTMENT_STATUS_VARIANT[a.status]}
                        label={a.status === "confirmed" && showDay ? "Esito da dire" : CRM_APPOINTMENT_STATUS_LABEL[a.status]}
                    />
                }
            />
        );
    };

    return (
        <div className={styles.page}>
            {pageError && (
                <InlineBanner
                    variant="error"
                    action={
                        <Button variant="secondary" size="sm" onClick={() => void load()}>
                            Riprova
                        </Button>
                    }
                >
                    {pageError}
                </InlineBanner>
            )}

            {toClose.length > 0 && (
                <Card title="Com'è andata?" subtitle="Telefonate passate senza esito: aprila e scegli Fatta, Non ha risposto o Rimandata." flush>
                    {toClose.map(a => row(a, true))}
                </Card>
            )}

            {byDay.length === 0 ? (
                <EmptyState
                    icon={<CalendarClock />}
                    title="Nessuna telefonata nei prossimi 14 giorni"
                    description="Si fissano dalla scheda di un lead, card «Telefonata»."
                    variant="inline"
                />
            ) : (
                byDay.map(([day, items]) => (
                    <Card
                        key={day}
                        title={`${day === todayKey ? "Oggi, " : ""}${formatCallDay(new Date(items[0].starts_at))}`}
                        flush
                    >
                        {items.map(a => row(a, false))}
                    </Card>
                ))
            )}

            {settings && (
                <Card
                    title="Impostazioni"
                    actions={
                        <Button variant="secondary" size="sm" onClick={openSettings}>
                            Modifica
                        </Button>
                    }
                >
                    <div className={styles.venueNameForm}>
                        <Text variant="body-sm">Fasce: {describeCallWindows(settings.call_windows)}.</Text>
                        <Text variant="body-sm">
                            Durata {settings.call_duration_minutes} minuti, preavviso {settings.call_min_notice_minutes} minuti.
                        </Text>
                        <Text variant="body-sm">
                            Calendario Google: {settings.google_calendar_id ? "collegato" : "non impostato"}.
                        </Text>
                        <Text variant="body-sm">
                            Conferma al lead: {settings.call_confirm_message ? "accesa" : "spenta"}. Promemoria il giorno
                            prima alle 18: {settings.call_reminder_message ? "acceso" : "spento"}. Promemoria un'ora prima:{" "}
                            {settings.call_soon_message ? "acceso" : "spento"}.
                        </Text>
                    </div>
                </Card>
            )}

            <AgendaSettingsDrawer
                open={settingsOpen}
                settings={settings}
                onClose={() => setSettingsOpen(false)}
                onSaved={async () => {
                    await load();
                    setSettingsOpen(false);
                    showToast({ message: "Impostazioni dell'agenda salvate.", type: "success" });
                }}
            />
        </div>
    );
}
