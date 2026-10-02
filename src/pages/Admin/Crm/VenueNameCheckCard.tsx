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
import type { CrmLead, CrmVenue, CrmVenueNameCheck } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Lead tornato con lo stesso telefono e un altro nome del locale (decisione
 * di Alex del 2026-10-02): «È lo stesso locale» toglie l'etichetta e mette
 * la variante nella storia; «Decido dopo» lascia «Locale da verificare».
 * «È un altro locale» arriva dopo le ADV (serve cambiare lo schema).
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
    const deferred = lead.venue_name_check === "later";

    async function handle(choice: CrmVenueNameCheck) {
        setIsSaving(true);
        setError(null);
        try {
            await resolveCrmVenueName(lead.id, choice);
            await onChanged();
            showToast({
                message:
                    choice === "same"
                        ? `Ok, resta ${venue.name}.`
                        : "Etichetta «Locale da verificare» sulla carta.",
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
            badge={deferred ? <StatusBadge variant="warning" label="Locale da verificare" /> : undefined}
            actions={
                <div className={styles.headerActions}>
                    <Button variant="primary" size="sm" onClick={() => void handle("same")} disabled={isSaving}>
                        È lo stesso locale
                    </Button>
                    {!deferred && (
                        <Button variant="secondary" size="sm" onClick={() => void handle("later")} disabled={isSaving}>
                            Decido dopo
                        </Button>
                    )}
                </div>
            }
        >
            <div className={styles.venueNameForm}>
                <Text variant="body">
                    Il {formatDateTimeIt(lead.received_at)} ha compilato di nuovo il modulo scrivendo «
                    {lead.venue_name_given}». Lo conosciamo come «{venue.name}»:{" "}
                    {lead.venue_name_match === "typo" ? "sembra un refuso." : "sembra un altro locale."}
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    {deferred
                        ? "Chiediglielo al prossimo contatto. Se è un altro locale, per ora scrivilo in una nota."
                        : "Se non lo sai ancora, «Decido dopo» lascia l'etichetta sulla carta."}
                </Text>
                {error && <InlineBanner variant="error">{error}</InlineBanner>}
            </div>
        </Card>
    );
}
