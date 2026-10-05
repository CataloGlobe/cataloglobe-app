import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { assignCrmVenue, listCrmTeamMembers, listCrmVenues } from "@/services/supabase/crm";
import {
    listCrmAppointments,
    listCrmAppointmentsCreatedSince,
    listCrmCallsWithoutOutcome,
    setCrmCallOutcome
} from "@/services/supabase/crmAgenda";
import { getCrmAgentSettings, getCrmAiSpend } from "@/services/supabase/crmAgents";
import { decideCrmDraft, getCrmAgentTrialSettings, listCrmAgentDraftsOpenOrSince } from "@/services/supabase/crmAgentTrial";
import { getCrmWeeklyGoal } from "@/services/supabase/crmGoals";
import { listCrmMessagesSince } from "@/services/supabase/crmWhatsappAgent";
import { romeTodayStart } from "@/utils/crm/agentsOverview";
import { CRM_AGENT_DRAFT_KIND_LABEL } from "@/utils/crm/agentLabels";
import {
    agentsTile,
    greeting,
    homeAgendaToday,
    homeFiguresV3,
    homeHotRows,
    homeTodos,
    relativeAgo,
    romeDayLabel,
    romeWeekStart,
    romeWeekStartDate,
    sinceMorning,
    waitingForMe,
    weekCallsSet,
    WA_FIRST_MESSAGES_PER_DAY,
    type HomeTodo
} from "@/utils/crm/crmHome";
import { crmErrorMessage } from "@/utils/crm/stages";
import { formatUsd } from "@shared/crmAi";
import { AddLeadDrawer } from "./AddLeadDrawer";
import { HomeAgendaDay } from "./components/HomeAgendaDay";
import { HomeGoalCell } from "./components/HomeGoalCell";
import { AgendaRow, Figure, FreeAfter, MorningFact } from "./components/HomeParts";
import { HomePhone } from "./components/HomePhone";
import { TileState } from "./components/TileState";
import { TileToggle, type HomeTile as Tile } from "./components/TileToggle";
import { useCrmLoad } from "./hooks/useCrmLoad";
import styles from "./Home.module.scss";

/**
 * Home del CRM (canvas, versione finale V3 del 2026-10-05): saluto, «Da
 * stamattina», numeri con l'obiettivo della settimana, poi quattro riquadri a
 * coppie (Da fare | Agenda di oggi, Caldi adesso | Agenti) con le azioni
 * nelle righe. Ogni riquadro carica da solo: se una tabella manca sul
 * database si spegne solo lui. Ingrandito (⤢) un riquadro prende due terzi e
 * i numeri si stringono in una riga; accanto resta Da fare in breve (R3b).
 */

const TILE_LIMIT = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "numeric", minute: "2-digit" });
const FIRST_VISIT_KEY = "crm-home-first-visit";

/** La prima apertura della Home oggi (preferenza di vista, per «Da stamattina»). */
function firstVisitToday(now: Date): string {
    const dayStart = romeTodayStart(now);
    try {
        const stored = localStorage.getItem(FIRST_VISIT_KEY);
        if (stored && stored >= dayStart) return stored;
        localStorage.setItem(FIRST_VISIT_KEY, now.toISOString());
        return now.toISOString();
    } catch {
        // Senza storage si conta da mezzanotte.
        return dayStart;
    }
}

export default function HomePage() {
    usePageTitle("Home del CRM");
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const userId = user?.id ?? null;
    const isPhone = useMediaQuery("(max-width: 767px)");

    const [now] = useState(() => new Date());
    const [since] = useState(() => firstVisitToday(now));
    const [reloadKey, setReloadKey] = useState(0);
    const reload = useCallback(() => setReloadKey(k => k + 1), []);
    const [expanded, setExpanded] = useState<Tile | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const todayStart = romeTodayStart(now);
    // Da mezzogiorno: i giorni da 23 o 25 ore dei cambi d'ora non spostano il conto.
    const noon = new Date(todayStart).getTime() + 12 * 60 * 60 * 1000;
    const tomorrowStart = romeTodayStart(new Date(noon + DAY_MS));
    const afterTomorrowStart = romeTodayStart(new Date(noon + 2 * DAY_MS));
    const weekStart = romeWeekStart(now);
    const weekStartDate = romeWeekStartDate(now);
    const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
    const messagesFrom = since < dayAgo ? since : dayAgo;

    const venues = useCrmLoad(listCrmVenues, reloadKey);
    const drafts = useCrmLoad(() => listCrmAgentDraftsOpenOrSince(todayStart), reloadKey);
    const outcomes = useCrmLoad(() => listCrmCallsWithoutOutcome(new Date().toISOString()), reloadKey);
    const appointments = useCrmLoad(() => listCrmAppointments(todayStart, afterTomorrowStart), reloadKey);
    const messages = useCrmLoad(() => listCrmMessagesSince(messagesFrom), reloadKey);
    const weekCalls = useCrmLoad(() => listCrmAppointmentsCreatedSince(weekStart), reloadKey);
    const goal = useCrmLoad(() => getCrmWeeklyGoal(weekStartDate), reloadKey);
    const team = useCrmLoad(listCrmTeamMembers, reloadKey);
    const agentSettings = useCrmLoad(getCrmAgentSettings, reloadKey);
    const trial = useCrmLoad(getCrmAgentTrialSettings, reloadKey);
    const spend = useCrmLoad(getCrmAiSpend, reloadKey);

    const nameOf = useMemo(() => {
        const names = new Map((team.data ?? []).map(m => [m.user_id, m.display_name.split(" ")[0]]));
        return (id: string | null) => (id ? (names.get(id) ?? null) : null);
    }, [team.data]);

    const todos = useMemo(
        () =>
            homeTodos({
                drafts: drafts.data ?? [],
                venues: venues.data ?? [],
                callsWithoutOutcome: outcomes.data ?? [],
                now
            }),
        [drafts.data, venues.data, outcomes.data, now]
    );
    const figures = useMemo(() => (venues.data ? homeFiguresV3(venues.data, now) : null), [venues.data, now]);
    const hot = useMemo(() => homeHotRows(venues.data ?? [], messages.data, now), [venues.data, messages.data, now]);
    const agendaToday = useMemo(() => homeAgendaToday(appointments.data ?? [], now), [appointments.data, now]);
    const tomorrowFirst = useMemo(
        () =>
            (appointments.data ?? []).find(
                a => a.status !== "cancelled" && a.starts_at >= tomorrowStart && a.starts_at < afterTomorrowStart
            ) ?? null,
        [appointments.data, tomorrowStart, afterTomorrowStart]
    );
    const morning = useMemo(
        () =>
            venues.data && messages.data && weekCalls.data
                ? sinceMorning({ since, venues: venues.data, messages: messages.data, calls: weekCalls.data, nameOf })
                : null,
        [venues.data, messages.data, weekCalls.data, since, nameOf]
    );
    const agents = useMemo(
        () =>
            agentSettings.data && trial.data
                ? agentsTile({
                      brakeOn: agentSettings.data.brake_on,
                      autonomyOn: trial.data.agent_autonomy_on,
                      messages: messages.data ?? [],
                      drafts: drafts.data ?? [],
                      now
                  })
                : null,
        [agentSettings.data, trial.data, messages.data, drafts.data, now]
    );

    // ── Testata ──────────────────────────────────────────────────────────
    const myName = userId ? nameOf(userId) : null;
    const waiting = waitingForMe(todos, venues.data ?? [], userId);
    const title = myName ? `${greeting(now)}, ${myName}` : greeting(now);
    const subtitle = `${romeDayLabel(now)} · ${
        waiting === 0 ? "nessun lead aspetta te" : waiting === 1 ? "1 lead aspetta te" : `${waiting} lead aspettano te`
    }`;
    const headerActions = useMemo(
        () => (
            <Button variant="secondary" size="sm" onClick={() => setIsAddOpen(true)}>
                Aggiungi lead
            </Button>
        ),
        []
    );
    // Al telefono la testata è nella pagina (canvas U8a): data sopra, «Ciao …».
    usePageHeader(isPhone ? {} : { title, subtitle, actions: headerActions });

    // ── Azioni nelle righe ───────────────────────────────────────────────
    const run = useCallback(
        async (key: string, action: () => Promise<unknown>, done: string) => {
            setBusy(key);
            setActionError(null);
            try {
                await action();
                showToast({ message: done, type: "success" });
                reload();
            } catch (err) {
                setActionError(crmErrorMessage(err));
            } finally {
                setBusy(null);
            }
        },
        [reload, showToast]
    );

    const toggle = useCallback((tile: Tile) => setExpanded(e => (e === tile ? null : tile)), []);
    const limit = <T,>(tile: Tile, list: T[]) => (expanded === tile ? list : list.slice(0, TILE_LIMIT));
    const more = (tile: Tile, total: number, word: string) =>
        expanded !== tile && total > TILE_LIMIT ? (
            <button type="button" className={styles.more} onClick={() => toggle(tile)}>
                e {word} {total - TILE_LIMIT}
            </button>
        ) : null;

    const firstDraftKey = todos.find(t => t.kind === "draft" && t.draftText)?.key ?? null;

    function todoRow(todo: HomeTodo) {
        const draftId = todo.key.replace(/^draft-/, "");
        const callId = todo.key.replace(/^outcome-/, "");
        const isBusy = busy === todo.key;
        const otherBusy = busy !== null && !isBusy;
        const wait =
            todo.wait && todo.kind !== "outcome" ? (
                <Text as="span" variant="caption" className={styles.wait} data-level={todo.level}>
                    {todo.wait}
                </Text>
            ) : null;

        if (todo.key === firstDraftKey) {
            return (
                <li key={todo.key} className={styles.todo} data-level={todo.level} data-open="true">
                    <div className={styles.todoMain}>
                        {todo.level !== "normale" && todo.wait && (
                            <Text as="span" variant="caption-xs" weight={700} className={styles.eyebrow} data-level={todo.level}>
                                Un lead aspetta da {todo.wait}
                            </Text>
                        )}
                        <Text as="p" variant="body-sm" className={styles.todoText}>
                            <strong>{todo.venueName}</strong> {todo.text}
                        </Text>
                        <blockquote className={styles.quote}>
                            <Text as="span" variant="body-sm">
                                {todo.draftText}
                            </Text>
                        </blockquote>
                    </div>
                    <div className={styles.todoStack}>
                        <Button
                            variant="primary"
                            size="sm"
                            loading={isBusy}
                            disabled={otherBusy}
                            onClick={() =>
                                void run(todo.key, () => decideCrmDraft(draftId, "send"), `Messaggio a ${todo.venueName} in partenza.`)
                            }
                        >
                            Inviala così
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/lead/${todo.venueId}?bozza=modifica`)}>
                            Modifica
                        </Button>
                    </div>
                </li>
            );
        }

        if (todo.kind === "draft") {
            const kind = (drafts.data ?? []).find(d => d.id === draftId)?.kind;
            return (
                <li key={todo.key} className={styles.todo} data-level={todo.level}>
                    <Text as="p" variant="body-sm" className={styles.todoText}>
                        Bozza per <strong>{todo.venueName}</strong>
                        {kind ? `: ${CRM_AGENT_DRAFT_KIND_LABEL[kind].toLowerCase()}` : ""}
                    </Text>
                    {wait}
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/lead/${todo.venueId}`)}>
                        Apri
                    </Button>
                </li>
            );
        }

        if (todo.kind === "unassigned") {
            return (
                <li key={todo.key} className={styles.todo} data-level={todo.level}>
                    <Text as="p" variant="body-sm" className={styles.todoText}>
                        <Link to={`/admin/lead/${todo.venueId}`} className={styles.rowLink}>
                            {todo.venueName}
                        </Link>{" "}
                        {todo.text}
                    </Text>
                    {wait}
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={isBusy}
                        disabled={!userId || otherBusy}
                        onClick={() => {
                            if (userId) void run(todo.key, () => assignCrmVenue(todo.venueId, userId), `${todo.venueName} ora lo segui tu.`);
                        }}
                    >
                        Prendo io
                    </Button>
                </li>
            );
        }

        return (
            <li key={todo.key} className={styles.todo} data-level={todo.level}>
                <Text as="p" variant="body-sm" className={styles.todoText}>
                    <Link to={`/admin/lead/${todo.venueId}`} className={styles.rowLink}>
                        {todo.venueName}
                    </Link>
                    : la telefonata è fatta?
                </Text>
                <div className={styles.todoPair}>
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={isBusy}
                        disabled={otherBusy}
                        onClick={() => void run(todo.key, () => setCrmCallOutcome(callId, "done"), "Segnata come fatta.")}
                    >
                        Sì
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void run(todo.key, () => setCrmCallOutcome(callId, "postponed"), "Segnata da rifare.")}
                    >
                        Non ancora
                    </Button>
                </div>
            </li>
        );
    }

    // ── Riquadri ─────────────────────────────────────────────────────────
    const todoLoading = drafts.loading || venues.loading;
    const todoError = drafts.error ?? venues.error;
    const COMPACT_WORD: Record<HomeTodo["kind"], string> = { draft: "aspetta", unassigned: "senza nessuno", outcome: "esito" };

    const todoTile = (compact: boolean) => (
        <Card
            title="Da fare"
            badge={
                <Text as="span" variant="body-sm" colorVariant="muted">
                    · {todos.length}
                    {compact ? "" : " · la più urgente in cima"}
                </Text>
            }
            actions={<TileToggle tile="todo" expanded={expanded} label="Da fare" onToggle={toggle} />}
            flush
            className={styles.tile}
        >
            <TileState
                loading={todoLoading}
                error={todoError}
                onRetry={reload}
                empty={todos.length === 0}
                emptyText="Niente da fare adesso."
            >
                {compact ? (
                    <ul className={styles.rows}>
                        {todos.map(t => (
                            <li key={t.key}>
                                <Link to={`/admin/lead/${t.venueId}`} className={styles.compactRow}>
                                    <span className={styles.dot} data-level={t.level} aria-hidden="true" />
                                    <Text as="span" variant="body-sm">
                                        <strong>{t.venueName}</strong> {COMPACT_WORD[t.kind]}
                                    </Text>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <>
                        {actionError && (
                            <Text as="p" variant="body-sm" colorVariant="error" role="alert" className={styles.actionError}>
                                {actionError}
                            </Text>
                        )}
                        <ul className={styles.rows}>{limit("todo", todos).map(todoRow)}</ul>
                        {more("todo", todos.length, "altre")}
                    </>
                )}
            </TileState>
        </Card>
    );

    const agendaTile =
        expanded === "agenda" ? (
            <HomeAgendaDay
                now={now}
                venues={venues.data ?? []}
                drafts={drafts.data ?? []}
                nameOf={nameOf}
                onCollapse={() => setExpanded(null)}
            />
        ) : (
            <Card
                title="Agenda di oggi"
                actions={<TileToggle tile="agenda" expanded={expanded} label="Agenda di oggi" onToggle={toggle} />}
                flush
                className={styles.tile}
            >
                <TileState loading={appointments.loading} error={appointments.error} onRetry={reload}>
                    <ul className={styles.rows}>
                        {agendaToday.length === 0 ? (
                            <li className={styles.agendaRow}>
                                <span className={styles.agendaTime} aria-hidden="true">
                                    —
                                </span>
                                <Text as="span" variant="body-sm" colorVariant="muted">
                                    Oggi niente in agenda
                                </Text>
                            </li>
                        ) : (
                            <>
                                {agendaToday.map(a => (
                                    <AgendaRow key={a.id} appointment={a} caller={nameOf(a.caller_user_id)} />
                                ))}
                                <FreeAfter appointments={agendaToday} />
                            </>
                        )}
                    </ul>
                    {tomorrowFirst && (
                        <Text as="p" variant="caption" colorVariant="muted" className={styles.tileFootnote}>
                            Domani {HOUR.format(new Date(tomorrowFirst.starts_at))} · telefonata con {tomorrowFirst.venue_name}
                        </Text>
                    )}
                </TileState>
            </Card>
        );

    const hotTile = (
        <Card
            title="Caldi adesso"
            badge={
                <Text as="span" variant="caption" colorVariant="muted">
                    {messages.data ? "risposte nelle ultime 24 ore" : "si sono mossi nelle ultime 24 ore"}
                </Text>
            }
            actions={<TileToggle tile="hot" expanded={expanded} label="Caldi adesso" onToggle={toggle} />}
            flush
            className={styles.tile}
        >
            <TileState
                loading={venues.loading || messages.loading}
                error={venues.error}
                onRetry={reload}
                empty={hot.length === 0}
                emptyText="Nessuno ha scritto nelle ultime 24 ore."
            >
                <ul className={styles.rows}>
                    {limit("hot", hot).map(h => (
                        <li key={h.venueId}>
                            <Link to={`/admin/lead/${h.venueId}`} className={styles.hotRow}>
                                <Text as="span" variant="body-sm" weight={600} className={styles.hotName}>
                                    {h.name}
                                </Text>
                                {h.quote && (
                                    <Text as="span" variant="body-sm" colorVariant="muted" className={styles.hotQuote}>
                                        «{h.quote}»
                                    </Text>
                                )}
                                <Text as="span" variant="caption" colorVariant="muted" className={styles.hotAgo}>
                                    {relativeAgo(h.at, now)}
                                </Text>
                            </Link>
                        </li>
                    ))}
                </ul>
                {more("hot", hot.length, "altri")}
            </TileState>
        </Card>
    );

    const agentsCard = (
        <Card
            title="Agenti"
            badge={
                agents ? (
                    <span className={styles.agentState} data-state={agents.state}>
                        <span className={styles.stateDot} aria-hidden="true" />
                        <Text as="span" variant="body-sm" colorVariant="muted">
                            {agents.state}
                        </Text>
                    </span>
                ) : undefined
            }
            actions={<TileToggle tile="agents" expanded={expanded} label="Agenti" onToggle={toggle} />}
            flush
            className={styles.tile}
        >
            <TileState loading={agentSettings.loading || trial.loading} error={agentSettings.error ?? trial.error} onRetry={reload}>
                {agents && (
                    <dl className={styles.facts}>
                        <div className={styles.fact}>
                            <Text as="dt" variant="body-sm">
                                Partiti oggi
                            </Text>
                            <Text as="dd" variant="body-sm" weight={700}>
                                {agents.sentToday}
                                <Text as="span" variant="caption" colorVariant="muted" weight={400}>
                                    {" "}
                                    · primi {agents.firstToday} di {WA_FIRST_MESSAGES_PER_DAY}
                                </Text>
                            </Text>
                        </div>
                        <div className={styles.fact}>
                            <Text as="dt" variant="body-sm">
                                Aspettano voi
                            </Text>
                            <Text as="dd" variant="body-sm" weight={700}>
                                {agents.waiting}
                            </Text>
                        </div>
                        <div className={styles.fact}>
                            <Text as="dt" variant="body-sm">
                                Spesa AI oggi
                            </Text>
                            <Text as="dd" variant="body-sm" weight={700}>
                                {spend.data ? formatUsd(spend.data.dayUsd) : "—"}
                            </Text>
                        </div>
                    </dl>
                )}
                {expanded === "agents" && (
                    <div className={styles.tileFootnote}>
                        <Button variant="secondary" size="sm" onClick={() => navigate("/admin/agenti")}>
                            Apri Agenti
                        </Button>
                    </div>
                )}
            </TileState>
        </Card>
    );

    if (isPhone) {
        return (
            <HomePhone
                now={now}
                name={myName}
                morning={morning}
                todos={todos}
                firstDraftKey={firstDraftKey}
                agenda={agendaToday}
                nameOf={nameOf}
                loading={todoLoading || appointments.loading}
                error={todoError ?? appointments.error}
                onRetry={reload}
                busyKey={busy}
                actionError={actionError}
                onSend={todo =>
                    void run(
                        todo.key,
                        () => decideCrmDraft(todo.key.replace(/^draft-/, ""), "send"),
                        `Messaggio a ${todo.venueName} in partenza.`
                    )
                }
                goal={goal.data !== null && weekCalls.data ? { done: weekCallsSet(weekCalls.data, weekStart), target: goal.data } : null}
            />
        );
    }

    const tiles: Record<Tile, ReactElement> = { todo: todoTile(false), agenda: agendaTile, hot: hotTile, agents: agentsCard };
    const compactFigures = expanded !== null;

    return (
        <div className={styles.page}>
            {!compactFigures && (
                <section className={styles.strip} aria-label="Da stamattina">
                    <Text as="span" variant="caption" colorVariant="muted">
                        {since === todayStart ? "Da stamattina" : `Da stamattina alle ${HOUR.format(new Date(since))}`}
                    </Text>
                    {morning ? (
                        <>
                            <MorningFact n={morning.newLeads} one="lead nuovo" many="lead nuovi" />
                            <MorningFact n={morning.replied} one="ha risposto" many="hanno risposto" />
                            <MorningFact
                                n={morning.calls.length}
                                one={`telefonata fissata${morning.calls[0] ? ` da ${morning.calls[0]}` : ""}`}
                                many="telefonate fissate"
                            />
                            <MorningFact n={morning.sent} one="messaggio partito" many="messaggi partiti" />
                            <button type="button" className={styles.stripLink} onClick={() => setExpanded("agenda")}>
                                <Text as="span" variant="body-sm">
                                    Vedi
                                </Text>
                            </button>
                        </>
                    ) : (
                        <Text as="span" variant="body-sm" colorVariant="muted">
                            {messages.error ?? weekCalls.error ?? venues.error ?? "Carico…"}
                        </Text>
                    )}
                </section>
            )}

            <section className={styles.figures} data-compact={compactFigures || undefined} aria-label="I numeri">
                <TileState loading={venues.loading} error={venues.error} onRetry={reload}>
                    {figures && (
                        <>
                            <Figure label="Lead nuovi, 7 giorni" short="Lead nuovi" value={figures.newWeek} delta={figures.newWeekDelta} compact={compactFigures} />
                            <Figure label="In conversazione" value={figures.talking} compact={compactFigures} />
                            <Figure
                                label="In prova"
                                value={figures.trial}
                                note={
                                    figures.trialSinceDays === null
                                        ? undefined
                                        : figures.trialSinceDays === 0
                                          ? "da oggi"
                                          : figures.trialSinceDays === 1
                                            ? "da 1 giorno"
                                            : `da ${figures.trialSinceDays} giorni`
                                }
                                compact={compactFigures}
                            />
                            <Figure
                                label="Paganti"
                                value={figures.paying}
                                link={{ to: "/admin/lead?vista=riepilogo", label: "Riepilogo ›" }}
                                compact={compactFigures}
                            />
                            {!compactFigures && (
                                <HomeGoalCell
                                    weekStart={weekStartDate}
                                    done={weekCalls.data ? weekCallsSet(weekCalls.data, weekStart) : null}
                                    target={goal.data}
                                    unavailable={goal.error}
                                    userId={userId}
                                    onSaved={reload}
                                />
                            )}
                        </>
                    )}
                </TileState>
            </section>

            {expanded === null ? (
                <div className={styles.grid}>
                    {tiles.todo}
                    {tiles.agenda}
                    {tiles.hot}
                    {tiles.agents}
                </div>
            ) : (
                <div className={styles.gridExpanded}>
                    <div className={styles.expandedMain}>{tiles[expanded]}</div>
                    <div className={styles.expandedSide}>{expanded === "todo" ? tiles.agenda : todoTile(true)}</div>
                </div>
            )}

            <AddLeadDrawer
                open={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onCreated={venueId => {
                    setIsAddOpen(false);
                    navigate(`/admin/lead/${venueId}`);
                }}
            />
        </div>
    );
}
