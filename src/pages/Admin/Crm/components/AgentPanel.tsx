import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import type { CrmAgentSettings, CrmAgentTrialSettings, CrmAgentTrust, CrmAiRole } from "@/types/crm";
import { CRM_MODEL_OPTIONS, describeTrust, MODEL_FIELD, reactivationTextError } from "@/utils/crm/agentLabels";
import type { AgentRow } from "@/utils/crm/agentsOverview";
import { guideTopic } from "@shared/crmGuide";
import styles from "../Agents.module.scss";

/**
 * «Come funziona ▾» di un agente (U2): cosa fa, con un esempio, e sotto i suoi
 * comandi. Gli interruttori salvano subito (come nel resto del CRM); il
 * modello lo hanno solo gli agenti con un ruolo AI loro.
 */
export function AgentPanel({
    row,
    trial,
    trust,
    models,
    saving,
    checking,
    onTrial,
    onModel,
    onCheck,
    onClose
}: {
    row: AgentRow;
    trial: CrmAgentTrialSettings | null;
    trust: CrmAgentTrust[];
    models: CrmAgentSettings | null;
    saving: boolean;
    checking: boolean;
    onTrial: (patch: Partial<CrmAgentTrialSettings>, done: string) => void;
    onModel: (role: CrmAiRole, model: string) => void;
    onCheck: (role: CrmAiRole) => void;
    /** Senza, niente «×»: nella pagina dell'agente il pannello resta aperto. */
    onClose?: () => void;
}) {
    const topic = guideTopic(row.id);
    const trustOf =
        row.id === "conversazione"
            ? trust.find(t => t.kind === "reply")
            : row.id === "solleciti"
              ? trust.find(t => t.kind === "follow_up")
              : undefined;

    return (
        <section className={styles.panel} aria-labelledby={`agente-${row.id}`}>
            <div className={styles.panelHead}>
                <Text as="h3" id={`agente-${row.id}`} variant="body" weight={700}>
                    {row.name}: come funziona
                </Text>
                {onClose && <IconButton icon={<X size={16} />} aria-label="Chiudi" variant="ghost" size="sm" onClick={onClose} />}
            </div>
            {topic && (
                <div className={styles.panelText}>
                    <Text variant="body-sm">
                        {topic.short} {topic.body}
                    </Text>
                    {topic.example && (
                        <Text variant="body-sm" colorVariant="muted">
                            Esempio: {topic.example}
                        </Text>
                    )}
                </div>
            )}
            {trustOf && (
                <Text variant="body-sm" colorVariant="muted">
                    Prova: {describeTrust(trustOf)}.
                </Text>
            )}

            {trial && row.id === "conversazione" && (
                <div className={styles.panelControls}>
                    <Switch
                        label="Risposte ai lead"
                        description="Quando un lead scrive, l'agente prepara la risposta. Servono le regole del brand approvate e gli agenti non in pausa."
                        checked={trial.agent_replies_on}
                        disabled={saving}
                        onChange={on => onTrial({ agent_replies_on: on }, on ? "Risposte in prova accese." : "Risposte spente.")}
                    />
                    <Switch
                        label="Autonomia"
                        description="Chi è uscito dalla prova (5 approvate di fila e 3 giorni; 3 dopo una correzione) parte senza approvazione, con «Non andava bene, torna in prova». Le richieste per una persona restano sempre da approvare."
                        checked={trial.agent_autonomy_on}
                        disabled={saving || (!trial.agent_autonomy_on && !trial.agent_replies_on && !trial.agent_followups_on)}
                        onChange={on => onTrial({ agent_autonomy_on: on }, on ? "Autonomia accesa." : "Autonomia spenta.")}
                    />
                </div>
            )}
            {trial && row.id === "solleciti" && (
                <div className={styles.panelControls}>
                    <Switch
                        label="Solleciti"
                        description="Se il lead non risponde, un messaggio ogni 24-48 ore, fino a 10. Solo con le risposte accese."
                        checked={trial.agent_followups_on}
                        disabled={saving || (!trial.agent_replies_on && !trial.agent_followups_on)}
                        onChange={on => onTrial({ agent_followups_on: on }, on ? "Solleciti accesi." : "Solleciti spenti.")}
                    />
                </div>
            )}
            {trial && row.id === "riattivazione" && <ReactivationForm trial={trial} saving={saving} onTrial={onTrial} />}

            {models && row.role && !row.spendShared && (
                <div className={styles.panelModel}>
                    <Select
                        label="Modello"
                        options={CRM_MODEL_OPTIONS}
                        value={models[MODEL_FIELD[row.role]]}
                        onChange={e => row.role && onModel(row.role, e.target.value)}
                        disabled={saving}
                    />
                    <Button variant="secondary" size="sm" loading={checking} onClick={() => row.role && onCheck(row.role)}>
                        Prova il collegamento
                    </Button>
                </div>
            )}
            {row.spendShared && (
                <Text variant="caption" colorVariant="muted">
                    Usa il modello e la spesa di Conversazione.
                </Text>
            )}
        </section>
    );
}

/** Testo e giorni della riattivazione: si salvano insieme, col loro bottone. */
export function ReactivationForm({
    trial,
    saving,
    onTrial
}: {
    trial: CrmAgentTrialSettings;
    saving: boolean;
    onTrial: (patch: Partial<CrmAgentTrialSettings>, done: string) => void;
}) {
    const [text, setText] = useState(trial.agent_reactivation_message ?? "");
    const [daysText, setDaysText] = useState(String(trial.agent_reactivation_days));
    useEffect(() => {
        setText(trial.agent_reactivation_message ?? "");
        setDaysText(String(trial.agent_reactivation_days));
    }, [trial.agent_reactivation_message, trial.agent_reactivation_days]);

    const textError = reactivationTextError(text);
    const days = Number(daysText);
    const daysError = Number.isInteger(days) && days >= 30 && days <= 365 ? null : "Da 30 a 365 giorni.";
    const dirty = (trial.agent_reactivation_message ?? "") !== text.trim() || trial.agent_reactivation_days !== days;

    return (
        <div className={styles.panelControls}>
            <Textarea
                label="Messaggio di riattivazione"
                rows={2}
                maxLength={1000}
                value={text}
                onChange={e => setText(e.target.value)}
                helperText={
                    textError ??
                    "Ai Persi per obiezione, dopo i giorni qui sotto: una bozza con questo testo, una volta sola per locale. Senza risposta entro 7 giorni torna in Perso. Segnaposti: {nome} {locale} {mittente}. Vuoto = spenta."
                }
                disabled={saving}
            />
            <div className={styles.panelModel}>
                <NumberInput
                    label="Dopo quanti giorni in Perso"
                    min={30}
                    max={365}
                    value={daysText}
                    onChange={e => setDaysText(e.target.value)}
                    error={daysError ?? undefined}
                    disabled={saving}
                />
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving || !dirty || Boolean(textError) || Boolean(daysError)}
                    onClick={() =>
                        onTrial(
                            { agent_reactivation_message: text.trim() || null, agent_reactivation_days: days },
                            "Riattivazione salvata."
                        )
                    }
                >
                    Salva la riattivazione
                </Button>
            </div>
        </div>
    );
}
