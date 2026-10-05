import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import type { CrmAgentDecision, CrmAgentTrust, CrmMessagePurpose, CrmQueuedMessage } from "@/types/crm";
import { CRM_DECISION_ACTOR_LABEL, decisionActionLabel, describeTrust } from "@/utils/crm/agentLabels";
import { queueWhen } from "@/utils/crm/agentsOverview";
import { chatTime } from "@/utils/crm/leadDetail";
import type { CrmLoad } from "../hooks/useCrmLoad";
import { TileState } from "./TileState";
import styles from "../Agents.module.scss";

type ActivityTab = "arrivo" | "fermati" | "prova" | "diario";

const PURPOSE_LABEL: Record<CrmMessagePurpose, string> = {
    first_message: "Primo messaggio",
    reply: "Risposta",
    follow_up: "Sollecito",
    call_confirm: "Conferma della telefonata",
    call_reminder: "Promemoria",
    call_soon: "Promemoria di un'ora prima"
};

const TRIAL_ACTIONS = new Set(["draft_auto_sent", "draft_wrong", "autonomy_on", "autonomy_off"]);

/**
 * Le schede in basso di Agenti (U2): cosa parte (con «Togli»), cosa ha fermato
 * il revisore, chi esce dalla prova e il diario. Ognuna con la sua lettura.
 */
export function AgentsActivity({
    queued,
    decisions,
    trust,
    now,
    teamName,
    cancelling,
    onCancel,
    onRetry
}: {
    queued: CrmLoad<CrmQueuedMessage[]>;
    decisions: CrmLoad<CrmAgentDecision[]>;
    trust: CrmAgentTrust[];
    now: Date;
    teamName: (userId: string | null) => string;
    cancelling: string | null;
    onCancel: (message: CrmQueuedMessage) => void;
    onRetry: () => void;
}) {
    const [tab, setTab] = useState<ActivityTab>("arrivo");
    const all = decisions.data ?? [];
    const stopped = all.filter(d => d.review_outcome === "rejected");
    const trial = all.filter(d => TRIAL_ACTIONS.has(d.action));
    const who = (d: CrmAgentDecision) => (d.actor_user_id ? teamName(d.actor_user_id) : CRM_DECISION_ACTOR_LABEL[d.actor]);

    return (
        <section className={styles.activity} aria-label="Cosa fanno gli agenti">
            <Tabs value={tab} onChange={setTab} variant="line">
                <Tabs.List aria-label="Cosa fanno gli agenti">
                    <Tabs.Tab value="arrivo" badge={queued.data?.length || undefined}>
                        In arrivo
                    </Tabs.Tab>
                    <Tabs.Tab value="fermati" badge={stopped.length || undefined}>
                        Fermati dal revisore
                    </Tabs.Tab>
                    <Tabs.Tab value="prova">Uscita dalla prova</Tabs.Tab>
                    <Tabs.Tab value="diario">Diario</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="arrivo">
                    <TileState
                        loading={queued.loading && !queued.data}
                        error={queued.error}
                        onRetry={onRetry}
                        empty={queued.data?.length === 0}
                        emptyText="Nessun messaggio in coda."
                    >
                        <ul className={styles.activityRows}>
                            {queued.data?.map(m => (
                                <li key={m.id} className={styles.activityRow}>
                                    <Text as="span" variant="body-sm" weight={700} className={styles.activityWhen}>
                                        {queueWhen(m.send_after, now)}
                                    </Text>
                                    <Text as="span" variant="body-sm" className={styles.activityText}>
                                        {m.purpose ? PURPOSE_LABEL[m.purpose] : "Messaggio"} a{" "}
                                        <Link to={`/admin/lead/${m.venue_id}`} className={styles.activityLink}>
                                            {m.venue_name}
                                        </Link>
                                    </Text>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        loading={cancelling === m.id}
                                        disabled={cancelling !== null}
                                        onClick={() => onCancel(m)}
                                    >
                                        Togli
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </TileState>
                </Tabs.Panel>
                <Tabs.Panel value="fermati">
                    <TileState
                        loading={decisions.loading && !decisions.data}
                        error={decisions.error}
                        onRetry={onRetry}
                        empty={stopped.length === 0}
                        emptyText="Il revisore non ha fermato niente di recente."
                    >
                        <DecisionRows decisions={stopped} now={now} who={who} showReason label={() => "Fermata dal revisore"} />
                    </TileState>
                </Tabs.Panel>
                <Tabs.Panel value="prova">
                    <TileState loading={decisions.loading && !decisions.data} error={decisions.error} onRetry={onRetry}>
                        <ul className={styles.activityRows}>
                            {trust.map(t => (
                                <li key={t.kind} className={styles.activityRow}>
                                    <Text as="span" variant="body-sm" weight={700} className={styles.activityWhen}>
                                        {t.kind === "reply" ? "Risposte" : "Solleciti"}
                                    </Text>
                                    <Text as="span" variant="body-sm" className={styles.activityText}>
                                        {describeTrust(t)}
                                    </Text>
                                </li>
                            ))}
                        </ul>
                        {trial.length === 0 ? (
                            <Text variant="body-sm" colorVariant="muted" className={styles.activityEmpty}>
                                Ancora nessun messaggio partito da solo.
                            </Text>
                        ) : (
                            <DecisionRows decisions={trial} now={now} who={who} />
                        )}
                    </TileState>
                </Tabs.Panel>
                <Tabs.Panel value="diario">
                    <TileState
                        loading={decisions.loading && !decisions.data}
                        error={decisions.error}
                        onRetry={onRetry}
                        empty={all.length === 0}
                        emptyText="Ancora nessuna decisione."
                    >
                        <DecisionRows decisions={all} now={now} who={who} showReason />
                    </TileState>
                </Tabs.Panel>
            </Tabs>
        </section>
    );
}

/** Una riga per decisione: quando, cosa e chi; il locale apre la scheda. */
export function DecisionRows({
    decisions,
    now,
    who,
    showReason = false,
    label = d => decisionActionLabel(d.action)
}: {
    decisions: CrmAgentDecision[];
    now: Date;
    who: (d: CrmAgentDecision) => string;
    showReason?: boolean;
    label?: (d: CrmAgentDecision) => string;
}) {
    return (
        <ul className={styles.activityRows}>
            {decisions.map(d => (
                <li key={d.id} className={styles.activityRow}>
                    <Text as="span" variant="body-sm" weight={700} className={styles.activityWhen}>
                        {chatTime(d.created_at, now).replace(/^oggi /, "")}
                    </Text>
                    <span className={styles.activityText}>
                        <Text as="span" variant="body-sm">
                            {label(d)}
                            {showReason && d.reason ? `: ${d.reason}` : ""}
                        </Text>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {" "}
                            · {who(d)}
                        </Text>
                    </span>
                    {d.venue_id && (
                        <Link to={`/admin/lead/${d.venue_id}`} className={styles.activityLink}>
                            <Text as="span" variant="body-sm" color="inherit">
                                Apri
                            </Text>
                        </Link>
                    )}
                </li>
            ))}
        </ul>
    );
}
