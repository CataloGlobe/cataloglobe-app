import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { Select } from "@/components/ui/Select/Select";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { StatusStrip } from "@/components/ui/StatusStrip/StatusStrip";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listCrmTeamMembers } from "@/services/supabase/crm";
import {
    checkCrmAgent,
    getCrmAgentSettings,
    getCrmAiSpend,
    listCrmAgentDecisions,
    listCrmBrandRules,
    setCrmBrake,
    updateCrmAgentSettings,
    type CrmAgentSettingsPatch
} from "@/services/supabase/crmAgents";
import { getCrmAgentTrialSettings, listCrmAgentDrafts, listCrmAgentTrust } from "@/services/supabase/crmAgentTrial";
import type {
    CrmAgentDecision,
    CrmAgentDraftRow,
    CrmAgentSettings,
    CrmAgentTrialSettings,
    CrmAgentTrust,
    CrmAiRole,
    CrmAiSpend,
    CrmBrandRules,
    CrmBrandRulesStatus,
    CrmTeamMember
} from "@/types/crm";
import {
    agentCheckMessage,
    CRM_BRAKE_SOURCE_LABEL,
    CRM_DECISION_ACTOR_LABEL,
    CRM_MODEL_OPTIONS,
    crmAgentErrorMessage,
    decisionActionLabel,
    formatUsdInput,
    modelLabel,
    parseUsdCap
} from "@/utils/crm/agentLabels";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import { CRM_AI_ROLES, CRM_AI_ROLE_LABEL, formatUsd, spendShare } from "@shared/crmAi";
import { CRM_MESSAGE_STEPS, guideTopic as guideTopicOf } from "@shared/crmGuide";
import { agentRows, giroToday, type AgentRow } from "@/utils/crm/agentsOverview";
import { BrandRulesDrawer, type BrandRulesDrawerState } from "./BrandRulesDrawer";
import { AgentTrialCard } from "./AgentTrialCard";
import { WhatsappChannelCard } from "./WhatsappChannelCard";
import styles from "./Crm.module.scss";

/**
 * Agenti del CRM (grafica decisa il 2026-10-05): in cima lo stato con la
 * pausa, poi il giro di un messaggio di oggi (cliccando un passo si accende
 * chi lo fa nella tabella), la tabella degli agenti con «Come funziona» dalla
 * guida condivisa, la spesa AI e, in schede, diario, bozze e interruttori,
 * WhatsApp, modelli e regole del brand.
 */

const MODEL_FIELD: Record<CrmAiRole, keyof CrmAgentSettingsPatch> = {
    conversation: "ai_model_conversation",
    reviewer: "ai_model_reviewer",
    sensitive: "ai_model_sensitive",
    gea: "ai_model_gea"
};

const ROLE_HINT: Record<CrmAiRole, string> = {
    conversation: "Scrive ai locali e risponde.",
    reviewer: "Rilegge ogni messaggio prima che parta.",
    sensitive: "Prezzi, codici promo, casi delicati.",
    gea: "L'assistente del team su Telegram; la pausa non la ferma."
};

type AgentsTab = "diario" | "bozze" | "whatsapp" | "modelli" | "regole";

const STEP_COUNT: Record<number, (g: ReturnType<typeof giroToday>) => string> = {
    1: () => "dai lead",
    2: g => (g.written === 1 ? "1 bozza" : `${g.written} bozze`),
    3: g => `${g.reviewed} ${g.reviewed === 1 ? "riletta" : "rilette"}, ${g.stopped} ${g.stopped === 1 ? "fermata" : "fermate"}`,
    4: g => (g.waiting === 0 ? "niente in attesa" : `${g.waiting} ${g.waiting === 1 ? "aspetta" : "aspettano"} · ${g.oldestWait}`),
    5: g => (g.sent === 1 ? "1 partito" : `${g.sent} partiti`)
};

const RULES_STATUS: Record<CrmBrandRulesStatus, { label: string; variant: "success" | "warning" | "neutral" }> = {
    draft: { label: "Da approvare", variant: "warning" },
    approved: { label: "In vigore", variant: "success" },
    retired: { label: "Ritirata", variant: "neutral" },
    discarded: { label: "Scartata", variant: "neutral" }
};

export default function AgentsPage() {
    usePageTitle("Agenti");
    const { showToast } = useToast();

    const [settings, setSettings] = useState<CrmAgentSettings | null>(null);
    const [spend, setSpend] = useState<CrmAiSpend | null>(null);
    const [decisions, setDecisions] = useState<CrmAgentDecision[]>([]);
    const [rules, setRules] = useState<CrmBrandRules[]>([]);
    const [team, setTeam] = useState<CrmTeamMember[]>([]);
    const [trialSettings, setTrialSettings] = useState<CrmAgentTrialSettings | null>(null);
    const [trust, setTrust] = useState<CrmAgentTrust[]>([]);
    const [drafts, setDrafts] = useState<CrmAgentDraftRow[]>([]);
    const [selectedStep, setSelectedStep] = useState<number | null>(null);
    const [guideFor, setGuideFor] = useState<AgentRow["id"] | null>(null);
    const [tab, setTab] = useState<AgentsTab>("diario");
    const [isLoading, setIsLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);

    const [brakeDialog, setBrakeDialog] = useState<"stop" | "release" | null>(null);
    const [brakeReason, setBrakeReason] = useState("");
    const [brakeError, setBrakeError] = useState<string | null>(null);
    const [isBrakeSaving, setIsBrakeSaving] = useState(false);

    const [monthCap, setMonthCap] = useState("");
    const [dayCap, setDayCap] = useState("");
    const [capError, setCapError] = useState<string | null>(null);
    const [isCapSaving, setIsCapSaving] = useState(false);

    const [savingRole, setSavingRole] = useState<CrmAiRole | null>(null);
    const [checkingRole, setCheckingRole] = useState<CrmAiRole | null>(null);
    const [modelError, setModelError] = useState<string | null>(null);

    const [rulesDrawer, setRulesDrawer] = useState<BrandRulesDrawerState | null>(null);

    const load = useCallback(async () => {
        setPageError(null);
        try {
            const [nextSettings, nextSpend, nextDecisions, nextRules, members, nextTrial, nextTrust, nextDrafts] =
                await Promise.all([
                    getCrmAgentSettings(),
                    getCrmAiSpend(),
                    listCrmAgentDecisions(),
                    listCrmBrandRules(),
                    listCrmTeamMembers(),
                    getCrmAgentTrialSettings(),
                    listCrmAgentTrust(),
                    listCrmAgentDrafts(100)
                ]);
            setTrialSettings(nextTrial);
            setTrust(nextTrust);
            setDrafts(nextDrafts);
            setSettings(nextSettings);
            setSpend(nextSpend);
            setDecisions(nextDecisions);
            setRules(nextRules);
            setTeam(members);
            setMonthCap(formatUsdInput(nextSettings.ai_month_cap_usd));
            setDayCap(formatUsdInput(nextSettings.ai_day_cap_usd));
        } catch (err) {
            setPageError(
                `Non è stato possibile caricare gli agenti: ${err instanceof Error ? err.message : String(err)}`
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const teamName = useMemo(() => {
        const names = new Map(team.map(m => [m.user_id, m.display_name]));
        return (userId: string | null) => (userId ? (names.get(userId) ?? "—") : "Nessuno");
    }, [team]);

    usePageHeader({
        title: "Agenti",
        subtitle: "Chi scrive ai lead, cosa ha fatto oggi e quanto costa."
    });

    const now = useMemo(() => new Date(), [drafts, decisions]); // eslint-disable-line react-hooks/exhaustive-deps
    const giro = useMemo(() => giroToday(drafts, decisions, now), [drafts, decisions, now]);
    const rows = useMemo(
        () => (trialSettings ? agentRows({ settings: trialSettings, trust, drafts, giro, now }) : []),
        [trialSettings, trust, drafts, giro, now]
    );
    const highlighted = useMemo(
        () => (selectedStep === null ? [] : rows.filter(r => r.step === selectedStep).map(r => r.id)),
        [rows, selectedStep]
    );

    const columns: ColumnDefinition<AgentRow>[] = [
        { id: "name", header: "Agente", accessor: r => r.name, cell: v => <Text variant="body-sm" weight={600}>{String(v)}</Text> },
        { id: "step", header: "Passo", accessor: r => (r.step === null ? "fuori" : r.step), width: "72px", hideOnPhone: true },
        { id: "status", header: "Stato", accessor: r => r.status, cell: (_v, r) => <StatusBadge variant={r.tone} label={r.status} /> },
        { id: "today", header: "Oggi", accessor: r => r.today },
        {
            id: "share",
            header: "Inviate così",
            accessor: r => r.approvedShare,
            hideOnPhone: true,
            cell: (_v, r) =>
                r.approvedShare === null ? (
                    <Text variant="body-sm" colorVariant="muted">—</Text>
                ) : (
                    <ProgressBar inline value={Math.round(r.approvedShare * 100)} max={100} label={`${Math.round(r.approvedShare * 100)} %`} aria-label={`${r.name}: bozze inviate senza modifiche`} />
                )
        },
        {
            id: "guide",
            header: <span className="visually-hidden">Come funziona</span>,
            align: "right",
            cell: (_v, r) => (
                <Button variant="ghost" size="sm" aria-expanded={guideFor === r.id} onClick={() => setGuideFor(g => (g === r.id ? null : r.id))}>
                    Come funziona
                </Button>
            )
        }
    ];

    function openBrakeDialog(kind: "stop" | "release") {
        setBrakeReason("");
        setBrakeError(null);
        setBrakeDialog(kind);
    }

    async function handleBrake(): Promise<boolean> {
        if (!brakeDialog) return false;
        setIsBrakeSaving(true);
        setBrakeError(null);
        try {
            const on = brakeDialog === "stop";
            await setCrmBrake(on, on ? brakeReason.trim() || null : null);
            await load();
            setBrakeDialog(null);
            showToast({ message: on ? "Agenti in pausa." : "Agenti riattivati.", type: "success" });
            return true;
        } catch (err) {
            setBrakeError(crmAgentErrorMessage(err));
            return false;
        } finally {
            setIsBrakeSaving(false);
        }
    }

    async function handleSaveCaps() {
        const month = parseUsdCap(monthCap);
        const day = parseUsdCap(dayCap);
        if (month === null || day === null) {
            setCapError("Scrivi due importi in dollari maggiori di zero, come 100 o 12,50 (al massimo 10.000).");
            return;
        }
        if (day > month) {
            setCapError("Il tetto di oggi non può superare quello del mese.");
            return;
        }
        setIsCapSaving(true);
        setCapError(null);
        try {
            await updateCrmAgentSettings({ ai_month_cap_usd: month, ai_day_cap_usd: day });
            await load();
            showToast({ message: "Tetti di spesa salvati.", type: "success" });
        } catch (err) {
            setCapError(crmAgentErrorMessage(err));
        } finally {
            setIsCapSaving(false);
        }
    }

    async function handleModelChange(role: CrmAiRole, model: string) {
        setSavingRole(role);
        setModelError(null);
        try {
            await updateCrmAgentSettings({ [MODEL_FIELD[role]]: model });
            await load();
            showToast({ message: `${CRM_AI_ROLE_LABEL[role]}: ${modelLabel(model)}.`, type: "success" });
        } catch (err) {
            setModelError(crmAgentErrorMessage(err));
        } finally {
            setSavingRole(null);
        }
    }

    async function handleCheck(role: CrmAiRole) {
        setCheckingRole(role);
        setModelError(null);
        try {
            const result = await checkCrmAgent(role);
            if (result.ok) showToast({ message: agentCheckMessage(result), type: "success" });
            else setModelError(`${CRM_AI_ROLE_LABEL[role]}: ${agentCheckMessage(result)}`);
            // La prova costa: spesa e diario si aggiornano.
            await load();
        } catch (err) {
            setModelError(`La prova non è partita: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setCheckingRole(null);
        }
    }

    if (isLoading) return <LoadingState message="Caricamento agenti…" />;

    if (!settings || !spend) {
        return (
            <div className={styles.page}>
                <InlineBanner variant="error">{pageError ?? "Non è stato possibile caricare gli agenti."}</InlineBanner>
                <div>
                    <Button variant="secondary" onClick={() => void load()}>
                        Riprova
                    </Button>
                </div>
            </div>
        );
    }

    const approved = rules.find(r => r.status === "approved") ?? null;
    const otherVersions = rules.filter(r => r.status !== "approved");
    const dayShare = spendShare(spend.dayUsd, spend.dayCap);
    const monthShare = spendShare(spend.monthUsd, spend.monthCap);

    const brakeAction = settings.brake_on ? (
        <Button variant="primary" size="sm" onClick={() => openBrakeDialog("release")}>
            Riattiva
        </Button>
    ) : (
        <Button variant="secondary" size="sm" onClick={() => openBrakeDialog("stop")}>
            Metti in pausa tutto
        </Button>
    );
    const openGuide = guideFor ? guideTopicOf(guideFor) : null;

    return (
        <div className={styles.page}>
            {pageError && <InlineBanner variant="error">{pageError}</InlineBanner>}

            <StatusStrip
                tone={settings.brake_on ? "danger" : "success"}
                badge={settings.brake_on ? "In pausa" : "Attivi"}
                title={settings.brake_on ? (settings.brake_reason ?? "Agenti in pausa, nessun motivo scritto.") : "Gli agenti lavorano"}
                description={
                    settings.brake_changed_at
                        ? `${CRM_BRAKE_SOURCE_LABEL[settings.brake_source]} · ${teamName(settings.brake_changed_by)} · ${formatDateTimeIt(settings.brake_changed_at)}`
                        : undefined
                }
                figures={[
                    { value: giro.sent, label: "partiti oggi" },
                    { value: giro.waiting, label: "aspettano voi" },
                    { value: formatUsd(spend.dayUsd), label: `spesa oggi, tetto ${formatUsd(spend.dayCap)}` }
                ]}
                action={brakeAction}
            />

            <Card title="Il giro di un messaggio, oggi" subtitle="Scegli un passo: nella tabella si accende chi lo fa.">
                <ol className={styles.giro}>
                    {CRM_MESSAGE_STEPS.map(step => (
                        <li key={step.step}>
                            <button
                                type="button"
                                className={styles.giroStep}
                                data-selected={selectedStep === step.step}
                                data-level={step.step === 4 ? giro.oldestLevel : undefined}
                                aria-pressed={selectedStep === step.step}
                                onClick={() => setSelectedStep(s => (s === step.step ? null : step.step))}
                            >
                                <span className={styles.giroNumber} aria-hidden="true">
                                    {step.step}
                                </span>
                                <span>
                                    <Text as="span" variant="body-sm" weight={600}>
                                        {step.title}
                                    </Text>
                                    <Text as="span" variant="caption" className={styles.giroCount}>
                                        {STEP_COUNT[step.step](giro)}
                                    </Text>
                                </span>
                            </button>
                        </li>
                    ))}
                </ol>
                {selectedStep === 4 && (
                    <Text variant="caption" colorVariant="muted">
                        Il passo 4 siete voi: le bozze in attesa si decidono su Telegram o nella scheda del lead.
                    </Text>
                )}
            </Card>

            <Card title="Agenti" flush>
                <DataTable
                    ariaLabel="Agenti"
                    data={rows}
                    columns={columns}
                    getRowId={r => r.id}
                    highlightedRowIds={highlighted}
                    showFooter={false}
                />
                {openGuide && (
                    <div className={styles.cardPadding}>
                        <InlineBanner variant="info">
                            <strong>{openGuide.title}.</strong> {openGuide.short} {openGuide.body}
                            {openGuide.example ? ` Esempio: ${openGuide.example}` : ""}
                        </InlineBanner>
                    </div>
                )}
            </Card>

            <Card title="Spesa AI">
                <Text variant="body-sm" weight={600}>
                    Oggi
                </Text>
                <ProgressBar
                    value={spend.dayUsd}
                    max={spend.dayCap}
                    variant={dayShare >= 0.8 ? "warning" : "brand"}
                    label={`${formatUsd(spend.dayUsd)} di ${formatUsd(spend.dayCap)}`}
                    aria-label="Spesa di oggi"
                />
                <Text variant="body-sm" weight={600}>
                    Questo mese
                </Text>
                <ProgressBar
                    value={spend.monthUsd}
                    max={spend.monthCap}
                    variant={monthShare >= 0.8 ? "warning" : "brand"}
                    label={`${formatUsd(spend.monthUsd)} di ${formatUsd(spend.monthCap)}`}
                    aria-label="Spesa del mese"
                />
                <Text variant="caption" colorVariant="muted">
                    All'80% arriva un avviso su Telegram; al tetto gli agenti vanno in pausa da soli. Giorno e mese
                    secondo l'ora di Roma.
                </Text>
                {capError && <InlineBanner variant="error">{capError}</InlineBanner>}
                <div className={styles.capFields}>
                    <TextInput
                        label="Tetto del mese ($)"
                        inputMode="decimal"
                        value={monthCap}
                        onChange={e => setMonthCap(e.target.value)}
                        disabled={isCapSaving}
                    />
                    <TextInput
                        label="Tetto di oggi ($)"
                        inputMode="decimal"
                        value={dayCap}
                        onChange={e => setDayCap(e.target.value)}
                        disabled={isCapSaving}
                    />
                </div>
                <div className={styles.noteActions}>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleSaveCaps()}
                        loading={isCapSaving}
                        disabled={
                            monthCap === formatUsdInput(settings.ai_month_cap_usd) &&
                            dayCap === formatUsdInput(settings.ai_day_cap_usd)
                        }
                    >
                        Salva i tetti
                    </Button>
                </div>
            </Card>

            <Tabs value={tab} onChange={setTab} variant="line">
                <Tabs.List aria-label="Dettagli degli agenti">
                    <Tabs.Tab value="diario">Diario</Tabs.Tab>
                    <Tabs.Tab value="bozze" badge={giro.waiting > 0 ? giro.waiting : undefined} badgeTone="brand">
                        Bozze e interruttori
                    </Tabs.Tab>
                    <Tabs.Tab value="whatsapp">WhatsApp</Tabs.Tab>
                    <Tabs.Tab value="modelli">Modelli</Tabs.Tab>
                    <Tabs.Tab value="regole">Regole del brand</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="diario">
                    <Card title="Diario" flush>
                {decisions.length === 0 ? (
                    <div className={styles.cardPadding}>
                        <EmptyState variant="inline" title="Ancora nessuna decisione" />
                    </div>
                ) : (
                    decisions.map(decision => (
                        <ListRow
                            key={decision.id}
                            dense
                            title={decisionActionLabel(decision.action)}
                            subtitle={decision.reason ?? undefined}
                            wrapSubtitle
                            meta={`${formatDateTimeIt(decision.created_at)} · ${
                                decision.actor_user_id
                                    ? teamName(decision.actor_user_id)
                                    : CRM_DECISION_ACTOR_LABEL[decision.actor]
                            }`}
                        />
                    ))
                )}
            </Card>
                </Tabs.Panel>
                <Tabs.Panel value="bozze">
                    <AgentTrialCard />
                </Tabs.Panel>
                <Tabs.Panel value="whatsapp">
                    <WhatsappChannelCard />
                </Tabs.Panel>
                <Tabs.Panel value="modelli">
                    <Card title="Modelli" flush>
                {modelError && (
                    <div className={styles.cardPadding}>
                        <InlineBanner variant="error">{modelError}</InlineBanner>
                    </div>
                )}
                {CRM_AI_ROLES.map(role => {
                    const model = settings[MODEL_FIELD[role]] as string;
                    return (
                        <ListRow
                            key={role}
                            title={CRM_AI_ROLE_LABEL[role]}
                            subtitle={ROLE_HINT[role]}
                            wrapSubtitle
                            trailingWrap
                            trailing={
                                <div className={styles.headerActions}>
                                    <Select
                                        aria-label={`Modello per ${CRM_AI_ROLE_LABEL[role]}`}
                                        options={CRM_MODEL_OPTIONS}
                                        value={model}
                                        onChange={e => void handleModelChange(role, e.target.value)}
                                        disabled={savingRole !== null}
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => void handleCheck(role)}
                                        loading={checkingRole === role}
                                        disabled={checkingRole !== null && checkingRole !== role}
                                    >
                                        Prova
                                    </Button>
                                </div>
                            }
                        />
                    );
                })}
            </Card>
                </Tabs.Panel>
                <Tabs.Panel value="regole">
                    <Card
                title="Regole del brand"
                badge={
                    approved ? <StatusBadge variant="success" label={`Versione ${approved.version}`} /> : undefined
                }
                actions={
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setRulesDrawer({ mode: "propose", initialBody: approved?.body ?? "" })}
                    >
                        Nuova versione
                    </Button>
                }
                flush
            >
                <div className={styles.cardPadding}>
                    {approved ? (
                        <>
                            <Text variant="body" className={styles.preWrap}>
                                {approved.body}
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Approvata da {teamName(approved.approved_by)}
                                {approved.approved_at ? ` · ${formatDateTimeIt(approved.approved_at)}` : ""}
                            </Text>
                        </>
                    ) : (
                        <EmptyState
                            variant="inline"
                            title="Nessuna regola in vigore"
                            description="Gli agenti non scrivono a nessuno finché una versione non è approvata."
                        />
                    )}
                </div>
                {otherVersions.map(version => (
                    <ListRow
                        key={version.id}
                        title={`Versione ${version.version}`}
                        subtitle={version.note ?? undefined}
                        meta={`${formatDateTimeIt(version.created_at)} · ${teamName(version.created_by)}`}
                        trailing={
                            <StatusBadge
                                variant={RULES_STATUS[version.status].variant}
                                label={RULES_STATUS[version.status].label}
                            />
                        }
                        onClick={() => setRulesDrawer({ mode: "view", rules: version })}
                    />
                ))}
            </Card>
                </Tabs.Panel>
            </Tabs>

            <ConfirmDialog
                isOpen={brakeDialog !== null}
                onClose={() => setBrakeDialog(null)}
                onConfirm={handleBrake}
                title={brakeDialog === "stop" ? "Mettere in pausa gli agenti?" : "Riattivare gli agenti?"}
                message={
                    brakeDialog === "stop"
                        ? "Smettono di scrivere ai locali finché una persona non li riattiva. Gea su Telegram resta attiva."
                        : "Riprendono a scrivere ai locali, con le regole del brand in vigore e nei tetti di spesa."
                }
                confirmLabel={brakeDialog === "stop" ? "Metti in pausa tutto" : "Riattiva"}
                confirmVariant={brakeDialog === "stop" ? "danger" : "primary"}
                isLoading={isBrakeSaving}
                error={brakeError}
            >
                {brakeDialog === "stop" && (
                    <Textarea
                        label="Motivo"
                        rows={2}
                        maxLength={300}
                        value={brakeReason}
                        onChange={e => setBrakeReason(e.target.value)}
                        disabled={isBrakeSaving}
                    />
                )}
            </ConfirmDialog>

            <BrandRulesDrawer
                state={rulesDrawer}
                teamName={teamName}
                onClose={() => setRulesDrawer(null)}
                onChanged={load}
            />
        </div>
    );
}
