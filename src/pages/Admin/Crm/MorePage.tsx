import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listCrmAgentDraftsOpenOrSince } from "@/services/supabase/crmAgentTrial";
import { getCrmAgentSettings, getCrmAiSpend, listCrmAgentDecisionsSince, setCrmBrake } from "@/services/supabase/crmAgents";
import { listAllTickets } from "@/services/supabase/support";
import { crmAgentErrorMessage } from "@/utils/crm/agentLabels";
import { giroToday, romeTodayStart, type GiroToday } from "@/utils/crm/agentsOverview";
import { formatAiCost } from "@shared/crmAi";
import { useCrmLoad } from "./hooks/useCrmLoad";
import styles from "./Crm.module.scss";

/** «in pausa · 12 messaggi oggi · 0,42 $»: la riga sotto «Agenti». */
function agentsLine(brakeOn: boolean | null, giro: GiroToday | null, dayUsd: number | null): string {
    const parts = [
        brakeOn === null ? "stato non letto" : brakeOn ? "in pausa" : "attivi",
        giro ? `${giro.sent} ${giro.sent === 1 ? "messaggio" : "messaggi"} oggi` : null,
        dayUsd !== null ? formatAiCost(dayUsd) : null
    ];
    return parts.filter(Boolean).join(" · ");
}

/** «5 scritti › 1 fermato › 2 aspettano › 12 partiti». */
function giroParts(giro: GiroToday) {
    return {
        before: `${giro.written} ${giro.written === 1 ? "scritto" : "scritti"} › ${giro.stopped} ${giro.stopped === 1 ? "fermato" : "fermati"} › `,
        waiting: `${giro.waiting} ${giro.waiting === 1 ? "aspetta" : "aspettano"}`,
        after: ` › ${giro.sent} ${giro.sent === 1 ? "partito" : "partiti"}`
    };
}

/**
 * «Altro» al telefono (canvas T8d): gli agenti in una scheda con il giro di
 * oggi, la pausa di tutti gli agenti a portata di dito, poi le pagine che non
 * stanno nella barra in basso. Regole del brand e impostazioni restano dal
 * computer. Dal computer le stesse voci sono nella barra a sinistra.
 */
export default function MorePage() {
    usePageTitle("Altro");
    usePageHeader({ title: "Altro" });
    const { showToast } = useToast();
    const [tick, setTick] = useState(0);
    const since = useMemo(() => romeTodayStart(new Date()), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

    const settings = useCrmLoad(getCrmAgentSettings, tick);
    const spend = useCrmLoad(getCrmAiSpend, tick);
    const giroLoad = useCrmLoad(
        () => Promise.all([listCrmAgentDraftsOpenOrSince(since), listCrmAgentDecisionsSince(since)]),
        `${since}:${tick}`
    );
    const tickets = useCrmLoad(listAllTickets, tick);

    const giro = useMemo(() => (giroLoad.data ? giroToday(giroLoad.data[0], giroLoad.data[1], new Date()) : null), [giroLoad.data]);
    const brakeOn = settings.data ? settings.data.brake_on : null;
    const supportWaiting = tickets.data?.filter(t => t.last_message_kind === "customer" && t.status !== "closed").length ?? 0;

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [brakeError, setBrakeError] = useState<string | null>(null);
    const pause = useCallback(async () => {
        setSaving(true);
        setBrakeError(null);
        try {
            await setCrmBrake(true, "Pausa dal telefono");
            setConfirmOpen(false);
            setTick(t => t + 1);
            showToast({ message: "Agenti in pausa.", type: "success" });
            return true;
        } catch (err) {
            setBrakeError(crmAgentErrorMessage(err));
            return false;
        } finally {
            setSaving(false);
        }
    }, [showToast]);

    const dotTone = brakeOn === null ? "neutral" : brakeOn ? "danger" : "success";
    const chevron = <ChevronRight size={16} aria-hidden="true" />;
    const parts = giro ? giroParts(giro) : null;

    return (
        <div className={styles.page}>
            <Card flush>
                <ListRow
                    leading={<span className={styles.moreDot} data-tone={dotTone} aria-hidden="true" />}
                    title="Agenti"
                    subtitle={agentsLine(brakeOn, giro, spend.data?.dayUsd ?? null)}
                    trailing={chevron}
                    to="/admin/agenti"
                />
                <div className={styles.moreGiro}>
                    <Text as="span" variant="caption" colorVariant="muted">
                        Il giro di oggi
                    </Text>
                    {giro && parts ? (
                        <Link to="/admin/agenti" className={styles.moreGiroLine}>
                            <Text as="span" variant="body-sm" color="inherit">
                                {parts.before}
                                <span className={styles.moreGiroWaiting} data-on={giro.waiting > 0 || undefined}>
                                    {parts.waiting}
                                </span>
                                {parts.after}
                            </Text>
                        </Link>
                    ) : (
                        <Text as="span" variant="body-sm" colorVariant="muted">
                            {giroLoad.error ? "Il giro di oggi non si legge." : "Carico…"}
                        </Text>
                    )}
                </div>
            </Card>

            {brakeOn === false && (
                <Button variant="outline-danger" fullWidth onClick={() => setConfirmOpen(true)}>
                    Metti in pausa tutti gli agenti
                </Button>
            )}
            {brakeOn && (
                <Text as="p" variant="body-sm" colorVariant="muted">
                    Gli agenti sono in pausa: si riattivano dalla pagina Agenti.
                </Text>
            )}

            <Card flush>
                <ListRow title="Riepilogo" trailing={chevron} to="/admin/lead?vista=riepilogo" />
                <ListRow title="Clienti" trailing={chevron} to="/admin/clienti" />
                <ListRow title="Costi" trailing={chevron} to="/admin/costi" />
                <ListRow
                    title="Supporto"
                    trailing={
                        <span className={styles.moreTrailing}>
                            {supportWaiting > 0 && <Badge variant="brand">{supportWaiting}</Badge>}
                            {chevron}
                        </span>
                    }
                    to="/admin/supporto"
                />
                <ListRow title="Incidenti" trailing={chevron} to="/admin/status-incidents" />
                <ListRow leading={<ArrowLeft size={16} />} title="Torna al workspace" to="/workspace" />
            </Card>

            <Text as="p" variant="caption" colorVariant="muted">
                Sul telefono: le cose da fare subito. Regole del brand e impostazioni restano dal computer.
            </Text>

            <ConfirmDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={pause}
                title="Mettere in pausa gli agenti?"
                message="Smettono di scrivere ai locali finché una persona non li riattiva. Gea resta attiva."
                confirmLabel="Metti in pausa tutto"
                confirmVariant="danger"
                isLoading={saving}
                error={brakeError}
            />
        </div>
    );
}
