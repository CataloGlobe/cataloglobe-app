import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { cancelCrmMessage, listCrmMessages, setCrmAgentHold } from "@/services/supabase/crmWhatsappAgent";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import { messageAuthorLabel, messageStatusLine, messageText, waErrorMessage } from "@/utils/crm/waLabels";
import type { CrmMessage, CrmVenue } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Scheda del lead: la chat col numero dell'agente (F1-2), letta da WhatsApp
 * Web dal Mac, e «La prendo io». Con il locale preso l'agente non gli scrive
 * più e i suoi messaggi in coda si annullano; «Ridalla all'agente» lo
 * rimette in gioco. Un messaggio in coda si può annullare uno per uno.
 */
export function WhatsappConversationCard({
    venue,
    teamName,
    onChanged
}: {
    venue: Pick<CrmVenue, "id" | "agent_hold_at" | "agent_hold_by">;
    teamName: (userId: string | null) => string;
    onChanged: () => Promise<void> | void;
}) {
    const { showToast } = useToast();
    const [messages, setMessages] = useState<CrmMessage[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setMessages(await listCrmMessages(venue.id));
            setLoadError(null);
        } catch {
            setLoadError("Non riesco a leggere la conversazione. Ricarica la pagina.");
        }
    }, [venue.id]);

    useEffect(() => {
        void load();
    }, [load]);

    const held = Boolean(venue.agent_hold_at);

    async function handleHold() {
        setBusyId("hold");
        setActionError(null);
        try {
            await setCrmAgentHold(venue.id, !held);
            await Promise.all([load(), onChanged()]);
            showToast({
                message: held ? "Ridato all'agente." : "Lo gestisci tu: l'agente non gli scrive più.",
                type: "success"
            });
        } catch (err) {
            setActionError(waErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    }

    async function handleCancel(messageId: string) {
        setBusyId(messageId);
        setActionError(null);
        try {
            const cancelled = await cancelCrmMessage(messageId);
            await load();
            if (cancelled) showToast({ message: "Messaggio annullato.", type: "success" });
            else setActionError("Il messaggio non era più in coda: guarda la conversazione.");
        } catch (err) {
            setActionError(waErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    }

    return (
        <Card
            title="WhatsApp dell'agente"
            flush
            badge={
                held ? <StatusBadge variant="warning" label="La gestisci tu" /> : <StatusBadge variant="neutral" label="Agente" />
            }
            actions={
                <Button variant="secondary" size="sm" onClick={() => void handleHold()} loading={busyId === "hold"}>
                    {held ? "Ridalla all'agente" : "La prendo io"}
                </Button>
            }
        >
            <div className={styles.cardPadding}>
                {held && (
                    <Text variant="body-sm" colorVariant="muted">
                        Presa da {teamName(venue.agent_hold_by)} il {formatDateTimeIt(venue.agent_hold_at ?? "")}: l'agente
                        non scrive a questo locale.
                    </Text>
                )}
                {loadError && <InlineBanner variant="error">{loadError}</InlineBanner>}
                {actionError && <InlineBanner variant="error">{actionError}</InlineBanner>}
                {!loadError && messages.length === 0 && (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun messaggio sul numero dell'agente.
                    </Text>
                )}
            </div>
            {messages.map(message => {
                const status = messageStatusLine(message);
                const at = formatDateTimeIt(message.sent_at ?? message.created_at);
                return (
                    <ListRow
                        key={message.id}
                        dense
                        title={messageAuthorLabel(message)}
                        subtitle={<span className={styles.preWrap}>{messageText(message)}</span>}
                        wrapSubtitle="full"
                        meta={status ? `${at} · ${status}` : at}
                        muted={message.status === "cancelled" || message.status === "failed"}
                        trailing={
                            message.status === "queued" ? (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void handleCancel(message.id)}
                                    loading={busyId === message.id}
                                >
                                    Annulla
                                </Button>
                            ) : undefined
                        }
                    />
                );
            })}
        </Card>
    );
}
