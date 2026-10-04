import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Switch } from "@/components/ui/Switch/Switch";
import { Button } from "@/components/ui/Button/Button";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getCrmAgentTrialSettings,
    listCrmAgentDrafts,
    listCrmAgentTrust,
    updateCrmAgentTrialSettings
} from "@/services/supabase/crmAgentTrial";
import type { CrmAgentDraftRow, CrmAgentTrialSettings, CrmAgentTrust } from "@/types/crm";
import {
    CRM_AGENT_DRAFT_KIND_LABEL,
    CRM_AGENT_DRAFT_STATUS_LABEL,
    describeTrust,
    reactivationTextError
} from "@/utils/crm/agentLabels";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import styles from "./Crm.module.scss";

/**
 * Agente WhatsApp in prova (F1-3): gli interruttori di risposte e follow-up,
 * le approvate di fila per tipo e le ultime bozze. Le bozze si decidono su
 * Telegram; qui si leggono.
 */
export function AgentTrialCard() {
    const { showToast } = useToast();
    const [settings, setSettings] = useState<CrmAgentTrialSettings | null>(null);
    const [trust, setTrust] = useState<CrmAgentTrust[]>([]);
    const [drafts, setDrafts] = useState<CrmAgentDraftRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [reactivationText, setReactivationText] = useState("");
    const [reactivationDays, setReactivationDays] = useState("90");

    const load = useCallback(async () => {
        try {
            const [s, t, d] = await Promise.all([getCrmAgentTrialSettings(), listCrmAgentTrust(), listCrmAgentDrafts(15)]);
            setSettings(s);
            setReactivationText(s.agent_reactivation_message ?? "");
            setReactivationDays(String(s.agent_reactivation_days));
            setTrust(t);
            setDrafts(d);
            setError(null);
        } catch {
            setError("Non riesco a leggere l'agente in prova.");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function toggle(patch: Partial<CrmAgentTrialSettings>, message: string) {
        setSaving(true);
        try {
            await updateCrmAgentTrialSettings(patch);
            await load();
            showToast({ message, type: "success" });
        } catch {
            setError("Non sono riuscito a salvare. Riprova.");
        } finally {
            setSaving(false);
        }
    }

    const pending = drafts.filter(d => d.status === "pending").length;
    const reactivationError = reactivationTextError(reactivationText);
    const days = Number(reactivationDays);
    const daysError = Number.isInteger(days) && days >= 30 && days <= 365 ? null : "Da 30 a 365 giorni.";
    const reactivationDirty =
        settings !== null &&
        ((settings.agent_reactivation_message ?? "") !== reactivationText.trim() || settings.agent_reactivation_days !== days);

    return (
        <Card
            title="Risposte in prova"
            badge={pending > 0 ? <StatusBadge variant="warning" label={`${pending} in attesa`} /> : undefined}
            subtitle="Ogni testo dell'agente è una bozza su Telegram ad Alessandro e Lorenzo: parte solo dopo un tocco."
            flush
        >
            <div className={styles.cardPadding}>
                <div className={styles.venueNameForm}>
                    {error && <InlineBanner variant="error">{error}</InlineBanner>}
                    {settings && (
                        <>
                            <Switch
                                label="Risposte ai lead"
                                description="Quando un lead scrive, l'agente prepara la risposta. Servono le regole del brand approvate e il freno a mano tolto."
                                checked={settings.agent_replies_on}
                                disabled={saving}
                                onChange={on =>
                                    void toggle({ agent_replies_on: on }, on ? "Risposte in prova accese." : "Risposte spente.")
                                }
                            />
                            <Switch
                                label="Follow-up"
                                description="Se il lead non risponde, un messaggio ogni 24-48 ore, fino a 10. Solo con le risposte accese."
                                checked={settings.agent_followups_on}
                                disabled={saving || !settings.agent_replies_on}
                                onChange={on => void toggle({ agent_followups_on: on }, on ? "Follow-up accesi." : "Follow-up spenti.")}
                            />
                        </>
                    )}
                    {settings && (
                        <>
                            <Textarea
                                label="Riattivazione dei Persi per obiezione"
                                rows={2}
                                maxLength={1000}
                                value={reactivationText}
                                onChange={e => setReactivationText(e.target.value)}
                                helperText={
                                    reactivationError ??
                                    "Dopo i giorni qui sotto, una bozza con questo testo su Telegram, una volta sola per locale. Segnaposti: {nome} {locale} {mittente}. Vuoto = spenta."
                                }
                                disabled={saving}
                            />
                            <div className={styles.capFields}>
                                <NumberInput
                                    label="Dopo quanti giorni in Perso"
                                    min={30}
                                    max={365}
                                    value={reactivationDays}
                                    onChange={e => setReactivationDays(e.target.value)}
                                    error={daysError ?? undefined}
                                    disabled={saving}
                                />
                            </div>
                            <div>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={saving || !reactivationDirty || Boolean(reactivationError) || Boolean(daysError)}
                                    onClick={() =>
                                        void toggle(
                                            {
                                                agent_reactivation_message: reactivationText.trim() || null,
                                                agent_reactivation_days: days
                                            },
                                            "Riattivazione salvata."
                                        )
                                    }
                                >
                                    Salva la riattivazione
                                </Button>
                            </div>
                        </>
                    )}
                    {trust.map(t => (
                        <Text key={t.kind} variant="body-sm">
                            {t.kind === "reply" ? "Risposte" : "Follow-up"}: {describeTrust(t)}.
                        </Text>
                    ))}
                </div>
            </div>
            {drafts.map(d => (
                <ListRow
                    key={d.id}
                    dense
                    to={`/admin/lead/${d.venue_id}`}
                    title={`${d.venue_name} · ${CRM_AGENT_DRAFT_KIND_LABEL[d.kind]}`}
                    subtitle={d.final_text ?? d.proposed_text ?? d.reason ?? undefined}
                    meta={formatDateTimeIt(d.created_at)}
                    trailing={
                        <StatusBadge
                            variant={d.status === "pending" ? "warning" : d.status === "expired" || d.status === "discarded" ? "neutral" : "success"}
                            label={CRM_AGENT_DRAFT_STATUS_LABEL[d.status]}
                        />
                    }
                />
            ))}
        </Card>
    );
}
