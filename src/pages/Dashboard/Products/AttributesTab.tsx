import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/Button/Button";
import { ProductAttributesDrawer } from "./ProductAttributesDrawer";
import { Badge } from "@/components/ui/Badge/Badge";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    V2ProductAttributeDefinition,
    V2ProductAttributeValue,
    AttributeValuePayload,
    listAttributeDefinitions,
    getProductAttributes,
    setProductAttributeValue,
    removeProductAttributeValue
} from "@/services/supabase/attributes";
import styles from "./AttributesTab.module.scss";

interface AttributesTabProps {
    productId: string;
    tenantId: string;
    vertical?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValueRowEmpty(
    def: V2ProductAttributeDefinition,
    val: V2ProductAttributeValue
): boolean {
    switch (def.type) {
        case "text":
        case "select":
            return !val.value_text || val.value_text.trim() === "";
        case "number":
            return val.value_number === null || val.value_number === undefined;
        case "multi_select":
            return !val.value_json ||
                (Array.isArray(val.value_json) && (val.value_json as unknown[]).length === 0);
        default:
            return false;
    }
}

function getRequiredError(
    def: V2ProductAttributeDefinition,
    payload: AttributeValuePayload
): string | null {
    if (!def.is_required || def.type === "boolean") return null;
    switch (def.type) {
        case "text":
        case "select":
            return !payload.value_text || payload.value_text.trim() === ""
                ? "Campo obbligatorio"
                : null;
        case "number":
            return payload.value_number === null || payload.value_number === undefined
                ? "Campo obbligatorio"
                : null;
        case "multi_select":
            return !payload.value_json ||
                (Array.isArray(payload.value_json) && payload.value_json.length === 0)
                ? "Campo obbligatorio"
                : null;
        default:
            return null;
    }
}

function getSelectOptions(def: V2ProductAttributeDefinition): string[] {
    if (!def.options || !Array.isArray(def.options)) return [];
    return def.options.map((o: unknown) =>
        typeof o === "string" ? o : (o as { label?: string })?.label ?? String(o)
    );
}

function initDraftValue(
    def: V2ProductAttributeDefinition,
    valueRow: V2ProductAttributeValue | undefined
): string {
    if (!valueRow) return def.type === "boolean" ? "false" : "";
    switch (def.type) {
        case "text":
        case "select":
            return valueRow.value_text ?? "";
        case "number":
            return valueRow.value_number !== null ? String(valueRow.value_number) : "";
        case "boolean":
            return valueRow.value_boolean === true ? "true" : "false";
        case "multi_select": {
            const arr = Array.isArray(valueRow.value_json) ? (valueRow.value_json as string[]) : [];
            return arr.join(", ");
        }
        default:
            return "";
    }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AttributesTab({ productId, tenantId, vertical }: AttributesTabProps) {
    const { showToast } = useToast();

    const [definitions, setDefinitions] = useState<V2ProductAttributeDefinition[]>([]);
    const [values, setValues] = useState<V2ProductAttributeValue[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Per-attribute draft strings (boolean: "true"/"false", number: numeric string, etc.)
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const [defs, vals] = await Promise.all([
                listAttributeDefinitions(tenantId, vertical),
                getProductAttributes(productId, tenantId)
            ]);
            setDefinitions(defs);
            setValues(vals);

            // Initialize drafts from fresh data
            const vMap = new Map(vals.map(v => [v.attribute_definition_id, v]));
            const next: Record<string, string> = {};
            defs.forEach(def => {
                next[def.id] = initDraftValue(def, vMap.get(def.id));
            });
            setDrafts(next);

            // Set immediate errors for required fields that are linked but empty
            const errors: Record<string, string> = {};
            defs.forEach(def => {
                const val = vMap.get(def.id);
                if (val && def.is_required && def.type !== "boolean" && isValueRowEmpty(def, val)) {
                    errors[def.id] = "Campo obbligatorio";
                }
            });
            setFieldErrors(errors);
        } catch {
            showToast({ message: "Errore nel caricamento degli attributi", type: "error" });
        } finally {
            setLoading(false);
        }
    }, [productId, tenantId, vertical, showToast]);

    useEffect(() => { load(); }, [load]);

    const valueMap = new Map(values.map(v => [v.attribute_definition_id, v]));

    // ── Save helpers ───────────────────────────────────────────────────────────

    const saveValue = useCallback(async (
        def: V2ProductAttributeDefinition,
        payload: AttributeValuePayload
    ) => {
        const requiredError = getRequiredError(def, payload);
        if (requiredError) {
            setFieldErrors(prev => ({ ...prev, [def.id]: requiredError }));
            return;
        }
        setFieldErrors(prev => {
            if (!prev[def.id]) return prev;
            const next = { ...prev };
            delete next[def.id];
            return next;
        });

        setSavingIds(prev => new Set(prev).add(def.id));
        try {
            await setProductAttributeValue(tenantId, productId, def.id, payload);
            showToast({ message: "Attributo salvato", type: "success" });
        } catch {
            showToast({ message: "Errore nel salvataggio", type: "error" });
        } finally {
            setSavingIds(prev => { const s = new Set(prev); s.delete(def.id); return s; });
        }
    }, [tenantId, productId, showToast]);

    const setDraft = (defId: string, value: string) => {
        setDrafts(prev => ({ ...prev, [defId]: value }));
        setFieldErrors(prev => {
            if (!prev[defId]) return prev;
            const next = { ...prev };
            delete next[defId];
            return next;
        });
    };

    // ── Remove helpers ─────────────────────────────────────────────────────────

    const handleRemove = useCallback(async (defId: string) => {
        try {
            await removeProductAttributeValue(tenantId, productId, defId);
            showToast({ message: "Attributo rimosso", type: "success" });
            await load();
        } catch {
            showToast({ message: "Errore nella rimozione", type: "error" });
        }
    }, [tenantId, productId, showToast, load]);

    const handleBulkRemove = useCallback(async (ids: string[]) => {
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map(id => removeProductAttributeValue(tenantId, productId, id)));
            showToast({
                message: `${ids.length} ${ids.length === 1 ? "attributo rimosso" : "attributi rimossi"}`,
                type: "success"
            });
            setSelectedIds([]);
            await load();
        } catch {
            showToast({ message: "Errore nella rimozione", type: "error" });
        }
    }, [tenantId, productId, showToast, load]);

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className={styles.root}>
                <Text variant="body-sm" colorVariant="muted">Caricamento attributi...</Text>
            </div>
        );
    }

    const linkedDefinitions = definitions.filter(def => valueMap.has(def.id));

    const columns: ColumnDefinition<V2ProductAttributeDefinition>[] = [
        {
            id: "name",
            header: "Attributo",
            width: "200px",
            cell: (_, def) => (
                <div className={styles.attributeName}>
                    {def.label}
                    {def.is_required && (
                        <Badge variant="secondary" className={styles.requiredBadge}>
                            Obbligatorio
                        </Badge>
                    )}
                </div>
            ),
        },
        {
            id: "value",
            header: "Valore",
            cell: (_, def) => {
                const isSaving = savingIds.has(def.id);
                const draft = drafts[def.id] ?? "";
                const fieldError = fieldErrors[def.id];
                const multiSelected = draft
                    ? draft.split(",").map(s => s.trim()).filter(Boolean)
                    : [];

                return (
                    <>
                        {def.type === "boolean" && (
                            <Switch
                                checked={draft === "true"}
                                disabled={isSaving}
                                onChange={checked => {
                                    setDraft(def.id, checked ? "true" : "false");
                                    saveValue(def, { value_boolean: checked });
                                }}
                            />
                        )}

                        {def.type === "text" && (
                            <TextInput
                                value={draft}
                                disabled={isSaving}
                                placeholder={`Inserisci ${def.label.toLowerCase()}...`}
                                error={fieldError}
                                onChange={e => setDraft(def.id, e.target.value)}
                                onBlur={() =>
                                    saveValue(def, { value_text: draft.trim() || null })
                                }
                            />
                        )}

                        {def.type === "number" && (
                            <NumberInput
                                value={draft}
                                disabled={isSaving}
                                placeholder="0"
                                step={0.01}
                                error={fieldError}
                                onChange={e => setDraft(def.id, e.target.value)}
                                onBlur={() => {
                                    const n = parseFloat(draft.replace(",", "."));
                                    saveValue(def, { value_number: isNaN(n) ? null : n });
                                }}
                            />
                        )}

                        {def.type === "select" && (
                            <Select
                                value={draft}
                                disabled={isSaving}
                                error={fieldError}
                                options={[
                                    { value: "", label: "— nessuna selezione —" },
                                    ...getSelectOptions(def).map(o => ({ value: o, label: o }))
                                ]}
                                onChange={e => {
                                    const v = e.target.value;
                                    setDraft(def.id, v);
                                    saveValue(def, { value_text: v || null });
                                }}
                            />
                        )}

                        {def.type === "multi_select" && (
                            <div className={styles.multiSelectList}>
                                {fieldError && (
                                    <Text variant="caption" colorVariant="error" role="alert">
                                        {fieldError}
                                    </Text>
                                )}
                                {getSelectOptions(def).length > 0 ? (
                                    getSelectOptions(def).map(option => (
                                        <label
                                            key={option}
                                            className={`${styles.multiSelectOption}${isSaving ? ` ${styles.disabled}` : ""}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={multiSelected.includes(option)}
                                                disabled={isSaving}
                                                onChange={() => {
                                                    const updated = multiSelected.includes(option)
                                                        ? multiSelected.filter(v => v !== option)
                                                        : [...multiSelected, option];
                                                    setDraft(def.id, updated.join(", "));
                                                    saveValue(def, {
                                                        value_json: updated.length > 0 ? updated : null
                                                    });
                                                }}
                                            />
                                            {option}
                                        </label>
                                    ))
                                ) : (
                                    <Text variant="caption" colorVariant="muted">
                                        Nessuna opzione disponibile.
                                    </Text>
                                )}
                            </div>
                        )}

                        {!["boolean", "text", "number", "select", "multi_select"].includes(def.type) && (
                            <TextInput
                                value={draft}
                                disabled={isSaving}
                                placeholder="Inserisci valore..."
                                onChange={e => setDraft(def.id, e.target.value)}
                                onBlur={() =>
                                    saveValue(def, { value_text: draft.trim() || null })
                                }
                            />
                        )}
                    </>
                );
            },
        },
        {
            id: "actions",
            header: "",
            width: "64px",
            align: "right",
            cell: (_, def) => (
                <div data-row-click-ignore="true">
                    <TableRowActions
                        actions={[
                            {
                                label: "Rimuovi attributo",
                                onClick: () => handleRemove(def.id),
                                variant: "destructive"
                            }
                        ]}
                    />
                </div>
            ),
        },
    ];

    return (
        <div className={styles.root}>
            {/* Tab header */}
            <div className={styles.tabHeader}>
                <Text variant="body-sm" colorVariant="muted">
                    Gli attributi descrivono il prodotto, ma non ne modificano il prezzo.
                </Text>
                {definitions.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => setIsDrawerOpen(true)}>
                        Aggiungi attributo
                    </Button>
                )}
            </div>

            {linkedDefinitions.length === 0 ? (
                <Card>
                    <div className={styles.emptyState}>
                        <Text variant="body-sm" weight={600}>Nessun attributo associato</Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Gli attributi descrivono caratteristiche del prodotto (es. colore, materiale).
                        </Text>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setIsDrawerOpen(true)}
                            className={styles.emptyStateButton}
                        >
                            Aggiungi attributo
                        </Button>
                    </div>
                </Card>
            ) : (
                <DataTable
                    data={linkedDefinitions}
                    columns={columns}
                    density="compact"
                    selectable
                    selectedRowIds={selectedIds}
                    onSelectedRowsChange={setSelectedIds}
                    onBulkDelete={handleBulkRemove}
                />
            )}

            <ProductAttributesDrawer
                open={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                productId={productId}
                tenantId={tenantId}
                definitions={definitions}
                currentValues={values}
                onSuccess={load}
            />
        </div>
    );
}
