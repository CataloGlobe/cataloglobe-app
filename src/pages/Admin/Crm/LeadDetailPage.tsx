import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, MoreHorizontal, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { Menu } from "@/components/ui/Menu";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
    assignCrmVenue,
    getCrmSettings,
    getCrmVenue,
    listCrmTeamMembers,
    listCrmVenues,
    logCrmWhatsappOpened,
    moveCrmStage,
    unlockCrmStage
} from "@/services/supabase/crm";
import { listCrmAppointmentsCreatedSince } from "@/services/supabase/crmAgenda";
import { listCrmAgentDraftsOpenOrSince } from "@/services/supabase/crmAgentTrial";
import { getCrmNextStep } from "@/services/supabase/crmNextSteps";
import { listCrmMessages, setCrmAgentHold } from "@/services/supabase/crmWhatsappAgent";
import { CRM_STAGES, type CrmAppointment, type CrmContact, type CrmStage, type CrmTeamMember, type CrmVenueDetail } from "@/types/crm";
import { crmAccountLabel, needsStageLock } from "@/utils/crm/accountLabels";
import { romeTodayStart } from "@/utils/crm/agentsOverview";
import { venueWaits } from "@/utils/crm/crmHome";
import { chatItems, leadBrief } from "@/utils/crm/leadDetail";
import { LEAD_VIEWS, nextAppointments, parseLeadView, type LeadView } from "@/utils/crm/leadViews";
import { CRM_EVENT_LABEL, CRM_LOST_KIND_LABEL, CRM_STAGE_LABEL, CRM_STAGE_VARIANT, crmErrorMessage } from "@/utils/crm/stages";
import { leadToVerify } from "@/utils/crm/venueNameCheck";
import { waErrorMessage } from "@/utils/crm/waLabels";
import { crmSenderName, crmWhatsappLink } from "@/utils/crm/whatsapp";
import { whatsappUrl } from "@shared/crmWhatsapp";
import { AccountCard } from "./AccountCard";
import { CallCard } from "./CallCard";
import { LostStageDialog } from "./LostStageDialog";
import { ObjectionsCard } from "./ObjectionsCard";
import { ReferredByCard } from "./ReferredByCard";
import { StageLockDialog, type StageLockRequest } from "./StageLockDialog";
import { StopExitDialog, type StopExitRequest } from "./StopExitDialog";
import { VenueNameCard } from "./VenueNameCard";
import { VenueNameCheckCard } from "./VenueNameCheckCard";
import { LeadChat } from "./components/LeadChat";
import { LeadDetailList } from "./components/LeadDetailList";
import { ContactsSection, History, NextStepSection, NotesSection, RequestsSection } from "./components/LeadFacts";
import { useCrmLoad } from "./hooks/useCrmLoad";
import styles from "./LeadDetail.module.scss";

/**
 * La scheda del lead (canvas V5 e T8b, versione finale del 2026-10-05).
 *
 * Scrivania: a sinistra la vista da cui si arriva (J e K per il prossimo), in
 * mezzo la conversazione con la bozza dell'agente in fondo, a destra prossimo
 * passo, contatti, richieste, telefonata, account e note. Fase e chi lo segue
 * stanno nella testata, come lo stato di un ticket.
 *
 * Telefono: nome e fase in alto, quattro schede (Chat, Dati, Telefonata,
 * Storia), la bozza e «Scrivi tu» in fondo alla chat.
 *
 * Ogni lettura sta da sola: se la conversazione non si carica, il resto
 * della scheda c'è. Perso chiede sempre tipo e motivo (vincolo anche a DB).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type PhoneTab = "chat" | "dati" | "telefonata" | "storia";

export default function LeadDetailPage() {
    const { venueId = "" } = useParams<{ venueId: string }>();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const isPhone = useMediaQuery("(max-width: 767px)");
    const view: LeadView = parseLeadView(params.get("vista"));

    const [detail, setDetail] = useState<CrmVenueDetail | null>(null);
    const [team, setTeam] = useState<CrmTeamMember[]>([]);
    const [whatsappTemplate, setWhatsappTemplate] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [lostOpen, setLostOpen] = useState(false);
    const [lockRequest, setLockRequest] = useState<StageLockRequest | null>(null);
    const [stopExit, setStopExit] = useState<StopExitRequest | null>(null);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [activeCall, setActiveCall] = useState<CrmAppointment | null>(null);
    const [phoneTab, setPhoneTab] = useState<PhoneTab>("chat");
    const [tick, setTick] = useState(0);
    const [now, setNow] = useState(() => new Date());

    usePageTitle(detail?.venue.name ?? "Lead");
    // La testata la disegna la pagina (V5): niente PageHeader del guscio.
    usePageHeader({});

    // Un errore di rete dopo un'azione non deve far sparire la scheda già
    // aperta: «non trovato» solo se la scheda non è mai arrivata.
    const loadedVenueRef = useRef<string | null>(null);
    const loadDetail = useCallback(async () => {
        try {
            const [data, members, settings] = await Promise.all([
                getCrmVenue(venueId),
                listCrmTeamMembers(),
                // Il testo di WhatsApp non deve far cadere la pagina.
                getCrmSettings().catch(() => null)
            ]);
            setDetail(data);
            setTeam(members);
            setWhatsappTemplate(settings?.whatsapp_template ?? null);
            setNotFound(false);
            loadedVenueRef.current = venueId;
        } catch {
            if (loadedVenueRef.current === venueId) {
                setActionError("Non riesco ad aggiornare la scheda. Ricarica la pagina.");
            } else {
                setNotFound(true);
            }
        } finally {
            setIsLoading(false);
        }
    }, [venueId]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    // Cambiando lead si riparte dalla chat; «Sposta» dall'Agenda arriva con
    // ?telefonata=sposta e apre la telefonata (al telefono la sua scheda).
    const moveCall = params.get("telefonata") === "sposta";
    useEffect(() => {
        setPhoneTab(moveCall ? "telefonata" : "chat");
        setScheduleOpen(moveCall);
        setActiveCall(null);
    }, [venueId, moveCall]);

    const reload = useCallback(async () => {
        await loadDetail();
        setTick(t => t + 1);
        setNow(new Date());
    }, [loadDetail]);

    const key = `${venueId}:${tick}`;
    const messages = useCrmLoad(() => listCrmMessages(venueId), key);
    const nextStep = useCrmLoad(() => getCrmNextStep(venueId), key);
    const drafts = useCrmLoad(() => listCrmAgentDraftsOpenOrSince(romeTodayStart(new Date())), tick);
    const venues = useCrmLoad(() => listCrmVenues(), tick);
    const appointments = useCrmLoad(() => listCrmAppointmentsCreatedSince(new Date(Date.now() - 90 * DAY_MS).toISOString()), tick);

    const teamName = useCallback(
        (id: string | null) => (id ? (team.find(m => m.user_id === id)?.display_name ?? "—") : "Nessuno"),
        [team]
    );
    const nameOrNull = useCallback((id: string | null) => (id ? (team.find(m => m.user_id === id)?.display_name ?? null) : null), [team]);

    const waits = useMemo(
        () => venueWaits({ drafts: drafts.data ?? [], venues: venues.data ?? [], now }),
        [drafts.data, venues.data, now]
    );
    const next = useMemo(() => nextAppointments(appointments.data ?? [], now), [appointments.data, now]);
    const draft = useMemo(
        () => (drafts.data ?? []).find(d => d.venue_id === venueId && d.status === "pending") ?? null,
        [drafts.data, venueId]
    );
    const labelOf = useCallback((type: keyof typeof CRM_EVENT_LABEL) => CRM_EVENT_LABEL[type], []);
    const items = useMemo(
        () => (messages.data && detail ? chatItems(messages.data, detail.events, teamName, labelOf) : null),
        [messages.data, detail, teamName, labelOf]
    );

    const viewSuffix = view === "da-lavorare" ? "" : `?vista=${view}`;
    const hrefOf = useCallback((id: string) => `/admin/lead/${id}${viewSuffix}`, [viewSuffix]);
    const viewHref = useCallback(
        (v: LeadView) => {
            const target = (venues.data ?? []).length > 0 ? `/admin/lead/${venueId}` : "/admin/lead";
            return v === "da-lavorare" ? target : `${target}?vista=${v}`;
        },
        [venues.data, venueId]
    );

    const handleStageChange = useCallback(
        async (stage: CrmStage) => {
            if (!detail || stage === detail.venue.stage) return;
            if (stage === "perso") {
                setLostOpen(true);
                return;
            }
            if (detail.venue.stage === "perso" && detail.venue.lost_kind === "stop") {
                setStopExit({ venueId: detail.venue.id, venueName: detail.venue.name, stage });
                return;
            }
            if (needsStageLock(detail.venue.stage, stage, Boolean(detail.venue.stage_locked_at))) {
                setLockRequest({ venueId: detail.venue.id, venueName: detail.venue.name, stage });
                return;
            }
            setIsBusy(true);
            setActionError(null);
            try {
                await moveCrmStage(detail.venue.id, stage, undefined, detail.venue.stage);
                await reload();
                showToast({ message: `Spostato in ${CRM_STAGE_LABEL[stage]}.`, type: "success" });
            } catch (err) {
                setActionError(crmErrorMessage(err));
            } finally {
                setIsBusy(false);
            }
        },
        [detail, reload, showToast]
    );

    async function runAction(action: () => Promise<unknown>, message: string, toError = crmErrorMessage) {
        setIsBusy(true);
        setActionError(null);
        try {
            await action();
            await reload();
            showToast({ message, type: "success" });
        } catch (err) {
            setActionError(toError(err));
        } finally {
            setIsBusy(false);
        }
    }

    const contact: CrmContact | undefined = detail?.contacts.find(c => c.phone_e164) ?? detail?.contacts[0];
    const stopped = detail?.venue.stage === "perso" && detail.venue.lost_kind === "stop";
    const canWrite = Boolean(contact?.phone_e164) && !stopped;

    /** Apre WhatsApp col testo (o col messaggio di partenza) e lo segna nella storia. */
    function openWhatsapp(text?: string) {
        if (!detail || !contact?.phone_e164) return;
        // Prima la finestra (gesto dell'utente), poi la registrazione.
        const url = text
            ? whatsappUrl(contact.phone_e164, text)
            : crmWhatsappLink(contact.phone_e164, whatsappTemplate, {
                  contactName: contact.name,
                  venueName: detail.venue.name_pending ? null : detail.venue.name,
                  senderName: crmSenderName(team, userId)
              });
        window.open(url, "_blank", "noopener");
        setActionError(null);
        void logCrmWhatsappOpened(detail.venue.id, detail.leads[0]?.id ?? null)
            .then(() => reload())
            .catch(err => setActionError(crmErrorMessage(err)));
    }

    if (isLoading) return <LoadingState message="Caricamento lead…" />;

    if (notFound || !detail) {
        return (
            <div className={styles.missing}>
                <Text variant="body" colorVariant="muted">
                    Questo lead non esiste più.
                </Text>
                <div>
                    <Button variant="secondary" onClick={() => navigate("/admin/lead")}>
                        Torna ai lead
                    </Button>
                </div>
            </div>
        );
    }

    const { venue, contacts, leads, events } = detail;
    const held = Boolean(venue.agent_hold_at);
    const lost = venue.stage === "perso";
    const verifyLead = venue.name_pending ? null : leadToVerify(leads, events);
    const owner = nameOrNull(venue.assigned_to);
    const viewLabel = LEAD_VIEWS.find(m => m.view === view)?.label ?? "Da lavorare";
    const brief = leadBrief({
        venue,
        leads,
        messages: messages.data ?? [],
        draft,
        nextStep: nextStep.data ?? null
    });

    const moreMenu = (
        <Menu
            align="end"
            trigger={<IconButton variant="outline" size="sm" icon={<MoreHorizontal size={18} />} aria-label="Altre azioni" disabled={isBusy} />}
        >
            <Menu.Item
                onSelect={() =>
                    void runAction(
                        () => setCrmAgentHold(venue.id, !held),
                        held ? "Ridato all'agente." : "Lo gestisci tu: l'agente non gli scrive più.",
                        waErrorMessage
                    )
                }
                description={held ? "L'agente torna a scrivergli." : "L'agente non gli scrive più."}
            >
                {held ? "Ridallo all'agente" : "Lo prendo io"}
            </Menu.Item>
            {canWrite && <Menu.Item onSelect={() => openWhatsapp()}>Apri WhatsApp</Menu.Item>}
            {contact?.phone_e164 && <Menu.Item href={`tel:${contact.phone_e164}`}>Chiama {contact.phone_e164}</Menu.Item>}
            {venue.stage_locked_at && (
                <Menu.Item onSelect={() => void runAction(() => unlockCrmStage(venue.id), "Fase sbloccata: segue di nuovo l'abbonamento.")}>
                    Sblocca la fase
                </Menu.Item>
            )}
            {isPhone && (
                <>
                    <Menu.Separator />
                    <Menu.Label>Sposta in</Menu.Label>
                    {CRM_STAGES.filter(s => s !== venue.stage && s !== "perso").map(s => (
                        <Menu.Item key={s} onSelect={() => void handleStageChange(s)}>
                            {CRM_STAGE_LABEL[s]}
                        </Menu.Item>
                    ))}
                </>
            )}
            {!lost && (
                <>
                    <Menu.Separator />
                    <Menu.Item variant="destructive" onSelect={() => setLostOpen(true)}>
                        Segna come perso
                    </Menu.Item>
                </>
            )}
        </Menu>
    );

    const notices = (
        <>
            {actionError && <InlineBanner variant="error">{actionError}</InlineBanner>}
            {lost && venue.lost_kind && (
                <InlineBanner variant={venue.lost_kind === "stop" ? "error" : "info"}>
                    Perso, {CRM_LOST_KIND_LABEL[venue.lost_kind].toLowerCase()}: {venue.lost_reason}
                </InlineBanner>
            )}
            {venue.stage_locked_at && (
                <InlineBanner
                    variant="warning"
                    action={
                        <Button variant="secondary" size="sm" onClick={() => void runAction(() => unlockCrmStage(venue.id), "Fase sbloccata: segue di nuovo l'abbonamento.")} disabled={isBusy}>
                            Sblocca
                        </Button>
                    }
                >
                    Fase bloccata a mano da {teamName(venue.stage_locked_by)}: {venue.stage_lock_note}
                </InlineBanner>
            )}
            {venue.name_pending && <VenueNameCard venue={venue} onSaved={reload} />}
            {verifyLead && <VenueNameCheckCard venue={venue} lead={verifyLead} onChanged={reload} />}
        </>
    );

    const chat = (
        <LeadChat
            venueId={venue.id}
            held={held}
            items={items}
            messagesError={messages.error}
            draft={draft}
            draftWait={draft ? waits.get(venue.id) : undefined}
            now={now}
            canWrite={canWrite}
            phone={isPhone}
            onWrite={text => openWhatsapp(text)}
            onChanged={reload}
        />
    );

    const callSection = (
        <CallCard
            flat
            venueId={venue.id}
            venueName={venue.name}
            lost={lost}
            team={team}
            currentUserId={userId}
            teamName={teamName}
            onChanged={reload}
            scheduleOpen={isPhone ? undefined : scheduleOpen}
            onScheduleOpenChange={isPhone ? undefined : setScheduleOpen}
            onActiveChange={setActiveCall}
        />
    );

    const facts = (
        <>
            <NextStepSection
                venueId={venue.id}
                step={nextStep.loading && nextStep.data === null ? undefined : nextStep.data}
                loadError={nextStep.error}
                team={team}
                userId={userId}
                teamName={teamName}
                now={now}
                onChanged={reload}
            />
            <ContactsSection contacts={contacts} leads={leads} />
            <RequestsSection leads={leads} />
            {!isPhone && callSection}
            <AccountCard
                flat
                venueId={venue.id}
                tenantId={venue.tenant_id}
                linkSource={venue.link_source}
                accountLabel={crmAccountLabel(venue)}
                onChanged={reload}
            />
            <ObjectionsCard venueId={venue.id} now={now} reloadKey={key} />
            <ReferredByCard venueId={venue.id} referredBy={venue.referred_by} onChanged={reload} />
            <NotesSection venueId={venue.id} events={events} teamName={teamName} now={now} onChanged={reload} />
        </>
    );

    const dialogs = (
        <>
            <StopExitDialog
                request={stopExit}
                onClose={() => setStopExit(null)}
                onMoved={request => {
                    setStopExit(null);
                    void reload();
                    showToast({ message: `Spostato in ${CRM_STAGE_LABEL[request.stage]}.`, type: "success" });
                }}
            />
            <StageLockDialog
                request={lockRequest}
                onClose={() => setLockRequest(null)}
                onMoved={async request => {
                    await reload();
                    showToast({ message: `Spostato in ${CRM_STAGE_LABEL[request.stage]}, fase bloccata a mano.`, type: "success" });
                }}
            />
            <LostStageDialog
                venueId={lostOpen ? venue.id : null}
                onClose={() => setLostOpen(false)}
                onMoved={async () => {
                    await reload();
                    showToast({ message: "Spostato in Perso.", type: "success" });
                }}
            />
        </>
    );

    if (isPhone) {
        return (
            <div className={styles.phone}>
                <header className={styles.phoneHead}>
                    <Link to={`/admin/lead${viewSuffix}`} className={styles.back} aria-label="Torna ai lead">
                        <ChevronLeft size={22} aria-hidden="true" />
                    </Link>
                    <div className={styles.phoneTitle}>
                        <Text as="h1" variant="title-sm" weight={700} className={styles.ellipsis}>
                            {venue.name}
                        </Text>
                        <Text as="p" variant="caption" colorVariant="muted" className={styles.ellipsis}>
                            {[CRM_STAGE_LABEL[venue.stage], owner].filter(Boolean).join(" · ")}
                        </Text>
                    </div>
                    {contact?.phone_e164 && (
                        <IconButton
                            variant="outline"
                            size="sm"
                            icon={<Phone size={16} />}
                            aria-label={`Chiama ${contact.phone_e164}`}
                            onClick={() => {
                                window.location.href = `tel:${contact.phone_e164}`;
                            }}
                        />
                    )}
                    {moreMenu}
                </header>
                <Tabs<PhoneTab> value={phoneTab} onChange={setPhoneTab} variant="line">
                    <div className={styles.phoneTabs}>
                        <Tabs.List aria-label="Scheda del lead">
                            <Tabs.Tab value="chat">Chat</Tabs.Tab>
                            <Tabs.Tab value="dati">Dati</Tabs.Tab>
                            <Tabs.Tab value="telefonata">Telefonata</Tabs.Tab>
                            <Tabs.Tab value="storia">Storia</Tabs.Tab>
                        </Tabs.List>
                    </div>
                    {phoneTab === "chat" ? (
                        <div className={styles.phoneChat}>
                            {(actionError || lost || venue.stage_locked_at || venue.name_pending || verifyLead) && (
                                <div className={styles.phoneNotices}>{notices}</div>
                            )}
                            {chat}
                        </div>
                    ) : (
                        <div className={styles.phoneBody}>
                            {phoneTab === "dati" && facts}
                            {phoneTab === "telefonata" && callSection}
                            {phoneTab === "storia" && <History events={events} teamName={teamName} />}
                        </div>
                    )}
                </Tabs>
                {dialogs}
            </div>
        );
    }

    return (
        <div className={styles.frame}>
            <LeadDetailList
                currentVenueId={venue.id}
                view={view}
                venues={venues.data}
                waits={waits}
                next={next}
                userId={userId}
                now={now}
                hrefOf={hrefOf}
                viewHref={viewHref}
            />

            <section className={styles.center} aria-labelledby="lead-name">
                <header className={styles.head}>
                    <nav className={styles.crumbs} aria-label="Percorso">
                        <Text as="span" variant="caption" colorVariant="muted">
                            <Link to="/admin/lead" className={styles.crumbLink}>
                                ‹ Lead
                            </Link>
                            {" / "}
                            <Link to={`/admin/lead${viewSuffix}`} className={styles.crumbLink}>
                                {viewLabel}
                            </Link>
                            {" / "}
                            {venue.name}
                        </Text>
                    </nav>
                    <div className={styles.titleRow}>
                        <Text as="h1" id="lead-name" variant="title-md" weight={700} className={styles.ellipsis}>
                            {venue.name}
                        </Text>
                        <Menu
                            trigger={
                                <button type="button" className={styles.stagePill} data-variant={CRM_STAGE_VARIANT[venue.stage]} disabled={isBusy}>
                                    <Text as="span" variant="caption" weight={600} color="inherit">
                                        {CRM_STAGE_LABEL[venue.stage]}
                                    </Text>
                                    <ChevronDown size={12} aria-hidden="true" />
                                </button>
                            }
                        >
                            <Menu.Label>Sposta in</Menu.Label>
                            {CRM_STAGES.filter(s => s !== venue.stage).map(s => (
                                <Menu.Item key={s} variant={s === "perso" ? "destructive" : "default"} onSelect={() => void handleStageChange(s)}>
                                    {CRM_STAGE_LABEL[s]}
                                </Menu.Item>
                            ))}
                        </Menu>
                        <Menu
                            trigger={
                                <button type="button" className={styles.ownerButton} disabled={isBusy || team.length === 0}>
                                    <Text as="span" variant="caption" color="inherit">
                                        {owner ? `segue ${owner}` : "nessuno lo segue"}
                                    </Text>
                                </button>
                            }
                        >
                            <Menu.Label>Lo segue</Menu.Label>
                            {team.map(m => (
                                <Menu.Item
                                    key={m.user_id}
                                    disabled={m.user_id === venue.assigned_to}
                                    onSelect={() => void runAction(() => assignCrmVenue(venue.id, m.user_id), `Assegnato a ${m.display_name}.`)}
                                >
                                    {m.display_name}
                                </Menu.Item>
                            ))}
                        </Menu>
                        {held && <StatusBadge variant="warning" label="Lo gestite voi" />}
                        <span className={styles.titleActions}>
                            {!lost && (
                                <Button variant="secondary" size="sm" onClick={() => setScheduleOpen(true)}>
                                    {activeCall ? "Sposta telefonata" : "Fissa telefonata"}
                                </Button>
                            )}
                            {moreMenu}
                        </span>
                    </div>
                    <div className={styles.brief}>
                        <Text as="span" variant="caption-xs" weight={700} className={styles.briefLabel}>
                            In breve
                        </Text>
                        <Text as="p" variant="body-sm" className={styles.briefText}>
                            {brief}
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted" className={styles.briefSource}>
                            dai dati del lead
                        </Text>
                    </div>
                    {notices}
                </header>
                {chat}
            </section>

            <aside className={styles.side} aria-label="Dati del lead">
                {facts}
            </aside>
            {dialogs}
        </div>
    );
}
