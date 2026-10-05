import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Select } from "@/components/ui/Select/Select";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { addCrmObjection, deleteCrmObjection, listCrmVenueObjections } from "@/services/supabase/crmObjections";
import type { CrmObjectionCategory } from "@/types/crm";
import { relativeAgo } from "@/utils/crm/crmHome";
import { CRM_OBJECTION_CATEGORIES, CRM_OBJECTION_LABEL } from "@/utils/crm/objections";
import { crmErrorMessage } from "@/utils/crm/stages";
import { FactSection } from "./components/FactSection";
import { useCrmLoad } from "./hooks/useCrmLoad";
import styles from "./Crm.module.scss";

/**
 * Obiezioni sentite da questo locale (libreria delle obiezioni, F2-5). Si
 * segnano anche senza spostarlo in Perso, quando escono in conversazione o al
 * telefono; quelle di Perso arrivano da sole. Finiscono nel Riepilogo e nel
 * report per Ferdinando.
 */
export function ObjectionsCard({ venueId, now, reloadKey }: { venueId: string; now: Date; reloadKey: unknown }) {
    const [tick, setTick] = useState(0);
    const objections = useCrmLoad(() => listCrmVenueObjections(venueId), `${venueId}:${String(reloadKey)}:${tick}`);
    const [adding, setAdding] = useState(false);
    const [category, setCategory] = useState<CrmObjectionCategory | "">("");
    const [note, setNote] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    async function run(action: () => Promise<void>) {
        setIsBusy(true);
        setError(null);
        try {
            await action();
            setTick(t => t + 1);
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setIsBusy(false);
        }
    }

    async function save() {
        if (!category) {
            setError("Scegli quale obiezione.");
            return;
        }
        await run(async () => {
            await addCrmObjection({ venueId, category, note, source: "scheda" });
            setAdding(false);
            setCategory("");
            setNote("");
        });
    }

    const list = objections.data ?? [];
    return (
        <FactSection
            title="Obiezioni"
            flush
            actions={
                !adding && !objections.error ? (
                    <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
                        Aggiungi
                    </Button>
                ) : undefined
            }
        >
            {(error || objections.error) && (
                <div className={styles.flatBody}>
                    <InlineBanner variant="error">{error ?? objections.error}</InlineBanner>
                </div>
            )}
            {list.map(o => (
                <ListRow
                    key={o.id}
                    title={CRM_OBJECTION_LABEL[o.category]}
                    subtitle={[o.note, `${relativeAgo(o.created_at, now)}${o.source === "perso" ? " · spostato in Perso" : ""}`]
                        .filter(Boolean)
                        .join(" · ")}
                    wrapSubtitle
                    trailing={
                        <Button variant="ghost" size="sm" onClick={() => void run(() => deleteCrmObjection(o.id))} disabled={isBusy}>
                            Togli
                        </Button>
                    }
                />
            ))}
            {!adding && !objections.loading && list.length === 0 && !objections.error && (
                <div className={styles.flatBody}>
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna obiezione segnata.
                    </Text>
                </div>
            )}
            {adding && (
                <div className={styles.flatBody}>
                    <Select
                        label="Quale obiezione"
                        value={category}
                        onChange={e => setCategory(e.target.value as CrmObjectionCategory | "")}
                        options={[
                            { value: "", label: "Scegli" },
                            ...CRM_OBJECTION_CATEGORIES.map(c => ({ value: c, label: CRM_OBJECTION_LABEL[c] }))
                        ]}
                        disabled={isBusy}
                    />
                    <TextInput
                        label="Come l'ha detto"
                        placeholder="Facoltativo"
                        maxLength={500}
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        disabled={isBusy}
                    />
                    <div className={styles.headerActions}>
                        <Button variant="primary" size="sm" onClick={() => void save()} loading={isBusy}>
                            Salva
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                setAdding(false);
                                setError(null);
                            }}
                            disabled={isBusy}
                        >
                            Annulla
                        </Button>
                    </div>
                </div>
            )}
        </FactSection>
    );
}
