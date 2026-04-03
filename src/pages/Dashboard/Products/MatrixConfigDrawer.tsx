import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    saveVariantMatrixConfig,
    generateMissingVariants,
    VariantMatrixConfig,
    VariantDimensionInput
} from "@/services/supabase/productVariants";
import { cartesianProduct } from "@/utils/variantCombinations";
import styles from "./MatrixConfigDrawer.module.scss";

// =============================================================================
// Types
// =============================================================================

type LocalValue = {
    id: string;
    label: string;
};

type LocalDimension = {
    id: string;
    name: string;
    values: LocalValue[];
};

type MatrixConfigDrawerProps = {
    open: boolean;
    onClose: () => void;
    productId: string;
    tenantId: string;
    parentBasePrice: number | null;
    matrixConfig: VariantMatrixConfig | null;
    onSaveSuccess: () => void;
    onGenerateSuccess: () => void;
};

// =============================================================================
// Helpers
// =============================================================================

function makeTempId(): string {
    return crypto.randomUUID();
}

function fromMatrixConfig(config: VariantMatrixConfig | null): LocalDimension[] {
    if (!config || config.dimensions.length === 0) return [];
    return config.dimensions.map(dim => ({
        id: dim.id,
        name: dim.name,
        values: dim.values.map(v => ({ id: v.id, label: v.label }))
    }));
}

function isValid(dims: LocalDimension[]): boolean {
    if (dims.length === 0) return false;
    for (const dim of dims) {
        if (!dim.name.trim()) return false;
        if (dim.values.length === 0) return false;
        if (dim.values.some(v => !v.label.trim())) return false;
    }
    return true;
}

function toServiceInput(dims: LocalDimension[]): VariantDimensionInput[] {
    return dims.map((dim, i) => ({
        name: dim.name.trim(),
        sort_order: i,
        values: dim.values.map((v, j) => ({
            label: v.label.trim(),
            sort_order: j
        }))
    }));
}

const PREVIEW_LIMIT = 20;

/**
 * Returns label combinations for the given local dimensions.
 * Only considers non-empty labels.
 */
function computeCombinations(dims: LocalDimension[]): string[][] {
    const labelArrays = dims.map(d =>
        d.values.map(v => v.label.trim()).filter(l => l.length > 0)
    );
    if (labelArrays.some(a => a.length === 0)) return [];
    return cartesianProduct(labelArrays);
}

// =============================================================================
// CombinationsPreview
// =============================================================================

function CombinationsPreview({ dimensions }: { dimensions: LocalDimension[] }) {
    if (dimensions.length === 0) return null;

    const all = computeCombinations(dimensions);
    if (all.length === 0) return null;

    const visible = all.slice(0, PREVIEW_LIMIT);
    const overflow = all.length - visible.length;

    return (
        <div className={styles.preview}>
            <div className={styles.previewHeader}>
                <Text variant="body-sm" weight={600}>Combinazioni generate</Text>
                <Text variant="body-sm" colorVariant="muted">{all.length}</Text>
            </div>
            <div className={styles.previewList}>
                {visible.map((combo, i) => (
                    <span key={i} className={styles.previewChip}>
                        {combo.join(" / ")}
                    </span>
                ))}
                {overflow > 0 && (
                    <Text variant="body-sm" colorVariant="muted" style={{ alignSelf: "center" }}>
                        e altre {overflow}…
                    </Text>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// Component
// =============================================================================

export function MatrixConfigDrawer({
    open,
    onClose,
    productId,
    tenantId,
    parentBasePrice,
    matrixConfig,
    onSaveSuccess,
    onGenerateSuccess
}: MatrixConfigDrawerProps) {
    const { showToast } = useToast();
    const [dimensions, setDimensions] = useState<LocalDimension[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const busy = isSaving || isGenerating;

    // Prefill when drawer opens
    useEffect(() => {
        if (open) {
            setDimensions(fromMatrixConfig(matrixConfig));
        }
    }, [open, matrixConfig]);

    // -------------------------------------------------------------------------
    // Dimension actions
    // -------------------------------------------------------------------------

    const addDimension = () => {
        if (dimensions.length >= 2) return;
        setDimensions(prev => [
            ...prev,
            { id: makeTempId(), name: "", values: [{ id: makeTempId(), label: "" }] }
        ]);
    };

    const removeDimension = (dimId: string) => {
        setDimensions(prev => prev.filter(d => d.id !== dimId));
    };

    const updateDimensionName = (dimId: string, name: string) => {
        setDimensions(prev =>
            prev.map(d => (d.id === dimId ? { ...d, name } : d))
        );
    };

    // -------------------------------------------------------------------------
    // Value actions
    // -------------------------------------------------------------------------

    const addValue = (dimId: string) => {
        setDimensions(prev =>
            prev.map(d =>
                d.id === dimId
                    ? { ...d, values: [...d.values, { id: makeTempId(), label: "" }] }
                    : d
            )
        );
    };

    const removeValue = (dimId: string, valueId: string) => {
        setDimensions(prev =>
            prev.map(d =>
                d.id === dimId
                    ? { ...d, values: d.values.filter(v => v.id !== valueId) }
                    : d
            )
        );
    };

    const updateValue = (dimId: string, valueId: string, label: string) => {
        setDimensions(prev =>
            prev.map(d =>
                d.id === dimId
                    ? {
                          ...d,
                          values: d.values.map(v => (v.id === valueId ? { ...v, label } : v))
                      }
                    : d
            )
        );
    };

    // -------------------------------------------------------------------------
    // Save
    // -------------------------------------------------------------------------

    const handleSave = async () => {
        if (!isValid(dimensions) || busy) return;
        try {
            setIsSaving(true);
            const input = toServiceInput(dimensions);
            await saveVariantMatrixConfig(productId, tenantId, input);
            showToast({ message: "Configurazione salvata", type: "success" });
            onSaveSuccess();
            onClose();
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Errore durante il salvataggio";
            showToast({ message, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerate = async () => {
        if (!isValid(dimensions) || busy) return;
        try {
            setIsGenerating(true);
            const result = await generateMissingVariants(productId, tenantId, {
                product_type: "simple",
                base_price: parentBasePrice
            });
            const msg =
                result.skipped > 0
                    ? `${result.created.length} create, ${result.skipped} già esistenti`
                    : `${result.created.length} varianti create`;
            showToast({ message: msg, type: "success" });
            onGenerateSuccess();
            onClose();
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Errore durante la generazione";
            showToast({ message, type: "error" });
        } finally {
            setIsGenerating(false);
        }
    };

    const combinationCount = computeCombinations(dimensions).length;
    const canSave = isValid(dimensions);
    const canGenerate = canSave && combinationCount > 0;

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    return (
        <SystemDrawer open={open} onClose={onClose} width={500}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={700}>
                            Configura varianti
                        </Text>
                        <Text variant="body-sm" colorVariant="muted" style={{ marginTop: 2 }}>
                            Definisci le dimensioni e i valori per generare le combinazioni
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={busy}>
                            Annulla
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleSave}
                            loading={isSaving}
                            disabled={!canSave || busy}
                        >
                            Salva configurazione
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleGenerate}
                            loading={isGenerating}
                            disabled={!canGenerate || busy}
                        >
                            {`Genera ${combinationCount > 0 ? combinationCount : ""} varianti`.trim()}
                        </Button>
                    </>
                }
            >
                <div className={styles.body}>
                    {dimensions.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Text variant="body-sm" colorVariant="muted">
                                Nessuna dimensione configurata. Aggiungi una dimensione per iniziare.
                            </Text>
                            <Button variant="secondary" size="sm" onClick={addDimension}>
                                + Aggiungi dimensione
                            </Button>
                        </div>
                    ) : (
                        <>
                            {dimensions.map((dim, dimIndex) => (
                                <div key={dim.id} className={styles.dimensionBlock}>
                                    {/* Dimension header */}
                                    <div className={styles.dimensionHeader}>
                                        <TextInput
                                            placeholder={`Dimensione ${dimIndex + 1} (es. Taglia)`}
                                            value={dim.name}
                                            onChange={e => updateDimensionName(dim.id, e.target.value)}
                                            containerClassName={styles.dimNameInput}
                                        />
                                        <IconButton
                                            icon="×"
                                            aria-label="Rimuovi dimensione"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeDimension(dim.id)}
                                        />
                                    </div>

                                    {/* Values */}
                                    <div className={styles.valueList}>
                                        {dim.values.map(val => (
                                            <div key={val.id} className={styles.valueRow}>
                                                <TextInput
                                                    placeholder="Valore (es. S)"
                                                    value={val.label}
                                                    onChange={e =>
                                                        updateValue(dim.id, val.id, e.target.value)
                                                    }
                                                    containerClassName={styles.valueInput}
                                                />
                                                <IconButton
                                                    icon="×"
                                                    aria-label="Rimuovi valore"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeValue(dim.id, val.id)}
                                                    disabled={dim.values.length <= 1}
                                                />
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            className={styles.addValueBtn}
                                            onClick={() => addValue(dim.id)}
                                        >
                                            + Aggiungi valore
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Add dimension CTA or limit message */}
                            {dimensions.length < 2 ? (
                                <Button variant="secondary" size="sm" onClick={addDimension}>
                                    + Aggiungi dimensione
                                </Button>
                            ) : (
                                <Text variant="body-sm" colorVariant="muted">
                                    Puoi aggiungere massimo 2 dimensioni.
                                </Text>
                            )}

                            {/* Combinations preview */}
                            <CombinationsPreview dimensions={dimensions} />
                        </>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
