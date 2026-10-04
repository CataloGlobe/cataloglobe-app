import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useAuth } from "@/context/useAuth";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listCrmTeamMembers, listCrmVenues } from "@/services/supabase/crm";
import { listCrmAppointments, listCrmCallsWithoutOutcome } from "@/services/supabase/crmAgenda";
import { getCrmAgentSettings, getCrmAiSpend } from "@/services/supabase/crmAgents";
import { listCrmAgentDrafts } from "@/services/supabase/crmAgentTrial";
import type {
    CrmAgentDraftRow,
    CrmAgentSettings,
    CrmAiSpend,
    CrmAppointmentWithVenue,
    CrmTeamMember,
    CrmVenueListItem
} from "@/types/crm";
import { CRM_STAGE_LABEL } from "@/utils/crm/stages";
import { greeting, homeAgendaToday, homeFigures, homeHot, homeTodos, type HomeTodo } from "@/utils/crm/crmHome";
import { formatUsd } from "@shared/crmAi";
import { TileToggle, type HomeTile as Tile } from "./components/TileToggle";
import styles from "./Crm.module.scss";

/**
 * Home del CRM (grafica decisa il 2026-10-05): i numeri in riga, poi quattro
 * riquadri allineati a coppie (Da fare | Agenda di oggi, Caldi adesso |
 * Agenti). Ogni riquadro si ingrandisce e mostra tutto; il più urgente sta in
 * cima e il colore dell'attesa è solo nel filo e nel tempo.
 */


const TILE_LIMIT = 4;

const WAIT_ROW_CLASS: Record<HomeTodo["level"], string | undefined> = {
    normale: undefined,
    arancio: styles.waitRowOrange,
    rosso: styles.waitRowRed
};

const TIME = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export default function HomePage() {
    usePageTitle("Home del CRM");
    const navigate = useNavigate();
    const { user } = useAuth();

    const [venues, setVenues] = useState<CrmVenueListItem[]>([]);
    const [drafts, setDrafts] = useState<CrmAgentDraftRow[]>([]);
    const [appointments, setAppointments] = useState<CrmAppointmentWithVenue[]>([]);
    const [outcomes, setOutcomes] = useState<CrmAppointmentWithVenue[]>([]);
    const [settings, setSettings] = useState<CrmAgentSettings | null>(null);
    const [spend, setSpend] = useState<CrmAiSpend | null>(null);
    const [team, setTeam] = useState<CrmTeamMember[]>([]);
    const [now, setNow] = useState(() => new Date());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Tile | null>(null);

    const load = useCallback(async () => {
        setError(null);
        const at = new Date();
        const dayStart = new Date(at.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const dayEnd = new Date(at.getTime() + 24 * 60 * 60 * 1000).toISOString();
        try {
            const [v, d, a, o, s, sp, t] = await Promise.all([
                listCrmVenues(),
                listCrmAgentDrafts(100),
                listCrmAppointments(dayStart, dayEnd),
                listCrmCallsWithoutOutcome(at.toISOString()),
                getCrmAgentSettings(),
                getCrmAiSpend(),
                listCrmTeamMembers()
            ]);
            setVenues(v);
            setDrafts(d);
            setAppointments(a);
            setOutcomes(o);
            setSettings(s);
            setSpend(sp);
            setTeam(t);
            setNow(at);
        } catch (err) {
            setError(`Non è stato possibile caricare la Home: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const todos = useMemo(() => homeTodos({ drafts, venues, callsWithoutOutcome: outcomes, now }), [drafts, venues, outcomes, now]);
    const figures = useMemo(() => homeFigures(venues, now), [venues, now]);
    const hot = useMemo(() => homeHot(venues, now), [venues, now]);
    const agenda = useMemo(() => homeAgendaToday(appointments, now), [appointments, now]);
    const teamName = useMemo(() => {
        const names = new Map(team.map(m => [m.user_id, m.display_name]));
        return (id: string | null) => (id ? (names.get(id) ?? "") : "");
    }, [team]);
    const myName = user ? teamName(user.id).split(" ")[0] : "";
    const waitingYou = todos.filter(t => t.level !== "normale").length;

    usePageHeader({
        title: myName ? `${greeting(now)}, ${myName}` : greeting(now),
        subtitle:
            waitingYou === 0
                ? "Nessuno sta aspettando."
                : waitingYou === 1
                  ? "1 cosa aspetta voi."
                  : `${waitingYou} cose aspettano voi.`
    });

    const toggle = useCallback((tile: Tile) => setExpanded(e => (e === tile ? null : tile)), []);
    const show = (tile: Tile) => expanded === null || expanded === tile;
    const limit = <T,>(tile: Tile, list: T[]) => (expanded === tile ? list : list.slice(0, TILE_LIMIT));

    if (isLoading) return <LoadingState message="Caricamento della Home…" />;

    function todoRow(todo: HomeTodo) {
        const open = () => navigate(`/admin/lead/${todo.venueId}`);
        return (
            <ListRow
                key={todo.key}
                className={WAIT_ROW_CLASS[todo.level]}
                title={
                    <span>
                        <strong>{todo.venueName}</strong> {todo.text}
                    </span>
                }
                subtitle={todo.draftText ?? undefined}
                wrapSubtitle
                meta={
                    todo.wait ? (
                        <span className={styles.waitTime} data-level={todo.level}>
                            {todo.wait}
                        </span>
                    ) : undefined
                }
                metaInline
                trailing={
                    <Button variant={todo.kind === "draft" ? "primary" : "secondary"} size="sm" onClick={open}>
                        {todo.kind === "draft" ? "Apri la bozza" : todo.kind === "unassigned" ? "Prendo io" : "Scrivi l'esito"}
                    </Button>
                }
                trailingWrap
            />
        );
    }

    const hiddenCount = (tile: Tile, total: number) =>
        expanded !== tile && total > TILE_LIMIT ? (
            <div className={styles.cardPadding}>
                <Button variant="ghost" size="sm" onClick={() => toggle(tile)}>
                    Altri {total - TILE_LIMIT}
                </Button>
            </div>
        ) : null;

    return (
        <div className={styles.page}>
            {error && (
                <InlineBanner
                    variant="error"
                    action={
                        <Button variant="secondary" size="sm" onClick={() => void load()}>
                            Riprova
                        </Button>
                    }
                >
                    {error}
                </InlineBanner>
            )}

            <div className={styles.homeFigures}>
                <StatCard label="Lead nuovi, 7 giorni" value={figures.newWeek} />
                <StatCard label="In conversazione" value={figures.talking} />
                <StatCard label="In prova" value={figures.trial} />
                <StatCard label="Paganti" value={figures.paying} />
            </div>

            <div className={styles.homeGrid} data-expanded={expanded ?? undefined}>
                {show("todo") && (
                    <Card
                        title="Da fare"
                        subtitle="La più urgente in cima."
                        badge={todos.length > 0 ? <StatusBadge variant="neutral" label={String(todos.length)} /> : undefined}
                        actions={<TileToggle tile="todo" expanded={expanded} label="Da fare" onToggle={toggle} />}
                        flush
                        className={styles.homeTile}
                    >
                        {todos.length === 0 ? (
                            <div className={styles.cardPadding}>
                                <EmptyState variant="inline" title="Niente da fare adesso" />
                            </div>
                        ) : (
                            limit("todo", todos).map(todoRow)
                        )}
                        {hiddenCount("todo", todos.length)}
                    </Card>
                )}

                {show("agenda") && (
                    <Card
                        title="Agenda di oggi"
                        actions={<TileToggle tile="agenda" expanded={expanded} label="Agenda di oggi" onToggle={toggle} />}
                        flush
                        className={styles.homeTile}
                    >
                        {agenda.length === 0 ? (
                            <div className={styles.cardPadding}>
                                <EmptyState variant="inline" title="Oggi niente in agenda" />
                            </div>
                        ) : (
                            limit("agenda", agenda).map(a => (
                                <ListRow
                                    key={a.id}
                                    leading={
                                        <Text as="span" variant="body-sm" weight={600}>
                                            {TIME.format(new Date(a.starts_at))}
                                        </Text>
                                    }
                                    title={a.venue_name}
                                    subtitle={teamName(a.caller_user_id) ? `Chiama ${teamName(a.caller_user_id)}` : undefined}
                                    onClick={() => navigate(`/admin/lead/${a.venue_id}`)}
                                />
                            ))
                        )}
                        {hiddenCount("agenda", agenda.length)}
                        {expanded === "agenda" && (
                            <div className={styles.cardPadding}>
                                <Button variant="secondary" size="sm" onClick={() => navigate("/admin/agenda")}>
                                    Apri l'Agenda
                                </Button>
                            </div>
                        )}
                    </Card>
                )}

                {show("hot") && (
                    <Card
                        title="Caldi adesso"
                        subtitle="Si sono mossi nelle ultime 24 ore."
                        actions={<TileToggle tile="hot" expanded={expanded} label="Caldi adesso" onToggle={toggle} />}
                        flush
                        className={styles.homeTile}
                    >
                        {hot.length === 0 ? (
                            <div className={styles.cardPadding}>
                                <EmptyState variant="inline" title="Nessuno si è mosso nelle ultime 24 ore" />
                            </div>
                        ) : (
                            limit("hot", hot).map(v => (
                                <ListRow
                                    key={v.id}
                                    title={v.name}
                                    subtitle={CRM_STAGE_LABEL[v.stage]}
                                    meta={TIME.format(new Date(v.last_activity_at))}
                                    metaInline
                                    onClick={() => navigate(`/admin/lead/${v.id}`)}
                                />
                            ))
                        )}
                        {hiddenCount("hot", hot.length)}
                    </Card>
                )}

                {show("agents") && settings && spend && (
                    <Card
                        title="Agenti"
                        badge={
                            <StatusBadge
                                variant={settings.brake_on ? "danger" : "success"}
                                label={settings.brake_on ? "In pausa" : "Attivi"}
                            />
                        }
                        actions={<TileToggle tile="agents" expanded={expanded} label="Agenti" onToggle={toggle} />}
                        flush
                        className={styles.homeTile}
                    >
                        <ListRow title="Bozze che aspettano voi" trailing={<Text variant="body-sm" weight={600}>{drafts.filter(d => d.status === "pending").length}</Text>} />
                        <ListRow title="Spesa AI oggi" trailing={<Text variant="body-sm" weight={600}>{`${formatUsd(spend.dayUsd)} di ${formatUsd(spend.dayCap)}`}</Text>} />
                        {expanded === "agents" && (
                            <div className={styles.cardPadding}>
                                <Button variant="secondary" size="sm" onClick={() => navigate("/admin/agenti")}>
                                    Apri Agenti
                                </Button>
                            </div>
                        )}
                    </Card>
                )}
            </div>
        </div>
    );
}
