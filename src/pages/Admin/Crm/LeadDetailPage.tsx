import { useCallback, useEffect, useMemo, useState } from "react";
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
    moveCrmStage
} from "@/services/supabase/crm";
import { crmWhatsappLink } from "@/utils/crm/whatsapp";
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
    type CrmContact,
    type CrmStage,
    type CrmTeamMember,
    type CrmVenueDetail
} from "@/types/crm";
import { AccountCard } from "./AccountCard";
import { LostStageDialog } from "./LostStageDialog";
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
        case "lead_in":
        case "lead_returned": {
            const source = CRM_SOURCE_LABEL[p.source as keyof typeof CRM_SOURCE_LABEL];
            return source ? `Da ${source}` : "";
        }
        default:
            return "";
    }
}

export default function LeadDetailPage() {
    const { venueId = "" } = useParams<{ venueId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();

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

    usePageTitle(detail?.venue.name ?? "Lead");

    const load = useCallback(async () => {
        try {
            const [data, members, settings] = await Promise.all([
                getCrmVenue(venueId),
                listCrmTeamMembers(),
                getCrmSettings()
            ]);
            setDetail(data);
            setTeam(members);
            setWhatsappTemplate(settings.whatsapp_template);
            setNotFound(false);
        } catch {
            setNotFound(true);
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
                venueName: detail.venue.name
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

            <AccountCard
                venueId={detail.venue.id}
                tenantId={detail.venue.tenant_id}
                linkSource={detail.venue.link_source}
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

            <Card title={leads.length === 1 ? "Richiesta" : `Richieste (${leads.length})`}>
                <div className={styles.leadList}>
                    {leads.map(lead => {
                        const answers = Object.entries(lead.form_answers ?? {});
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
                                {lead.interests.length > 0 && (
                                    <Text variant="body-sm">
                                        Interessi: {lead.interests.join(", ")}
                                    </Text>
                                )}
                                {answers.length > 0 && (
                                    <dl className={styles.answers}>
                                        {answers.map(([key, value]) => (
                                            <div key={key} className={styles.answerRow}>
                                                <dt>
                                                    <Text variant="caption" colorVariant="muted">
                                                        {key.replace(/_/g, " ")}
                                                    </Text>
                                                </dt>
                                                <dd>
                                                    <Text variant="body-sm">{String(value)}</Text>
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

            <LostStageDialog
                venueId={lostOpen ? detail.venue.id : null}
                onClose={() => setLostOpen(false)}
                onMoved={handleLostMoved}
            />
        </div>
    );
}
