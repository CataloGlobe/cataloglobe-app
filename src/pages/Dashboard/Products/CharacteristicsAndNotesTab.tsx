import { useCallback, useEffect, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getProductCharacteristics,
    setProductCharacteristics
} from "@/services/supabase/productCharacteristics";
import CharacteristicsSection from "./components/CharacteristicsSection/CharacteristicsSection";
import styles from "./CharacteristicsAndNotesTab.module.scss";

interface CharacteristicsAndNotesTabProps {
    productId: string;
    tenantId: string;
    /** Tenant vertical, used to scope the characteristics lookup. */
    vertical?: string;
}

/**
 * Tab "Caratteristiche e Note" — Phase 4b.1 wires only the Characteristics
 * section. The Notes section will land in Phase 4b.2 in the placeholder
 * area below; the orchestrator already tracks dirty state and renders the
 * sticky save/reset bar so 4b.2 only needs to plug the second section.
 *
 * TODO Phase 4b.2:
 * - Mount <ProductNotesSection> in the placeholder area.
 * - Extend dirty tracking + handleSave to include notes via updateProduct.
 * - Update tab label in verticalTypes.copy.productSections.characteristics
 *   to "Caratteristiche e Note" once notes is wired.
 */
export default function CharacteristicsAndNotesTab({
    productId,
    tenantId,
    vertical
}: CharacteristicsAndNotesTabProps) {
    const { showToast } = useToast();

    const [characteristicIds, setCharacteristicIds] = useState<string[]>([]);
    const [savedSnapshot, setSavedSnapshot] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        getProductCharacteristics(productId, tenantId)
            .then(ids => {
                if (cancelled) return;
                setCharacteristicIds(ids);
                setSavedSnapshot(ids);
                setIsLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                setIsLoading(false);
                const msg = err instanceof Error ? err.message : "Errore nel caricamento";
                showToast({ message: msg, type: "error" });
            });
        return () => {
            cancelled = true;
        };
    }, [productId, tenantId, showToast]);

    const isDirty = useMemo(() => {
        if (characteristicIds.length !== savedSnapshot.length) return true;
        const saved = new Set(savedSnapshot);
        return characteristicIds.some(id => !saved.has(id));
    }, [characteristicIds, savedSnapshot]);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            await setProductCharacteristics(tenantId, productId, characteristicIds);
            setSavedSnapshot(characteristicIds);
            showToast({ message: "Caratteristiche salvate.", type: "success" });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Errore nel salvataggio.";
            showToast({ message: msg, type: "error" });
        } finally {
            setIsSaving(false);
        }
    }, [tenantId, productId, characteristicIds, showToast]);

    const handleReset = useCallback(() => {
        setCharacteristicIds(savedSnapshot);
    }, [savedSnapshot]);

    return (
        <div className={styles.root}>
            <Card>
                <div className={styles.cardHeader}>
                    <div>
                        <Text variant="title-sm" weight={600}>
                            Caratteristiche
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Etichette di sistema visibili sulla pagina pubblica del prodotto.
                        </Text>
                    </div>
                </div>

                {isLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento caratteristiche...
                    </Text>
                ) : (
                    <CharacteristicsSection
                        vertical={vertical}
                        value={characteristicIds}
                        onChange={setCharacteristicIds}
                        disabled={isSaving}
                    />
                )}
            </Card>

            {/* TODO Phase 4b.2: <ProductNotesSection /> goes here */}
            <Card>
                <div className={styles.notesPlaceholder}>
                    <Text variant="title-sm" weight={600}>
                        Note prodotto
                    </Text>
                    <Text variant="body-sm" colorVariant="muted">
                        Disponibile a breve. Le note ti permetteranno di aggiungere coppie
                        chiave-valore personalizzate (es. provenienza, tempi di cottura,
                        certificazioni).
                    </Text>
                </div>
            </Card>

            {isDirty && (
                <div className={styles.actionBar} role="status" aria-live="polite">
                    <div className={styles.actionBarLabel}>
                        <span className={styles.dirtyDot} aria-hidden />
                        <Text variant="body-sm" weight={600}>
                            Modifiche non salvate
                        </Text>
                    </div>
                    <div className={styles.actionBarButtons}>
                        <Button variant="secondary" onClick={handleReset} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" onClick={handleSave} loading={isSaving}>
                            Salva
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
