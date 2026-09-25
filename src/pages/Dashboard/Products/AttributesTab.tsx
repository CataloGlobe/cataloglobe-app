import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { ProductAttributesDrawer } from "./ProductAttributesDrawer";
import { Badge } from "@/components/ui/Badge/Badge";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import type { V2ProductAttributeDefinition } from "@/services/supabase/attributes";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import type { AttributeValuesDraft } from "./hooks/useAttributeValuesDraft";
import styles from "./AttributesTab.module.scss";

interface AttributesTabProps {
    productId: string;
    tenantId: string;
    /** Bozza sollevata in `ProductPage` (§27): la salva l'header, come la Scheda. */
    draft: AttributeValuesDraft;
}

const TYPE_LABEL: Record<string, string> = {
    text: "testo libero",
    number: "numero",
    boolean: "sì / no",
    select: "elenco di valori",
    multi_select: "più valori da un elenco"
};

function getSelectOptions(def: V2ProductAttributeDefinition): string[] {
    if (!def.options || !Array.isArray(def.options)) return [];
    return def.options.map((o: unknown) =>
        typeof o === "string" ? o : (o as { label?: string })?.label ?? String(o)
    );
}

/**
 * Tab «Attributi» del prodotto (negozio; lotto Prodotti P8, mockup
 * `prodotto-attributi.png`). I valori sono nella bozza di pagina: il pallino
 * ambra segna il campo toccato, «Salva» nell'header è lo stesso della Scheda.
 * «Assegna» e «Rimuovi» sono strutturali e scrivono subito (§27.2).
 */
export function AttributesTab({ productId, tenantId, draft }: AttributesTabProps) {
    const verticalConfig = useVerticalConfig();
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const linkedDefinitions = draft.definitions.filter(def => draft.linkedIds.has(def.id));
    const dirty = new Set(draft.dirtyIds);

    const valueCell = (def: V2ProductAttributeDefinition) => {
        const value = draft.drafts[def.id] ?? "";
        const error = draft.errors[def.id];
        const disabled = draft.isSaving;
        const label = def.label;
        switch (def.type) {
            case "boolean":
                return (
                    <Switch
                        ariaLabel={label}
                        checked={value === "true"}
                        disabled={disabled}
                        onChange={checked => draft.setDraft(def.id, checked ? "true" : "false")}
                    />
                );
            case "number":
                return (
                    <NumberInput
                        aria-label={label}
                        value={value}
                        disabled={disabled}
                        placeholder="—"
                        step={0.01}
                        error={error}
                        onChange={e => draft.setDraft(def.id, e.target.value)}
                    />
                );
            case "select":
                return (
                    <Select
                        aria-label={label}
                        value={value}
                        disabled={disabled}
                        error={error}
                        options={[
                            { value: "", label: "— nessuna selezione —" },
                            ...getSelectOptions(def).map(o => ({ value: o, label: o }))
                        ]}
                        onChange={e => draft.setDraft(def.id, e.target.value)}
                    />
                );
            case "multi_select": {
                const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
                const options = getSelectOptions(def);
                return (
                    <div className={styles.multiSelectList} role="group" aria-label={label}>
                        {error && (
                            <Text variant="caption" colorVariant="error" role="alert">
                                {error}
                            </Text>
                        )}
                        {options.length > 0 ? (
                            options.map(option => (
                                <CheckboxInput
                                    key={option}
                                    label={option}
                                    checked={selected.includes(option)}
                                    disabled={disabled}
                                    onChange={() => {
                                        const next = selected.includes(option)
                                            ? selected.filter(v => v !== option)
                                            : [...selected, option];
                                        draft.setDraft(def.id, next.join(", "));
                                    }}
                                />
                            ))
                        ) : (
                            <Text variant="caption" colorVariant="muted">
                                Nessuna opzione disponibile.
                            </Text>
                        )}
                    </div>
                );
            }
            default:
                return (
                    <TextInput
                        aria-label={label}
                        value={value}
                        disabled={disabled}
                        placeholder="—"
                        error={error}
                        onChange={e => draft.setDraft(def.id, e.target.value)}
                    />
                );
        }
    };

    const columns: ColumnDefinition<V2ProductAttributeDefinition>[] = [
        {
            id: "name",
            header: "Attributo",
            width: "1fr",
            cell: (_, def) => (
                <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                    <span className={styles.attributeName}>
                        {def.label}
                        {def.is_required && <Badge variant="secondary">Richiesto</Badge>}
                    </span>
                    <span>
                        {TYPE_LABEL[def.type] ?? def.type} ·{" "}
                        {def.show_in_public_channels ? "visibile ai clienti" : "solo interno"}
                    </span>
                </div>
            )
        },
        {
            id: "value",
            header: "Valore",
            width: "minmax(180px, 280px)",
            cell: (_, def) => (
                <div className={styles.valueCell}>
                    {valueCell(def)}
                    <span
                        className={styles.dirtyDot}
                        data-dirty={dirty.has(def.id) || undefined}
                        aria-label={dirty.has(def.id) ? "Modificato, non salvato" : undefined}
                        role={dirty.has(def.id) ? "img" : undefined}
                    />
                </div>
            )
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_, def) => (
                <TableRowActions
                    ariaLabel={`Azioni ${def.label}`}
                    actions={[
                        {
                            label: "Rimuovi",
                            onClick: () => void draft.remove([def.id]),
                            variant: "destructive"
                        }
                    ]}
                />
            )
        }
    ];

    if (draft.loading && draft.definitions.length === 0) {
        return (
            <Text variant="body-sm" colorVariant="muted">
                Caricamento attributi...
            </Text>
        );
    }

    const tenantCount = draft.definitions.length;
    return (
        <Card
            title="Attributi"
            subtitle={`${tenantCount} ${tenantCount === 1 ? "definito" : "definiti"} nell'azienda. I valori si salvano con «Salva».`}
            badge={linkedDefinitions.length > 0 ? <Badge variant="secondary">{linkedDefinitions.length}</Badge> : undefined}
            actions={
                tenantCount > 0 ? (
                    <Button variant="secondary" size="sm" onClick={() => setIsDrawerOpen(true)}>
                        Assegna
                    </Button>
                ) : undefined
            }
            flush={linkedDefinitions.length > 0}
        >
            {linkedDefinitions.length === 0 ? (
                <EmptyState
                    variant="inline"
                    icon={null}
                    title="Nessun attributo assegnato"
                    description={verticalConfig.copy.productAttributes.emptyDescription}
                    action={
                        <Button variant="secondary" size="sm" onClick={() => setIsDrawerOpen(true)}>
                            Assegna
                        </Button>
                    }
                />
            ) : (
                <DataTable
                    data={linkedDefinitions}
                    columns={columns}
                    ariaLabel="Attributi del prodotto"
                    showFooter={false}
                    selectable
                    selectedRowIds={selectedIds}
                    onSelectedRowsChange={setSelectedIds}
                    onBulkDelete={ids => void draft.remove(ids)}
                    bulkActionLabel="Rimuovi"
                />
            )}

            <ProductAttributesDrawer
                open={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                productId={productId}
                tenantId={tenantId}
                definitions={draft.definitions}
                currentValues={draft.values}
                onSuccess={() => void draft.reload()}
            />
        </Card>
    );
}
