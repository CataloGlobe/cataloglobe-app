import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
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
    listCrmAgentDecisionsSince,
    listCrmAiUsageSince,
    listCrmBrandRules,
    setCrmBrake,
    updateCrmAgentSettings
} from "@/services/supabase/crmAgents";
import {
    getCrmAgentTrialSettings,
    listCrmAgentDraftsOpenOrSince,
    listCrmAgentTrust,
    updateCrmAgentTrialSettings
} from "@/services/supabase/crmAgentTrial";
import {
    cancelCrmMessage,
    countCrmFirstMessagesSince,
    countCrmQueuedMessages,
    getCrmWaChannel,
    getCrmWaSettings,
    listCrmQueuedMessages
} from "@/services/supabase/crmWhatsappAgent";
import type { CrmAgentTrialSettings, CrmAiRole, CrmQueuedMessage, CrmWaSettings } from "@/types/crm";
import { agentCheckMessage, crmAgentErrorMessage, MODEL_FIELD, modelLabel } from "@/utils/crm/agentLabels";
import { agentRows, costPerMessage, giroToday, romeTodayStart, spendByRole, type AgentRow } from "@/utils/crm/agentsOverview";
import { crmErrorMessage } from "@/utils/crm/stages";
import { channelHealth } from "@/utils/crm/waLabels";
import { CRM_AI_ROLE_LABEL } from "@shared/crmAi";
import { BrandRulesDrawer, type BrandRulesDrawerState } from "./BrandRulesDrawer";
import { AgentPanel } from "./components/AgentPanel";
import { AgentsActivity } from "./components/AgentsActivity";
import { BrandRulesListDrawer, SpendCapsDrawer } from "./components/AgentsDrawers";
import { AgentsStatusLine, GiroStrip, SpendCard } from "./components/AgentsParts";
import { AgentsTable } from "./components/AgentsTable";
import { TileState } from "./components/TileState";
import { useCrmLoad } from "./hooks/useCrmLoad";
import { WhatsappSettingsDrawer } from "./WhatsappSettingsDrawer";
import styles from "./Agents.module.scss";

/**
 * Agenti del CRM (canvas U2, versione finale del 2026-10-05). In testata
 * «Regole del brand» e la pausa; sotto una riga di stato, il giro di un
 * messaggio di oggi (un passo accende chi lo fa), la tabella degli agenti con
 * «Come funziona ▾» (spiegazione e comandi dell'agente), la spesa AI e le
 * schede In arrivo, Fermati dal revisore, Uscita dalla prova e Diario.
 * Ogni pezzo carica da solo: se una lettura manca si spegne solo lui.
 */
export default function AgentsPage() {
    usePageTitle("Agenti");
    const { showToast } = useToast();
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick(t => t + 1), []);

    const since = useMemo(() => romeTodayStart(new Date()), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
    const settings = useCrmLoad(getCrmAgentSettings, tick);
    const spend = useCrmLoad(getCrmAiSpend, tick);
    const usage = useCrmLoad(() => listCrmAiUsageSince(since), tick);
    const trial = useCrmLoad(
        () =>
            Promise.all([
                getCrmAgentTrialSettings(),
                listCrmAgentTrust(),
                listCrmAgentDraftsOpenOrSince(since),
                listCrmAgentDecisionsSince(since)
            ]),
        tick
    );
    const decisions = useCrmLoad(() => listCrmAgentDecisions(50), tick);
    const rules = useCrmLoad(listCrmBrandRules, tick);
    const team = useCrmLoad(listCrmTeamMembers, tick);
    const wa = useCrmLoad(
        () => Promise.all([getCrmWaChannel(), getCrmWaSettings(), countCrmFirstMessagesSince(since), countCrmQueuedMessages()]),
        tick
    );
    const queued = useCrmLoad(() => listCrmQueuedMessages(), tick);

    const [selectedStep, setSelectedStep] = useState<number | null>(null);
    const [openAgent, setOpenAgent] = useState<AgentRow["id"] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [brakeDialog, setBrakeDialog] = useState<"stop" | "release" | null>(null);
    const [brakeReason, setBrakeReason] = useState("");
    const [brakeError, setBrakeError] = useState<string | null>(null);
    const [isBrakeSaving, setIsBrakeSaving] = useState(false);
    const [capsOpen, setCapsOpen] = useState(false);
    const [waSettings, setWaSettings] = useState<CrmWaSettings | null>(null);
    const [rulesListOpen, setRulesListOpen] = useState(false);
    const [rulesDrawer, setRulesDrawer] = useState<BrandRulesDrawerState | null>(null);

    const teamName = useMemo(() => {
        const names = new Map((team.data ?? []).map(m => [m.user_id, m.display_name]));
        return (userId: string | null) => (userId ? (names.get(userId) ?? "—") : "Nessuno");
    }, [team.data]);

    const now = useMemo(() => new Date(), [trial.data, queued.data]); // eslint-disable-line react-hooks/exhaustive-deps
    const giro = useMemo(() => (trial.data ? giroToday(trial.data[2], trial.data[3], now) : null), [trial.data, now]);
    const rows = useMemo(
        () => (trial.data && giro ? agentRows({ settings: trial.data[0], trust: trial.data[1], drafts: trial.data[2], giro, now }) : []),
        [trial.data, giro, now]
    );
    const byRole = useMemo(() => (usage.data ? spendByRole(usage.data) : null), [usage.data]);
    const highlighted = useMemo(
        () => (selectedStep === null ? [] : rows.filter(r => r.step === selectedStep).map(r => r.id)),
        [rows, selectedStep]
    );

    const brakeOn = settings.data?.brake_on ?? null;
    // `?pausa=1` (dal Cerca): la stessa conferma di «Metti in pausa tutto», se non è già in pausa.
    const [params, setParams] = useSearchParams();
    const wantsPause = params.get("pausa") === "1";
    useEffect(() => {
        if (!wantsPause || brakeOn === null) return;
        if (!brakeOn) setBrakeDialog("stop");
        setParams(
            p => {
                p.delete("pausa");
                return p;
            },
            { replace: true }
        );
    }, [wantsPause, brakeOn, setParams]);
    const headerActions = useMemo(
        () => (
            <>
                <Button variant="secondary" size="sm" onClick={() => setRulesListOpen(true)}>
                    Regole del brand
                </Button>
                {brakeOn ? (
                    <Button variant="primary" size="sm" onClick={() => setBrakeDialog("release")}>
                        Riattiva gli agenti
                    </Button>
                ) : (
                    <Button variant="outline-danger" size="sm" onClick={() => setBrakeDialog("stop")} disabled={brakeOn === null}>
                        Metti in pausa tutto
                    </Button>
                )}
            </>
        ),
        [brakeOn]
    );
    usePageHeader({ title: "Agenti", actions: headerActions });

    async function handleBrake(): Promise<boolean> {
        if (!brakeDialog) return false;
        setIsBrakeSaving(true);
        setBrakeError(null);
        try {
            const on = brakeDialog === "stop";
            await setCrmBrake(on, on ? brakeReason.trim() || null : null);
            setBrakeDialog(null);
            setBrakeReason("");
            reload();
            showToast({ message: on ? "Agenti in pausa." : "Agenti riattivati.", type: "success" });
            return true;
        } catch (err) {
            setBrakeError(crmAgentErrorMessage(err));
            return false;
        } finally {
            setIsBrakeSaving(false);
        }
    }

    async function run(key: string, action: () => Promise<unknown>, done: string | null) {
        setBusy(key);
        setActionError(null);
        try {
            await action();
            if (done) showToast({ message: done, type: "success" });
            reload();
        } catch (err) {
            setActionError(crmAgentErrorMessage(err));
        } finally {
            setBusy(null);
        }
    }

    function handleTrial(patch: Partial<CrmAgentTrialSettings>, done: string) {
        void run("trial", () => updateCrmAgentTrialSettings(patch), done);
    }

    function handleModel(role: CrmAiRole, model: string) {
        void run(
            "model",
            () => updateCrmAgentSettings({ [MODEL_FIELD[role]]: model }),
            `${CRM_AI_ROLE_LABEL[role]}: ${modelLabel(model)}.`
        );
    }

    async function handleCheck(role: CrmAiRole) {
        setBusy(`check:${role}`);
        setActionError(null);
        try {
            const result = await checkCrmAgent(role);
            if (result.ok) showToast({ message: agentCheckMessage(result), type: "success" });
            else setActionError(`${CRM_AI_ROLE_LABEL[role]}: ${agentCheckMessage(result)}`);
            // La prova costa: spesa e diario si aggiornano.
            reload();
        } catch (err) {
            setActionError(`La prova non è partita: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setBusy(null);
        }
    }

    async function handleCancel(message: CrmQueuedMessage) {
        setBusy(message.id);
        setActionError(null);
        try {
            const cancelled = await cancelCrmMessage(message.id);
            showToast({
                message: cancelled ? `Tolto: non parte più a ${message.venue_name}.` : "Era già partito.",
                type: cancelled ? "success" : "warning"
            });
            reload();
        } catch (err) {
            setActionError(crmErrorMessage(err));
        } finally {
            setBusy(null);
        }
    }

    const health = wa.data ? channelHealth(wa.data[0], now) : null;

    return (
        <div className={styles.page}>
            {actionError && <InlineBanner variant="error">{actionError}</InlineBanner>}

            <AgentsStatusLine
                brakeOn={brakeOn}
                brakeReason={settings.data?.brake_reason ?? null}
                health={health}
                firstToday={wa.data ? wa.data[2] : null}
                queued={wa.data ? wa.data[3] : null}
                testOnly={wa.data ? wa.data[1].wa_test_only : null}
                spend={spend.data}
                onWhatsapp={() => wa.data && setWaSettings(wa.data[1])}
            />

            <GiroStrip giro={giro} selected={selectedStep} onSelect={setSelectedStep} />

            <section className={styles.tableBox} aria-label="Agenti">
                <TileState loading={trial.loading && !trial.data} error={trial.error} onRetry={reload}>
                    <AgentsTable
                        rows={rows}
                        highlighted={highlighted}
                        spend={byRole}
                        openId={openAgent}
                        onToggle={id => setOpenAgent(a => (a === id ? null : id))}
                        renderPanel={row => (
                            <AgentPanel
                                row={row}
                                trial={trial.data?.[0] ?? null}
                                trust={trial.data?.[1] ?? []}
                                models={settings.data}
                                saving={busy !== null}
                                checking={row.role !== null && busy === `check:${row.role}`}
                                onTrial={handleTrial}
                                onModel={handleModel}
                                onCheck={role => void handleCheck(role)}
                                onClose={() => setOpenAgent(null)}
                            />
                        )}
                    />
                </TileState>
            </section>

            <div className={styles.bottom}>
                <SpendCard
                    spend={spend.data}
                    perMessage={spend.data && giro ? costPerMessage(spend.data.dayUsd, giro.sent) : null}
                    now={now}
                    onCaps={() => setCapsOpen(true)}
                />
                <AgentsActivity
                    queued={queued}
                    decisions={decisions}
                    trust={trial.data?.[1] ?? []}
                    now={now}
                    teamName={teamName}
                    cancelling={busy}
                    onCancel={m => void handleCancel(m)}
                    onRetry={reload}
                />
            </div>

            <ConfirmDialog
                isOpen={brakeDialog !== null}
                onClose={() => {
                    setBrakeDialog(null);
                    setBrakeReason("");
                    setBrakeError(null);
                }}
                onConfirm={handleBrake}
                title={brakeDialog === "stop" ? "Mettere in pausa gli agenti?" : "Riattivare gli agenti?"}
                message={
                    brakeDialog === "stop"
                        ? "Smettono di scrivere ai locali finché una persona non li riattiva. Gea resta attiva."
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

            <SpendCapsDrawer
                settings={capsOpen ? settings.data : null}
                onClose={() => setCapsOpen(false)}
                onSaved={() => {
                    setCapsOpen(false);
                    reload();
                    showToast({ message: "Tetti di spesa salvati.", type: "success" });
                }}
            />
            <WhatsappSettingsDrawer
                settings={waSettings}
                onClose={() => setWaSettings(null)}
                onSaved={() => {
                    setWaSettings(null);
                    reload();
                    showToast({ message: "Impostazioni di WhatsApp salvate.", type: "success" });
                }}
            />
            <BrandRulesListDrawer
                open={rulesListOpen}
                rules={rules.data}
                error={rules.error}
                teamName={teamName}
                onClose={() => setRulesListOpen(false)}
                onOpen={version => {
                    setRulesListOpen(false);
                    setRulesDrawer({ mode: "view", rules: version });
                }}
                onPropose={body => {
                    setRulesListOpen(false);
                    setRulesDrawer({ mode: "propose", initialBody: body });
                }}
            />
            <BrandRulesDrawer
                state={rulesDrawer}
                teamName={teamName}
                onClose={() => setRulesDrawer(null)}
                onChanged={async () => reload()}
            />
        </div>
    );
}
