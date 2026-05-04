import { useCallback, useEffect, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getProductCharacteristics,
    setProductCharacteristics
} from "@/services/supabase/productCharacteristics";
import {
    updateProduct,
    type ProductNote,
    type V2Product
} from "@/services/supabase/products";
import CharacteristicsSection from "./components/CharacteristicsSection/CharacteristicsSection";
import ProductNotesSection from "./components/ProductNotesSection/ProductNotesSection";
import styles from "./CharacteristicsAndNotesTab.module.scss";

interface CharacteristicsAndNotesTabProps {
    productId: string;
    tenantId: string;
    /** Tenant vertical, used to scope the characteristics lookup. */
    vertical?: string;
    /** Notes loaded from the product (Phase 4a column). Array, possibly empty. */
    initialNotes: ProductNote[];
    /** Bubble back the updated product after a successful notes save. */
    onProductUpdated: (product: V2Product) => void;
}

/**
 * Tab "Caratteristiche e Note" — orchestrator for the two product sections.
 *
 * Persistence is independent per concern via Promise.allSettled:
 * characteristics save through `setProductCharacteristics`, notes save
 * through `updateProduct({ notes })`. A partial save (one fulfilled, one
 * rejected) updates only the fulfilled snapshot and surfaces a toast for the
 * other; the user keeps editing the failed side.
 *
 * Notes snapshot is re-synced from the parent's `initialNotes` only while
 * the tab is NOT dirty, to avoid clobbering pending user edits.
 */
export default function CharacteristicsAndNotesTab({
    productId,
    tenantId,
    vertical,
    initialNotes,
    onProductUpdated
}: CharacteristicsAndNotesTabProps) {
    const { showToast } = useToast();

    const [characteristicIds, setCharacteristicIds] = useState<string[]>([]);
    const [characteristicsSnapshot, setCharacteristicsSnapshot] = useState<string[]>([]);
    const [notes, setNotes] = useState<ProductNote[]>(initialNotes);
    const [notesSnapshot, setNotesSnapshot] = useState<ProductNote[]>(initialNotes);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        getProductCharacteristics(productId, tenantId)
            .then(ids => {
                if (cancelled) return;
                setCharacteristicIds(ids);
                setCharacteristicsSnapshot(ids);
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
        const idsDiffer =
            characteristicIds.length !== characteristicsSnapshot.length ||
            characteristicIds.some(id => !new Set(characteristicsSnapshot).has(id));
        const notesDiffer = JSON.stringify(notes) !== JSON.stringify(notesSnapshot);
        return idsDiffer || notesDiffer;
    }, [characteristicIds, characteristicsSnapshot, notes, notesSnapshot]);

    // Re-sync notes from the parent when initialNotes changes (e.g. parent
    // reloaded the product after a save in another tab). Guarded by !isDirty
    // to avoid clobbering pending edits.
    useEffect(() => {
        if (isDirty) return;
        setNotes(initialNotes);
        setNotesSnapshot(initialNotes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialNotes]);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        const results = await Promise.allSettled([
            setProductCharacteristics(tenantId, productId, characteristicIds),
            updateProduct(productId, tenantId, { notes })
        ]);
        const [charsResult, notesResult] = results;

        if (charsResult.status === "fulfilled") {
            setCharacteristicsSnapshot(characteristicIds);
        } else {
            const msg =
                charsResult.reason instanceof Error
                    ? charsResult.reason.message
                    : "Errore nel salvataggio delle caratteristiche.";
            showToast({ message: msg, type: "error" });
        }

        if (notesResult.status === "fulfilled") {
            const updated = notesResult.value;
            // Use the cleaned/trimmed array returned by the service so the
            // editor immediately reflects what was actually persisted (empty
            // rows dropped, whitespace stripped).
            setNotes(updated.notes);
            setNotesSnapshot(updated.notes);
            onProductUpdated(updated);
        } else {
            const msg =
                notesResult.reason instanceof Error
                    ? notesResult.reason.message
                    : "Errore nel salvataggio delle note.";
            showToast({ message: msg, type: "error" });
        }

        if (
            charsResult.status === "fulfilled" &&
            notesResult.status === "fulfilled"
        ) {
            showToast({ message: "Caratteristiche e note salvate.", type: "success" });
        }

        setIsSaving(false);
    }, [tenantId, productId, characteristicIds, notes, onProductUpdated, showToast]);

    const handleReset = useCallback(() => {
        setCharacteristicIds(characteristicsSnapshot);
        setNotes(notesSnapshot);
    }, [characteristicsSnapshot, notesSnapshot]);

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

            <Card>
                <div className={styles.cardHeader}>
                    <div>
                        <Text variant="title-sm" weight={600}>
                            Note prodotto
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Aggiungi coppie chiave-valore personalizzate visibili nella scheda
                            pubblica.
                        </Text>
                    </div>
                </div>

                <ProductNotesSection
                    value={notes}
                    onChange={setNotes}
                    disabled={isSaving}
                />
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
