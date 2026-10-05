import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import { setCrmVenueReferredBy } from "@/services/supabase/crmPostSale";
import { crmErrorMessage } from "@/utils/crm/stages";
import { FactSection } from "./components/FactSection";
import styles from "./Crm.module.scss";

/**
 * «Presentato da» (post-vendita, decisione di Alex del 2026-09-30): campo
 * facoltativo, testo libero col nome del cliente o della persona che l'ha
 * presentato. Nessun legame vero fra schede, così non complica; la pagina
 * Clienti conta quanti ne ha presentati ciascun nome.
 */
export function ReferredByCard({
    venueId,
    referredBy,
    onChanged
}: {
    venueId: string;
    referredBy: string | null;
    onChanged: () => Promise<void> | void;
}) {
    const { showToast } = useToast();
    const [value, setValue] = useState(referredBy ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => setValue(referredBy ?? ""), [referredBy]);

    const dirty = value.trim() !== (referredBy ?? "");

    async function save() {
        setIsSaving(true);
        setError(null);
        try {
            await setCrmVenueReferredBy(venueId, value);
            await onChanged();
            showToast({ message: value.trim() ? "Salvato chi l'ha presentato." : "Tolto chi l'ha presentato.", type: "success" });
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <FactSection title="Presentato da">
            <div className={styles.flatField}>
                <TextInput
                    label="Chi l'ha presentato"
                    placeholder="Nome del locale o della persona"
                    maxLength={160}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    error={error ?? undefined}
                    disabled={isSaving}
                />
                {dirty && (
                    <Button variant="secondary" size="sm" onClick={() => void save()} loading={isSaving}>
                        Salva
                    </Button>
                )}
            </div>
        </FactSection>
    );
}
