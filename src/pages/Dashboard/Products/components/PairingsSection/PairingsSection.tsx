import React, { useMemo, useState } from "react";
import { GripVertical, Trash2, Plus, ImageOff } from "lucide-react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy
} from "@dnd-kit/sortable";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { SortableDataTableRow } from "@/components/ui/DataTable/SortableDataTableRow";
import { PairingProductPicker } from "./PairingProductPicker";
import styles from "./PairingsSection.module.scss";

/** Riga di abbinamento nel draft del parent (SchedaTab). */
export type PairingDraftItem = {
    pairedProductId: string;
    pairedProductName: string | null;
    pairedProductImageUrl: string | null;
    note: string;
};

interface PairingsSectionProps {
    tenantId: string;
    /** Prodotto sorgente — escluso dal picker e da self-pairing. */
    currentProductId: string;
    value: PairingDraftItem[];
    onChange: (next: PairingDraftItem[]) => void;
    disabled?: boolean;
}

export default function PairingsSection({
    tenantId,
    currentProductId,
    value,
    onChange,
    disabled = false
}: PairingsSectionProps) {
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    const excludeIds = useMemo(
        () => value.map(item => item.pairedProductId),
        [value]
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = value.findIndex(item => item.pairedProductId === active.id);
        const newIndex = value.findIndex(item => item.pairedProductId === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        // Nessun reindex qui: `sort_order` è assegnato dall'ordine array al
        // salvataggio (draft pattern, persist via UnsavedChangesBar del parent).
        onChange(arrayMove(value, oldIndex, newIndex));
    };

    const handleNoteChange = (pairedProductId: string, note: string) => {
        onChange(
            value.map(item =>
                item.pairedProductId === pairedProductId ? { ...item, note } : item
            )
        );
    };

    const handleRemove = (pairedProductId: string) => {
        onChange(value.filter(item => item.pairedProductId !== pairedProductId));
    };

    const handleAdd = (
        items: {
            pairedProductId: string;
            pairedProductName: string | null;
            pairedProductImageUrl: string | null;
        }[]
    ) => {
        const existingIds = new Set(value.map(item => item.pairedProductId));
        const toAdd = items
            .filter(item => !existingIds.has(item.pairedProductId))
            .map(item => ({ ...item, note: "" }));
        if (toAdd.length === 0) return;
        onChange([...value, ...toAdd]);
    };

    const columns = useMemo<ColumnDefinition<PairingDraftItem>[]>(
        () => [
            {
                id: "drag",
                header: "",
                width: "44px",
                align: "center",
                cell: (_value, _row, _rowIndex, dragHandleProps?: unknown) => (
                    <button
                        type="button"
                        aria-label="Trascina per riordinare"
                        className={styles.dragBtn}
                        {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
                    >
                        <GripVertical size={16} />
                    </button>
                )
            },
            {
                id: "product",
                header: "Prodotto",
                width: "1.4fr",
                cell: (_value, row) => (
                    <div className={styles.productCell}>
                        {row.pairedProductImageUrl ? (
                            <img
                                src={row.pairedProductImageUrl}
                                alt=""
                                className={styles.thumb}
                            />
                        ) : (
                            <span className={styles.thumbPlaceholder} aria-hidden>
                                <ImageOff size={14} />
                            </span>
                        )}
                        <Text variant="body-sm" weight={600} className={styles.name}>
                            {row.pairedProductName ?? "Prodotto non disponibile"}
                        </Text>
                    </div>
                )
            },
            {
                id: "note",
                header: "Perché si abbina?",
                width: "1.6fr",
                cell: (_value, row) => (
                    <TextInput
                        value={row.note}
                        placeholder="Perché si abbina?"
                        onChange={event =>
                            handleNoteChange(row.pairedProductId, event.target.value)
                        }
                        disabled={disabled}
                    />
                )
            },
            {
                id: "remove",
                header: "",
                width: "44px",
                align: "right",
                cell: (_value, row) => (
                    <button
                        type="button"
                        aria-label="Rimuovi abbinamento"
                        className={styles.removeBtn}
                        onClick={() => handleRemove(row.pairedProductId)}
                        disabled={disabled}
                    >
                        <Trash2 size={16} />
                    </button>
                )
            }
        ],
        // handleNoteChange/handleRemove chiudono su `value`+`onChange`, stabili
        // quanto basta: le celle vengono ricreate ad ogni render del componente.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [value, disabled]
    );

    return (
        <div className={styles.root}>
            {value.length > 0 && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={value.map(item => item.pairedProductId)}
                        strategy={verticalListSortingStrategy}
                    >
                        <DataTable<PairingDraftItem>
                            data={value}
                            columns={columns}
                            getRowId={row => row.pairedProductId}
                            // maxHeight esplicito: disattiva la modalità "auto"
                            // (isProbeStretchedByParent dà falso positivo in un
                            // wrapper flex-column non vincolato → scroll interno
                            // anche con 1-2 righe). Tetto ragionevole, scroll
                            // solo oltre ~10 righe; sotto quel numero la tabella
                            // si distende e le mostra tutte.
                            maxHeight="480px"
                            pageSize={25}
                            pageSizeOptions={[25, 50, "all"]}
                            rowWrapper={(row, rowData) => (
                                <SortableDataTableRow
                                    key={rowData.pairedProductId}
                                    id={rowData.pairedProductId}
                                    draggingOpacity={0.55}
                                >
                                    {row}
                                </SortableDataTableRow>
                            )}
                        />
                    </SortableContext>
                </DndContext>
            )}

            {value.length === 0 && (
                <Text variant="body-sm" colorVariant="muted">
                    Nessun abbinamento. Suggerisci prodotti che stanno bene insieme.
                </Text>
            )}

            <div className={styles.addRow}>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus size={16} />}
                    onClick={() => setIsPickerOpen(true)}
                    disabled={disabled}
                >
                    Aggiungi abbinamento
                </Button>
            </div>

            <PairingProductPicker
                open={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                tenantId={tenantId}
                currentProductId={currentProductId}
                excludeIds={excludeIds}
                onAdd={handleAdd}
            />
        </div>
    );
}
