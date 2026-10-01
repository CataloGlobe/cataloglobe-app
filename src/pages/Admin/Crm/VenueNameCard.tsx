import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { TextInput } from "@/components/ui/Input/TextInput";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { renameCrmVenue } from "@/services/supabase/crm";
import { crmErrorMessage } from "@/utils/crm/stages";
import type { CrmVenue } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * «Locale da completare»: il lead è entrato senza nome del locale (il form
 * Meta non lo chiede), la carta porta il nome della persona. Dopo la chiamata
 * si scrivono nome e città: il titolo diventa il locale e l'etichetta sparisce.
 * Nome e città servono anche alle proposte di collegamento con l'account.
 */
export function VenueNameCard({ venue, onSaved }: { venue: CrmVenue; onSaved: () => Promise<void> | void }) {
    const { showToast } = useToast();
    const [name, setName] = useState("");
    const [city, setCity] = useState(venue.city ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setName("");
        setCity(venue.city ?? "");
        setError(null);
    }, [venue.id, venue.city]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) {
            setError("Scrivi il nome del locale.");
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            await renameCrmVenue(venue.id, name.trim(), city.trim());
            await onSaved();
            showToast({ message: `Locale completato: ${name.trim()}.`, type: "success" });
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Card title="Nome del locale" badge={<StatusBadge variant="warning" label="Locale da completare" />}>
            <form className={styles.venueNameForm} onSubmit={e => void handleSubmit(e)}>
                <Text variant="body-sm" colorVariant="muted">
                    Il modulo non chiede il nome del locale: la carta porta quello di {venue.name}. Scrivilo dopo la
                    chiamata.
                </Text>
                <div className={styles.venueNameFields}>
                    <TextInput
                        label="Nome del locale"
                        required
                        maxLength={160}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        error={error ?? undefined}
                        disabled={isSaving}
                    />
                    <TextInput
                        label="Città"
                        maxLength={120}
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        disabled={isSaving}
                    />
                </div>
                <div>
                    <Button type="submit" variant="primary" size="sm" disabled={isSaving || !name.trim()}>
                        Salva
                    </Button>
                </div>
            </form>
        </Card>
    );
}
