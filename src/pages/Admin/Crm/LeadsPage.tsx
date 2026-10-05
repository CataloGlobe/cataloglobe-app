import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Columns3, List, Plus, Search, Settings, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import Text from "@/components/ui/Text/Text";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch/ToolbarSearch";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getCrmSettings, listCrmTeamMembers, listCrmVenues, logCrmWhatsappOpened, moveCrmStage } from "@/services/supabase/crm";
import { listCrmAppointmentsCreatedSince } from "@/services/supabase/crmAgenda";
import { decideCrmDraft, listCrmAgentDraftsOpenOrSince } from "@/services/supabase/crmAgentTrial";
import { listCrmNextSteps, setCrmNextStep } from "@/services/supabase/crmNextSteps";
import { CRM_STAGES, type CrmStage, type CrmVenueListItem } from "@/types/crm";
import { needsStageLock } from "@/utils/crm/accountLabels";
import { romeTodayStart } from "@/utils/crm/agentsOverview";
import { shiftDayKey } from "@/utils/crm/agendaDay";
import { venueWaits } from "@/utils/crm/crmHome";
import { openDraftByVenue, snoozeDueOn, snoozeStepText, snoozedVenueIds, SWIPE_UNDO_MS, type LeadSwipe } from "@/utils/crm/leadSwipe";
import { romeDayKey } from "@shared/crmCallSlots";
import {
    boardVenues,
    cardMeta,
    lastContactLine,
    LEAD_VIEWS,
    leadSummary,
    matchesView,
    nextAppointments,
    nextStepLine,
    parseLeadView,
    searchLeads,
    SUMMARY_PERIODS,
    viewCounts,
    type LeadView,
    type SummaryPeriod
} from "@/utils/crm/leadViews";
import { CRM_SOURCE_LABEL, CRM_STAGE_LABEL, crmErrorMessage } from "@/utils/crm/stages";
import { crmSenderName, crmWhatsappLink } from "@/utils/crm/whatsapp";
import { AddLeadDrawer } from "./AddLeadDrawer";
import { ImportMetaCsvDrawer } from "./ImportMetaCsvDrawer";
import { SettingsDrawer } from "./SettingsDrawer";
import { LostStageDialog } from "./LostStageDialog";
import { StageLockDialog, type StageLockRequest } from "./StageLockDialog";
import { PipelineBoard } from "./PipelineBoard";
import { LeadSummaryView, LeadTrack, LeadViewsNav } from "./components/LeadParts";
import { LeadPhoneList } from "./components/LeadPhoneList";
import { useCrmLoad } from "./hooks/useCrmLoad";
import { useUndoableActions } from "./hooks/useUndoableActions";
import styles from "./Leads.module.scss";

/**
 * I lead del CRM (canvas V4, R4a, R4b, T8a; versione finale del 2026-10-05).
 *
 * A sinistra le viste con i conteggi (sotto 1024 diventano chip), in cima il
 * Riepilogo del giro. Ogni vista si guarda a Colonne (nove fasi, si
 * trascinano le carte) o a Elenco (il binario delle fasi e l'ultimo
 * contatto). Nell'indirizzo: `?vista=`, `?forma=colonne`, `?fase=` (da una
 * fase del Riepilogo), `?periodo=` del Riepilogo.
 *
 * Ogni lettura sta da sola: se mancano le bozze o gli appuntamenti la pagina
 * resta in piedi, solo senza colori o senza «Telefonata oggi».
 */

const DAY_MS = 24 * 60 * 60 * 1000;
type Shape = "colonne" | "elenco";

const SHAPE_OPTIONS: { value: Shape; label: string; icon: React.ReactNode }[] = [
    { value: "colonne", label: "Colonne", icon: <Columns3 size={14} aria-hidden="true" /> },
    { value: "elenco", label: "Elenco", icon: <List size={14} aria-hidden="true" /> }
];

const VIEW_LABEL = Object.fromEntries(LEAD_VIEWS.map(m => [m.view, m.label])) as Record<LeadView, string>;

export default function LeadsPage() {
    usePageTitle("Lead");
    // La testata la disegna la pagina: con la colonna delle viste il titolo sta lì.
    usePageHeader({});
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const isPhone = useMediaQuery("(max-width: 767px)");
    const isNarrow = useMediaQuery("(max-width: 1023px)");

    const [params, setParams] = useSearchParams();
    const view = parseLeadView(params.get("vista"));
    const rawFase = params.get("fase");
    const fase = rawFase && (CRM_STAGES as readonly string[]).includes(rawFase) ? (rawFase as CrmStage) : null;
    // La vecchia `?vista=pipeline` apre le colonne. Persi non ha colonne.
    const wantsBoard = params.get("forma") === "colonne" || params.get("vista") === "pipeline";
    const shape: Shape = wantsBoard && view !== "persi" && fase !== "perso" && !isPhone ? "colonne" : "elenco";
    const rawPeriod = params.get("periodo");
    const period: SummaryPeriod = rawPeriod === "7" || rawPeriod === "90" ? rawPeriod : "30";

    const patchParams = useCallback(
        (patch: Record<string, string | null>) => {
            const next = new URLSearchParams(params);
            if (next.get("vista") === "pipeline") {
                next.delete("vista");
                next.set("forma", "colonne");
            }
            for (const [key, value] of Object.entries(patch)) {
                if (value === null) next.delete(key);
                else next.set(key, value);
            }
            return next;
        },
        [params]
    );
    const hrefOf = useCallback(
        (v: LeadView) => `?${patchParams({ vista: v === "da-lavorare" ? null : v, fase: null }).toString()}`,
        [patchParams]
    );
    const setView = (v: LeadView) => setParams(patchParams({ vista: v === "da-lavorare" ? null : v, fase: null }), { replace: true });
    const setShape = (s: Shape) => setParams(patchParams({ forma: s === "colonne" ? "colonne" : null }), { replace: true });
    const setPeriod = (p: SummaryPeriod) => setParams(patchParams({ periodo: p === "30" ? null : p }), { replace: true });
    const openStage = (stage: CrmStage) => setParams(patchParams({ vista: "tutti", fase: stage, forma: null }));

    const [reloadKey, setReloadKey] = useState(0);
    const [now, setNow] = useState(() => new Date());
    const reload = useCallback(() => {
        setNow(new Date());
        setReloadKey(k => k + 1);
    }, []);

    const venuesLoad = useCrmLoad(() => listCrmVenues(), reloadKey);
    const draftsLoad = useCrmLoad(() => listCrmAgentDraftsOpenOrSince(romeTodayStart(new Date())), reloadKey);
    const teamLoad = useCrmLoad(() => listCrmTeamMembers(), reloadKey);
    const settingsLoad = useCrmLoad(() => getCrmSettings(), reloadKey);
    const appointmentsLoad = useCrmLoad(() => listCrmAppointmentsCreatedSince(new Date(Date.now() - 90 * DAY_MS).toISOString()), reloadKey);

    const venues = useMemo(() => venuesLoad.data ?? [], [venuesLoad.data]);
    const appointments = useMemo(() => appointmentsLoad.data ?? [], [appointmentsLoad.data]);
    const team = useMemo(() => teamLoad.data ?? [], [teamLoad.data]);
    const ctx = useMemo(() => ({ userId, now }), [userId, now]);

    // Le bozze inviate con un gesto escono subito, prima di rileggere.
    const [sentDrafts, setSentDrafts] = useState<ReadonlySet<string>>(() => new Set());
    const drafts = useMemo(() => (draftsLoad.data ?? []).filter(d => !sentDrafts.has(d.id)), [draftsLoad.data, sentDrafts]);
    const openDrafts = useMemo(() => openDraftByVenue(drafts), [drafts]);
    const waits = useMemo(() => venueWaits({ drafts, venues, now }), [drafts, venues, now]);
    const next = useMemo(() => nextAppointments(appointments, now), [appointments, now]);
    const counts = useMemo(() => (venuesLoad.data ? viewCounts(venues, ctx) : null), [venuesLoad.data, venues, ctx]);
    const nameOf = useMemo(() => {
        const names = new Map(team.map(m => [m.user_id, m.display_name]));
        return (id: string | null) => (id ? (names.get(id) ?? null) : null);
    }, [team]);

    // Rimandati a domani (gesto verso sinistra): il prossimo passo scade dopo
    // oggi. Senza la tabella dei passi (migrazione non applicata) nessuno lo è.
    const stepsLoad = useCrmLoad(() => listCrmNextSteps(), reloadKey);
    const stepByVenue = useMemo(() => new Map((stepsLoad.data ?? []).map(st => [st.venue_id, st])), [stepsLoad.data]);
    const [snoozedHere, setSnoozedHere] = useState<ReadonlySet<string>>(() => new Set());
    const todayKey = romeDayKey(now);
    const snoozed = useMemo(() => {
        const ids = snoozedVenueIds(stepsLoad.data ?? [], todayKey);
        for (const id of snoozedHere) ids.add(id);
        return ids;
    }, [stepsLoad.data, todayKey, snoozedHere]);
    const { waiting: undoWaiting, schedule: scheduleSwipe, undo: undoSwipe } = useUndoableActions(SWIPE_UNDO_MS);

    const [query, setQuery] = useState("");
    const [phoneSearch, setPhoneSearch] = useState(false);
    const listed = useMemo(() => {
        const base = fase ? venues.filter(v => v.stage === fase) : venues.filter(v => matchesView(v, view, ctx));
        return searchLeads(base, query);
    }, [venues, fase, view, ctx, query]);
    const onBoard = useMemo(
        () => (fase ? venues.filter(v => v.stage === fase) : boardVenues(venues, view, ctx)),
        [venues, fase, view, ctx]
    );
    const summary = useMemo(() => leadSummary({ venues, appointments, period, now }), [venues, appointments, period, now]);

    const [actionError, setActionError] = useState<string | null>(null);
    const [lostVenueId, setLostVenueId] = useState<string | null>(null);
    const [lockRequest, setLockRequest] = useState<StageLockRequest | null>(null);
    // `?aggiungi=1` (dal Cerca): il drawer si apre e il parametro se ne va.
    const [isAddOpen, setIsAddOpen] = useState(() => params.get("aggiungi") === "1");
    useEffect(() => {
        if (params.get("aggiungi") !== "1") return;
        setIsAddOpen(true);
        setParams(
            p => {
                p.delete("aggiungi");
                return p;
            },
            { replace: true }
        );
    }, [params, setParams]);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const handleSwipe = useCallback(
        (venue: CrmVenueListItem, swipe: LeadSwipe) => {
            const add = (set: ReadonlySet<string>, id: string) => new Set(set).add(id);
            if (swipe === "send") {
                const draftId = openDrafts.get(venue.id);
                if (!draftId) return;
                scheduleSwipe(venue.id, async () => {
                    try {
                        await decideCrmDraft(draftId, "send");
                        setSentDrafts(s => add(s, draftId));
                    } catch (err) {
                        setActionError(crmErrorMessage(err));
                    }
                });
                showToast({
                    message: `Messaggio a ${venue.name}: parte tra 5 secondi.`,
                    type: "info",
                    duration: SWIPE_UNDO_MS,
                    actionLabel: "Annulla",
                    onAction: () => undoSwipe(venue.id)
                });
                return;
            }
            if (!userId) return;
            const existing = stepsLoad.data?.find(st => st.venue_id === venue.id);
            scheduleSwipe(venue.id, async () => {
                try {
                    await setCrmNextStep(
                        venue.id,
                        {
                            step: snoozeStepText(existing),
                            dueOn: snoozeDueOn(existing, shiftDayKey(romeDayKey(new Date()), 1)),
                            ownerUserId: existing ? existing.owner_user_id : userId,
                            snoozed: true
                        },
                        userId
                    );
                    setSnoozedHere(s => add(s, venue.id));
                } catch (err) {
                    setActionError(crmErrorMessage(err));
                }
            });
            showToast({
                message: `${venue.name} torna domani.`,
                type: "info",
                duration: SWIPE_UNDO_MS,
                actionLabel: "Annulla",
                onAction: () => undoSwipe(venue.id)
            });
        },
        [scheduleSwipe, undoSwipe, openDrafts, showToast, userId, stepsLoad.data]
    );
    const phoneListed = useMemo(() => {
        const visible = listed.filter(v => !undoWaiting.has(v.id));
        return view === "da-lavorare" && !fase ? visible.filter(v => !snoozed.has(v.id)) : visible;
    }, [listed, undoWaiting, view, fase, snoozed]);
    const snoozedListed = view === "da-lavorare" && !fase ? listed.filter(v => snoozed.has(v.id)).length : 0;

    const handleWhatsapp = useCallback(
        (venue: CrmVenueListItem) => {
            const contact = venue.crm_contacts[0];
            if (!contact?.phone_e164) return;
            // Prima la finestra (gesto dell'utente), poi la registrazione.
            window.open(
                crmWhatsappLink(contact.phone_e164, settingsLoad.data?.whatsapp_template ?? null, {
                    contactName: contact.name,
                    venueName: venue.name_pending ? null : venue.name,
                    senderName: crmSenderName(team, userId ?? undefined)
                }),
                "_blank",
                "noopener"
            );
            setActionError(null);
            void logCrmWhatsappOpened(venue.id, venue.crm_leads[0]?.id ?? null)
                .then(() => reload())
                .catch(err => setActionError(crmErrorMessage(err)));
        },
        [settingsLoad.data, team, userId, reload]
    );

    const handleMove = useCallback(
        async (venue: CrmVenueListItem, stage: CrmStage) => {
            if (stage === "perso") {
                setLostVenueId(venue.id);
                return;
            }
            if (needsStageLock(venue.stage, stage, Boolean(venue.stage_locked_at))) {
                setLockRequest({ venueId: venue.id, venueName: venue.name, stage });
                return;
            }
            setActionError(null);
            try {
                // Fase attesa = quella che si vede: se un altro l'ha appena
                // spostata (o il sistema), non si sovrascrive.
                const moved = await moveCrmStage(venue.id, stage, undefined, venue.stage);
                reload();
                if (!moved) {
                    setActionError(`${venue.name} era già stata spostata: ecco dove si trova ora.`);
                    return;
                }
                showToast({ message: `${venue.name}: ${CRM_STAGE_LABEL[stage]}.`, type: "success" });
            } catch (err) {
                setActionError(crmErrorMessage(err));
            }
        },
        [reload, showToast]
    );

    const columns = useMemo<ColumnDefinition<CrmVenueListItem>[]>(
        () => [
            {
                id: "venue",
                header: "Locale",
                width: "minmax(0, 1.2fr)",
                cell: (_v, row) => {
                    const lead = row.crm_leads[0];
                    return (
                        <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                            <span>{row.name}</span>
                            <span>
                                {[
                                    row.name_pending ? "Locale da completare" : null,
                                    row.name_to_verify ? "Locale da verificare" : null,
                                    row.city,
                                    lead ? CRM_SOURCE_LABEL[lead.source] : null
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                        </div>
                    );
                }
            },
            {
                // La fase con il percorso sotto (R2): una colonna in meno.
                id: "stage",
                header: "Fase",
                width: "168px",
                cell: (_v, row) => (
                    <span className={styles.stageCell}>
                        <span>{CRM_STAGE_LABEL[row.stage]}</span>
                        <LeadTrack stage={row.stage} />
                    </span>
                )
            },
            {
                id: "next",
                header: "Prossimo passo",
                cell: (_v, row) => {
                    const line = nextStepLine({ venue: row, wait: waits.get(row.id), step: stepByVenue.get(row.id), next: next.get(row.id), now });
                    return (
                        <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                            <span className={line.warn ? styles.contactWarn : undefined}>{line.text}</span>
                            {line.sub && <span>{line.sub}</span>}
                        </div>
                    );
                }
            },
            {
                id: "contact",
                header: "Ultimo contatto",
                width: "180px",
                hideOnPhone: true,
                cell: (_v, row) => {
                    const line = lastContactLine(row, now);
                    return <span className={line.warn ? styles.contactWarn : undefined}>{line.text}</span>;
                }
            },
            {
                id: "owner",
                header: "Chi",
                width: "48px",
                hideOnPhone: true,
                cell: (_v, row) => {
                    const owner = nameOf(row.assigned_to);
                    return owner ? (
                        <Avatar name={owner} size="sm" />
                    ) : (
                        <span className={styles.nobody} aria-label="Nessuno">
                            —
                        </span>
                    );
                }
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_v, row) => (
                    <TableRowActions
                        actions={[
                            {
                                label: "Scrivi su WhatsApp",
                                onClick: () => handleWhatsapp(row),
                                hidden: !row.crm_contacts[0]?.phone_e164 || (row.stage === "perso" && row.lost_kind === "stop")
                            },
                            { label: "Apri", onClick: () => navigate(row.id) }
                        ]}
                    />
                )
            }
        ],
        [waits, next, stepByVenue, now, nameOf, handleWhatsapp, navigate]
    );

    const chipOptions = useMemo<ChipOption<LeadView>[]>(() => {
        const views = LEAD_VIEWS.map(m => ({ value: m.view, label: m.short, count: counts?.[m.view] }));
        const recap = { value: "riepilogo" as LeadView, label: "Riepilogo" };
        return isPhone ? [...views, recap] : [recap, ...views];
    }, [counts, isPhone]);

    const meta = useCallback(
        (venue: CrmVenueListItem) => cardMeta({ venue, wait: waits.get(venue.id), next: next.get(venue.id), now }),
        [waits, next, now]
    );

    const loadError = venuesLoad.error && (
        <InlineBanner
            variant="error"
            action={
                <Button variant="secondary" size="sm" onClick={reload}>
                    Riprova
                </Button>
            }
        >
            {venuesLoad.error === "Non si è caricato. Riprova tra poco."
                ? "I lead non si sono caricati. Riprova tra poco."
                : venuesLoad.error}
        </InlineBanner>
    );
    const actionBanner = actionError && (
        <InlineBanner
            variant="error"
            action={
                <Button variant="secondary" size="sm" onClick={() => setActionError(null)}>
                    Chiudi
                </Button>
            }
        >
            {actionError}
        </InlineBanner>
    );
    const faseFilter = fase && (
        <div className={styles.stageFilter}>
            <Text as="span" variant="body-sm">
                Fermi in <strong>{CRM_STAGE_LABEL[fase]}</strong>
            </Text>
            <Button variant="ghost" size="sm" onClick={() => setParams(patchParams({ fase: null }), { replace: true })}>
                Togli il filtro
            </Button>
        </div>
    );
    const emptyState = {
        title: venues.length === 0 ? "Ancora nessun lead" : query ? "Nessun lead con questa ricerca" : "Nessun lead in questa vista",
        description:
            venues.length === 0
                ? "I lead della landing arrivano qui da soli entro un minuto. Quelli delle chat WhatsApp si aggiungono a mano."
                : undefined,
        icon: <UserPlus size={32} strokeWidth={1.5} />
    };
    const table = (
        <DataTable
            data={listed}
            columns={columns}
            isLoading={venuesLoad.loading && !venuesLoad.data}
            onRowClick={row => navigate(row.id)}
            ariaLabel="Lead"
            isFiltered={view !== "tutti" || Boolean(query) || Boolean(fase)}
            onClearFilters={() => {
                setQuery("");
                setView("tutti");
            }}
            emptyState={emptyState}
        />
    );

    const overlays = (
        <>
            <LostStageDialog
                venueId={lostVenueId}
                onClose={() => setLostVenueId(null)}
                onMoved={async () => {
                    reload();
                    showToast({ message: "Spostato in Perso.", type: "success" });
                }}
            />
            <StageLockDialog
                request={lockRequest}
                onClose={() => setLockRequest(null)}
                onMoved={async request => {
                    reload();
                    showToast({
                        message: `${request.venueName}: ${CRM_STAGE_LABEL[request.stage]}, fase bloccata a mano.`,
                        type: "success"
                    });
                }}
            />
            <AddLeadDrawer
                open={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onCreated={venueId => {
                    setIsAddOpen(false);
                    navigate(venueId);
                }}
            />
            <ImportMetaCsvDrawer open={isImportOpen} onClose={() => setIsImportOpen(false)} onImported={async () => reload()} />
            <SettingsDrawer open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onChanged={reload} />
        </>
    );

    // ── Telefono (T8a) ──────────────────────────────────────────────────
    if (isPhone) {
        return (
            <div className={styles.main}>
                <header className={styles.phoneHead}>
                    <Text as="h1" variant="title-md" weight={700}>
                        Lead
                    </Text>
                    <span className={styles.phoneHeadActions}>
                        {view !== "riepilogo" && (
                            <IconButton
                                icon={<Search size={16} />}
                                aria-label={phoneSearch ? "Chiudi la ricerca" : "Cerca un locale o un numero"}
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    setPhoneSearch(v => !v);
                                    setQuery("");
                                }}
                            />
                        )}
                        <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} onClick={() => setIsAddOpen(true)}>
                            Nuovo
                        </Button>
                    </span>
                </header>
                {phoneSearch && view !== "riepilogo" && (
                    <ToolbarSearch value={query} onChange={setQuery} placeholder="Cerca un locale o un numero" />
                )}
                <div className={styles.phoneChips}>
                    <ChipGroupSingle options={chipOptions} value={view} onChange={setView} ariaLabel="Viste dei lead" layout="auto" />
                </div>
                {loadError}
                {actionBanner}
                {faseFilter}
                {view === "riepilogo" ? (
                    <>
                        <SegmentedControl value={period} onChange={setPeriod} options={SUMMARY_PERIODS} size="sm" />
                        <LeadSummaryView summary={summary} onStage={openStage} />
                    </>
                ) : venuesLoad.loading && !venuesLoad.data ? (
                    <Text as="p" variant="body-sm" colorVariant="muted">
                        Carico…
                    </Text>
                ) : phoneListed.length === 0 && undoWaiting.size === 0 ? (
                    <Text as="p" variant="body-sm" colorVariant="muted">
                        {snoozedListed > 0 ? "Per oggi niente: il resto torna domani." : `${emptyState.title}.`}
                    </Text>
                ) : (
                    <>
                        <LeadPhoneList
                            venues={phoneListed}
                            waits={waits}
                            next={next}
                            nameOf={nameOf}
                            now={now}
                            drafts={openDrafts}
                            onSwipe={handleSwipe}
                        />
                        <Text as="p" variant="caption" colorVariant="muted" className={styles.swipeHint}>
                            Verso destra: invia la bozza. Verso sinistra: rimanda a domani. Sempre con «Annulla» per 5 secondi.
                            {snoozedListed > 0 && ` ${snoozedListed === 1 ? "1 rimandato" : `${snoozedListed} rimandati`} a domani.`}
                        </Text>
                    </>
                )}
                {overlays}
            </div>
        );
    }

    // ── Computer e tablet (V4, R4a, R4b) ────────────────────────────────
    const heading = view === "riepilogo" ? "Riepilogo" : isNarrow ? "Lead" : fase ? `Fase: ${CRM_STAGE_LABEL[fase]}` : VIEW_LABEL[view];
    const headingCount =
        view === "riepilogo" ? null : isNarrow ? venues.length : fase ? listed.length : query ? listed.length : (counts?.[view] ?? 0);

    const content = (
        <section className={styles.main} aria-labelledby="lead-heading">
            <header className={styles.head}>
                <Text as={isNarrow ? "h1" : "h2"} id="lead-heading" variant="title-md" weight={700} className={styles.headTitle}>
                    {heading}
                    {headingCount !== null && venuesLoad.data && (
                        <Text as="span" variant="title-md" className={styles.headCount}>
                            · {headingCount}
                        </Text>
                    )}
                </Text>
                <div className={styles.headActions}>
                    {view === "riepilogo" ? (
                        <SegmentedControl value={period} onChange={setPeriod} options={SUMMARY_PERIODS} size="sm" />
                    ) : (
                        <>
                            {view !== "persi" && fase !== "perso" && (
                                <SegmentedControl value={shape} onChange={setShape} options={SHAPE_OPTIONS} size="sm" />
                            )}
                            {shape === "elenco" && (
                                <ToolbarSearch value={query} onChange={setQuery} placeholder="Cerca un locale o un numero" />
                            )}
                            <Button variant="secondary" size="sm" onClick={() => setIsImportOpen(true)}>
                                Importa CSV Meta
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
                                Aggiungi lead
                            </Button>
                            <IconButton
                                icon={<Settings size={16} />}
                                aria-label="Impostazioni dei lead"
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsSettingsOpen(true)}
                            />
                        </>
                    )}
                </div>
            </header>
            {isNarrow && <ChipGroupSingle options={chipOptions} value={view} onChange={setView} ariaLabel="Viste dei lead" layout="auto" />}
            {loadError}
            {actionBanner}
            {faseFilter}
            {view === "riepilogo" ? (
                <LeadSummaryView summary={summary} onStage={openStage} />
            ) : shape === "colonne" ? (
                <PipelineBoard
                    venues={onBoard}
                    meta={meta}
                    teamName={nameOf}
                    onMove={(venue, stage) => void handleMove(venue, stage)}
                    onOpen={id => navigate(id)}
                />
            ) : (
                table
            )}
            {overlays}
        </section>
    );

    if (isNarrow) return <div className={styles.layoutSingle}>{content}</div>;
    return (
        <div className={styles.layout}>
            <LeadViewsNav view={view} counts={counts} hrefOf={hrefOf} />
            {content}
        </div>
    );
}
