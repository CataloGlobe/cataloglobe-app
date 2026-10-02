import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { resolveCrmVenueName } from "@/services/supabase/crm";
import { crmErrorMessage } from "@/utils/crm/stages";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type { CrmLead, CrmVenue, CrmVenueNameChoice } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Lead tornato con lo stesso telefono e un altro nome del locale (decisioni
 * di Alex del 2026-10-02): l'etichetta «Locale da verificare» c'è già
 * dall'arrivo del lead; i due tasti la tolgono tenendo il nome che avevamo
 * o usando quello nuovo. «È un altro locale» arriva dopo le ADV (serve
 * cambiare lo schema): per ora una nota.
 */
export function VenueNameCheckCard({
    venue,
    lead,
    onChanged
}: {
    venue: CrmVenue;
    lead: CrmLead;
    onChanged: () => Promise<void> | void;
}) {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const given = lead.venue_name_given ?? "";

    async function handle(choice: CrmVenueNameChoice) {
        setIsSaving(true);
        setError(null);
        try {
            await resolveCrmVenueName(lead.id, choice);
            await onChanged();
            showToast({
                message: choice === "same" ? `Ok, resta ${venue.name}.` : `Ok, ora si chiama ${given}.`,
                type: "success"
            });
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Card
            title="Nome del locale da verificare"
            badge={venue.name_to_verify ? <StatusBadge variant="warning" label="Locale da verificare" /> : undefined}
        >
            <div className={styles.venueNameForm}>
                <Text variant="body">
                    Il {formatDateTimeIt(lead.received_at)} ha compilato di nuovo il modulo scrivendo «{given}». Lo
                    conosciamo come «{venue.name}»:{" "}
                    {lead.venue_name_match === "typo" ? "sembra un refuso." : "sembra un altro locale."}
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    Se non lo sai, chiediglielo al prossimo contatto: intanto l&apos;etichetta resta sulla carta. Se è
                    un altro locale, per ora scrivilo in una nota.
                </Text>
                <div className={styles.choiceActions}>
                    <Button variant="secondary" size="sm" onClick={() => void handle("same")} disabled={isSaving}>
                        Stesso locale: tieni «{venue.name}»
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void handle("rename")} disabled={isSaving}>
                        Stesso locale: chiamalo «{given}»
                    </Button>
                </div>
                {error && <InlineBanner variant="error">{error}</InlineBanner>}
            </div>
        </Card>
    );
}
