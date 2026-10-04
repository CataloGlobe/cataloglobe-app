import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { Select } from "@/components/ui/Select/Select";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
    addCrmNote,
    assignCrmVenue,
    getCrmSettings,
    getCrmVenue,
    listCrmTeamMembers,
    logCrmWhatsappOpened,
    moveCrmStage,
    unlockCrmStage
} from "@/services/supabase/crm";
import { CRM_ACCOUNT_STATE_LABEL, crmAccountLabel, needsStageLock } from "@/utils/crm/accountLabels";
import { crmSenderName, crmWhatsappLink } from "@/utils/crm/whatsapp";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import {
    CRM_EVENT_LABEL,
    CRM_LOST_KIND_LABEL,
    CRM_SOURCE_LABEL,
    CRM_STAGE_LABEL,
    crmErrorMessage
} from "@/utils/crm/stages";
import {
    CRM_STAGES,
    type CrmEvent,
    type CrmAccountState,
    type CrmContact,
    type CrmStage,
    type CrmTeamMember,
    type CrmVenueDetail
} from "@/types/crm";
import { AccountCard } from "./AccountCard";
import { CallCard } from "./CallCard";
import { LostStageDialog } from "./LostStageDialog";
import { StageLockDialog, type StageLockRequest } from "./StageLockDialog";
import { VenueNameCard } from "./VenueNameCard";
import { VenueNameCheckCard } from "./VenueNameCheckCard";
import { WhatsappConversationCard } from "./WhatsappConversationCard";
import { leadAnswerRows } from "@/utils/crm/leadAnswers";
import { leadToVerify } from "@/utils/crm/venueNameCheck";
import { describeCallEvent } from "@/utils/crm/agenda";
import styles from "./Crm.module.scss";

/**
 * Scheda del locale: contatti, richieste (una per ingresso, con le risposte
 * del modulo), storia unica con le note. Fase e assegnatario stanno nella
 * testata perché sono lo stato della carta, come lo stato di un ticket.
 *
 * Perso chiede sempre tipo e motivo (vincolo anche a DB): obiezione = si può
 * riprovare più avanti, stop = non vuole essere contattato, definitivo.
 */

const STAGE_OPTIONS = CRM_STAGES.map(stage => ({ value: stage, label: CRM_STAGE_LABEL[stage] }));

function describeEvent(event: CrmEvent, teamName: (id: string | null) => string): string {
    const p = event.payload;
    switch (event.type) {
        case "stage_changed": {
            const from = CRM_STAGE_LABEL[p.from as CrmStage] ?? String(p.from);
            const to = CRM_STAGE_LABEL[p.to as CrmStage] ?? String(p.to);
            const reason = p.lost_reason ? ` (${String(p.lost_reason)})` : "";
            return `${from} → ${to}${reason}`;
        }
        case "assigned":
            return `A ${teamName((p.to as string) ?? null)}`;
        case "note":
            return String(p.text ?? "");
        case "venue_renamed":
            return `${String(p.from ?? "")} → ${String(p.to ?? "")}`;
        case "stage_locked": {
            const to = CRM_STAGE_LABEL[p.to as CrmStage] ?? String(p.to);
            return `In ${to}: ${String(p.note ?? "")}`;
        }
        case "subscription_changed": {
            const to = (p.to ?? {}) as { state?: CrmAccountState | null };
            const from = (p.from ?? {}) as { state?: CrmAccountState | null };
            const label = (state?: CrmAccountState | null) =>
                state ? CRM_ACCOUNT_STATE_LABEL[state] : "nessuno";
            return from.state === to.state
                ? `Account ${label(to.state)}, prova aggiornata`
                : `Account: ${label(from.state)} → ${label(to.state)}`;
        }
        case "lead_in":
        case "lead_returned": {
            const source = CRM_SOURCE_LABEL[p.source as keyof typeof CRM_SOURCE_LABEL];
            const given =
                event.type === "lead_returned" && p.venue_name_given && p.venue_name_match !== "same"
                    ? `, ha scritto «${String(p.venue_name_given)}»`
                    : "";
            return source ? `Da ${source}${given}` : "";
        }
        case "venue_name_confirmed":
            return `Resta «${String(p.kept ?? "")}», «${String(p.given ?? "")}» era lo stesso`;
        case "venue_name_deferred":
            return `Ha scritto «${String(p.given ?? "")}», da chiarire`;
        case "call_scheduled":
        case "call_moved":
        case "call_cancelled":
        case "call_caller_answered":
        case "call_outcome":
            return describeCallEvent(event.type, p, teamName);
        default:
            return "";
    }
}

export default function LeadDetailPage() {
    const { venueId = "" } = useParams<{ venueId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user } = useAuth();

    const [detail, setDetail] = useState<CrmVenueDetail | null>(null);
    const [team, setTeam] = useState<CrmTeamMember[]>([]);
    const [whatsappTemplate, setWhatsappTemplate] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [lostOpen, setLostOpen] = useState(false);
    const [lockRequest, setLockRequest] = useState<StageLockRequest | null>(null);

    usePageTitle(detail?.venue.name ?? "Lead");

    // Un errore di rete dopo un'azione non deve far sparire la scheda già
    // aperta: «non trovato» solo se la scheda non è mai arrivata.
    const loadedVenueRef = useRef<string | null>(null);
    const load = useCallback(async () => {
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
        void load();
    }, [load]);

    const teamName = useCallback(
        (userId: string | null) =>
            userId ? team.find(m => m.user_id === userId)?.display_name ?? "—" : "Nessuno",
        [team]
    );

    const handleStageChange = useCallback(
        async (stage: CrmStage) => {
            if (!detail || stage === detail.venue.stage) return;
            if (stage === "perso") {
                setLostOpen(true);
                return;
            }
            if (needsStageLock(detail.venue.stage, stage, Boolean(detail.venue.stage_locked_at))) {
                setLockRequest({ venueId: detail.venue.id, venueName: detail.venue.name, stage });
                return;
            }
            setIsBusy(true);
            setActionError(null);
            try {
                await moveCrmStage(detail.venue.id, stage);
                await load();
                showToast({ message: `Spostato in ${CRM_STAGE_LABEL[stage]}.`, type: "success" });
            } catch (err) {
                setActionError(crmErrorMessage(err));
            } finally {
                setIsBusy(false);
            }
        },
        [detail, load, showToast]
    );

    const handleLostMoved = useCallback(async () => {
        await load();
        showToast({ message: "Spostato in Perso.", type: "success" });
    }, [load, showToast]);

    const handleUnlock = useCallback(async () => {
        if (!detail) return;
        setIsBusy(true);
        setActionError(null);
        try {
            await unlockCrmStage(detail.venue.id);
            await load();
            showToast({ message: "Fase sbloccata: segue di nuovo l'abbonamento.", type: "success" });
        } catch (err) {
            setActionError(crmErrorMessage(err));
        } finally {
            setIsBusy(false);
        }
    }, [detail, load, showToast]);

    const handleAssign = useCallback(
        async (userId: string) => {
            if (!detail || !userId) return;
            setIsBusy(true);
            setActionError(null);
            try {
                await assignCrmVenue(detail.venue.id, userId);
                await load();
                showToast({ message: `Assegnato a ${teamName(userId)}.`, type: "success" });
            } catch (err) {
                setActionError(crmErrorMessage(err));
            } finally {
                setIsBusy(false);
            }
        },
        [detail, load, showToast, teamName]
    );

    function handleWhatsapp(contact: CrmContact) {
        if (!detail || !contact.phone_e164) return;
        // Prima la finestra (gesto dell'utente), poi la registrazione.
        window.open(
            crmWhatsappLink(contact.phone_e164, whatsappTemplate, {
                contactName: contact.name,
                venueName: detail.venue.name_pending ? null : detail.venue.name,
                senderName: crmSenderName(team, user?.id)
            }),
            "_blank",
            "noopener"
        );
        setActionError(null);
        void logCrmWhatsappOpened(detail.venue.id, detail.leads[0]?.id ?? null)
            .then(() => load())
            .catch(err => setActionError(crmErrorMessage(err)));
    }

    async function handleAddNote() {
        if (!detail || !note.trim()) return;
        setIsSavingNote(true);
        setActionError(null);
        try {
            await addCrmNote(detail.venue.id, note.trim());
            setNote("");
            await load();
        } catch (err) {
            setActionError(crmErrorMessage(err));
        } finally {
            setIsSavingNote(false);
        }
    }

    const assigneeOptions = useMemo(
        () => [
            ...(detail?.venue.assigned_to ? [] : [{ value: "", label: "Nessuno" }]),
            ...team.map(m => ({ value: m.user_id, label: m.display_name }))
        ],
        [team, detail?.venue.assigned_to]
    );

    const venue = detail?.venue;

    const headerActions = useMemo(
        () =>
            venue ? (
                <div className={styles.headerActions}>
                    <Select
                        value={venue.assigned_to ?? ""}
                        onChange={e => void handleAssign(e.target.value)}
                        options={assigneeOptions}
                        disabled={isBusy || team.length === 0}
                        aria-label="Assegnato a"
                    />
                    <Select
                        value={venue.stage}
                        onChange={e => void handleStageChange(e.target.value as CrmStage)}
                        options={STAGE_OPTIONS}
                        disabled={isBusy}
                        aria-label="Fase"
                    />
                </div>
            ) : undefined,
        [venue, assigneeOptions, isBusy, team.length, handleAssign, handleStageChange]
    );

    const subtitle = useMemo(() => {
        if (!venue) return undefined;
        return [
            venue.city,
            `Assegnato a ${teamName(venue.assigned_to)}`,
            `Entrato il ${formatDateTimeIt(venue.created_at)}`
        ]
            .filter(Boolean)
            .join(" · ");
    }, [venue, teamName]);

    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({
            backAction: { label: "Lead", onClick: () => navigate("..") },
            statusControl: venue
                ? {
                      options: STAGE_OPTIONS,
                      value: venue.stage,
                      onChange: value => void handleStageChange(value as CrmStage),
                      label: "Fase",
                      disabled: isBusy
                  }
                : undefined
        }),
        [navigate, venue, isBusy, handleStageChange]
    );

    usePageHeader({
        title: venue?.name ?? "Lead",
        subtitle,
        actions: headerActions,
        compact: headerCompact
    });

    if (isLoading) return <LoadingState message="Caricamento lead…" />;

    if (notFound || !detail) {
        return (
            <div className={styles.page}>
                <Text variant="body" colorVariant="muted">
                    Questo lead non esiste più.
                </Text>
                <div>
                    <Button variant="secondary" onClick={() => navigate("..")}>
                        Torna ai lead
                    </Button>
                </div>
            </div>
        );
    }

    const { contacts, leads, events } = detail;
    const stopped = detail.venue.stage === "perso" && detail.venue.lost_kind === "stop";
    const accountLabel = crmAccountLabel(detail.venue);
    const verifyLead = detail.venue.name_pending ? null : leadToVerify(leads, events);

    return (
        <div className={styles.page}>
            {actionError && <InlineBanner variant="error">{actionError}</InlineBanner>}
            {detail.venue.stage === "perso" && detail.venue.lost_kind && (
                <Card
                    title="Perso"
                    badge={
                        <StatusBadge
                            variant={detail.venue.lost_kind === "stop" ? "danger" : "neutral"}
                            label={CRM_LOST_KIND_LABEL[detail.venue.lost_kind]}
                        />
                    }
                >
                    <Text variant="body">{detail.venue.lost_reason}</Text>
                </Card>
            )}

            {detail.venue.stage_locked_at && (
                <Card
                    title="Fase bloccata a mano"
                    badge={<StatusBadge variant="warning" label={CRM_STAGE_LABEL[detail.venue.stage]} />}
                    actions={
                        <Button variant="secondary" size="sm" onClick={() => void handleUnlock()} disabled={isBusy}>
                            Sblocca
                        </Button>
                    }
                >
                    <Text variant="body">{detail.venue.stage_lock_note}</Text>
                    <Text variant="caption" colorVariant="muted">
                        {teamName(detail.venue.stage_locked_by)} · {formatDateTimeIt(detail.venue.stage_locked_at)}.
                        Il job non sposta la carta; i cambi di abbonamento finiscono nella storia.
                    </Text>
                </Card>
            )}

            {detail.venue.name_pending && <VenueNameCard venue={detail.venue} onSaved={load} />}

            {verifyLead && <VenueNameCheckCard venue={detail.venue} lead={verifyLead} onChanged={load} />}

            <AccountCard
                venueId={detail.venue.id}
                tenantId={detail.venue.tenant_id}
                linkSource={detail.venue.link_source}
                accountLabel={accountLabel}
                onChanged={load}
            />

            <Card title="Contatti" flush>
                {contacts.map(contact => (
                    <ListRow
                        key={contact.id}
                        title={contact.name}
                        subtitle={[contact.phone_e164, contact.email].filter(Boolean).join(" · ")}
                        trailingWrap
                        trailing={
                            contact.phone_e164 ? (
                                <div className={styles.headerActions}>
                                    {!stopped && (
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => handleWhatsapp(contact)}
                                        >
                                            Scrivi su WhatsApp
                                        </Button>
                                    )}
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            window.location.href = `tel:${contact.phone_e164}`;
                                        }}
                                    >
                                        Chiama
                                    </Button>
                                </div>
                            ) : undefined
                        }
                    />
                ))}
            </Card>

            <CallCard
                venueId={detail.venue.id}
                venueName={detail.venue.name}
                lost={detail.venue.stage === "perso"}
                team={team}
                currentUserId={user?.id ?? null}
                teamName={teamName}
                onChanged={load}
            />

            <WhatsappConversationCard venue={detail.venue} teamName={teamName} onChanged={load} />

            <Card title={leads.length === 1 ? "Richiesta" : `Richieste (${leads.length})`}>
                <div className={styles.leadList}>
                    {leads.map(lead => {
                        const answers = leadAnswerRows(lead);
                        return (
                            <div key={lead.id} className={styles.leadItem}>
                                <Text variant="body" weight={600}>
                                    {CRM_SOURCE_LABEL[lead.source]} ·{" "}
                                    {formatDateTimeIt(lead.received_at)}
                                </Text>
                                {(lead.ad_name || lead.campaign) && (
                                    <Text variant="body-sm" colorVariant="muted">
                                        {[lead.ad_name, lead.campaign].filter(Boolean).join(" · ")}
                                    </Text>
                                )}
                                {answers.length > 0 && (
                                    <dl className={styles.answers}>
                                        {answers.map(row => (
                                            <div key={row.label} className={styles.answerRow}>
                                                <dt>
                                                    <Text variant="caption" colorVariant="muted">
                                                        {row.label}
                                                    </Text>
                                                </dt>
                                                <dd>
                                                    <Text variant="body-sm">{row.value}</Text>
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                                {lead.consent_text && (
                                    <Text variant="caption" colorVariant="muted">
                                        Consenso: {lead.consent_text}
                                        {lead.consent_at ? ` (${formatDateTimeIt(lead.consent_at)})` : ""}
                                    </Text>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card title="Storia" flush>
                <div className={styles.noteComposer}>
                    <Textarea
                        label="Nuova nota"
                        rows={2}
                        maxLength={4000}
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        disabled={isSavingNote}
                    />
                    <div className={styles.noteActions}>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleAddNote()}
                            loading={isSavingNote}
                            disabled={!note.trim()}
                        >
                            Aggiungi nota
                        </Button>
                    </div>
                </div>
                {events.map(event => (
                    <ListRow
                        key={event.id}
                        dense
                        title={CRM_EVENT_LABEL[event.type]}
                        subtitle={describeEvent(event, teamName) || undefined}
                        wrapSubtitle
                        meta={`${formatDateTimeIt(event.created_at)} · ${
                            event.actor_user_id ? teamName(event.actor_user_id) : "Sistema"
                        }`}
                    />
                ))}
            </Card>

            <StageLockDialog
                request={lockRequest}
                onClose={() => setLockRequest(null)}
                onMoved={async request => {
                    await load();
                    showToast({
                        message: `Spostato in ${CRM_STAGE_LABEL[request.stage]}, fase bloccata a mano.`,
                        type: "success"
                    });
                }}
            />

            <LostStageDialog
                venueId={lostOpen ? detail.venue.id : null}
                onClose={() => setLostOpen(false)}
                onMoved={handleLostMoved}
            />
        </div>
    );
}
