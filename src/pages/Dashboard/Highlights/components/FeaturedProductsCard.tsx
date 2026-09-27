import { useMemo } from "react";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { DataTableDragHandle, SortableDataTableRow } from "@/components/ui/DataTable/SortableDataTableRow";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { ExternalLink, X } from "lucide-react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { FeaturedProductDraftRow } from "../hooks/useFeaturedProductsDraft";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import styles from "./FeaturedProductsCard.module.scss";

type FeaturedProductsCardProps = {
    rows: FeaturedProductDraftRow[];
    loading: boolean;
    loadError: boolean;
    onRetry: () => void;
    dirtyNoteKeys: Set<string>;
    /** Il prezzo per prodotto si mostra solo dove conta (Promo, Bundle col totale). */
    showPrice: boolean;
    readOnly: boolean;
    onAdd: () => void;
    onMove: (fromKey: string, toKey: string) => void;
    onNoteChange: (key: string, note: string) => void;
    onRemove: (key: string) => void;
    /** Link alla pagina del prodotto (§49.1/3: il prodotto ha una pagina sola). */
    productUrl: (productId: string) => string;
};

/**
 * I prodotti di un contenuto in evidenza (mockup «Prodotti 2»): riordino,
 * nota e «Togli» vanno nella bozza della pagina e si scrivono col suo Salva
 * (§50.11/2); il pallino dice quale nota è cambiata.
 */
export function FeaturedProductsCard({
    rows,
    loading,
    loadError,
    onRetry,
    dirtyNoteKeys,
    showPrice,
    readOnly,
    onAdd,
    onMove,
    onNoteChange,
    onRemove,
    productUrl
}: FeaturedProductsCardProps) {
    // Sul telefono la nota va sotto il nome (la colonna Nota esce, `hideOnPhone`).
    const isPhone = useMediaQuery("(max-width: 767px)");
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        onMove(String(active.id), String(over.id));
    };

    const noteField = (row: FeaturedProductDraftRow) => (
        <div className={styles.noteCell} data-row-click-ignore="true">
            <TextInput
                aria-label={`Nota per ${row.name}`}
                value={row.note}
                placeholder="Aggiungi una nota..."
                disabled={readOnly}
                onChange={event => onNoteChange(row.key, event.target.value)}
            />
            <span
                className={styles.dirtyDot}
                data-dirty={dirtyNoteKeys.has(row.key) || undefined}
                aria-label={dirtyNoteKeys.has(row.key) ? "Nota non salvata" : undefined}
            />
        </div>
    );

    const columns = useMemo<ColumnDefinition<FeaturedProductDraftRow>[]>(
        () => [
            ...(readOnly
                ? []
                : [
                      {
                          id: "drag",
                          header: "",
                          width: "40px",
                          align: "center" as const,
                          cell: (_v: unknown, row: FeaturedProductDraftRow, _i: number, dragHandleProps?: unknown) => (
                              <DataTableDragHandle
                                  aria-label={`Riordina ${row.name}`}
                                  {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
                              />
                          )
                      }
                  ]),
            {
                id: "name",
                header: "Prodotto",
                width: "1fr",
                cell: (_v, row) => (
                    <div className={styles.nameCell}>
                        <Text variant="body-sm" weight={600} className={styles.ellipsis}>
                            {row.name}
                        </Text>
                        {showPrice && row.priceLabel && (
                            <Text variant="caption" colorVariant="muted">
                                {row.priceLabel}
                            </Text>
                        )}
                        {isPhone && noteField(row)}
                    </div>
                )
            },
            {
                id: "note",
                header: "Nota",
                width: "1fr",
                hideOnPhone: true,
                cell: (_v, row) => noteField(row)
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_v, row) => (
                    <TableRowActions
                        ariaLabel={`Azioni ${row.name}`}
                        actions={[
                            {
                                label: "Apri il prodotto",
                                icon: ExternalLink,
                                onClick: () => window.open(productUrl(row.productId), "_blank", "noopener")
                            },
                            ...(readOnly
                                ? []
                                : [{ label: "Togli", icon: X, variant: "destructive" as const, separator: true, onClick: () => onRemove(row.key) }])
                        ]}
                    />
                )
            }
        ],
        // noteField legge readOnly, dirtyNoteKeys e onNoteChange, già qui sotto.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [readOnly, showPrice, dirtyNoteKeys, onNoteChange, onRemove, productUrl, isPhone]
    );

    return (
        <Card
            title="Prodotti"
            badge={<Badge variant="neutral">{rows.length}</Badge>}
            subtitle={readOnly ? undefined : "Trascina per riordinare. Ordine, note e prodotti tolti si salvano col Salva della pagina."}
            actions={
                readOnly ? undefined : (
                    <Button variant="secondary" size="sm" onClick={onAdd}>
                        Aggiungi
                    </Button>
                )
            }
        >
            {loadError ? (
                <div className={styles.errorRow}>
                    <Text variant="body-sm" colorVariant="muted">
                        Non è stato possibile caricare i prodotti.
                    </Text>
                    <Button variant="secondary" size="sm" onClick={onRetry}>
                        Riprova
                    </Button>
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={rows.map(row => row.key)} strategy={verticalListSortingStrategy}>
                        <DataTable<FeaturedProductDraftRow>
                            data={rows}
                            columns={columns}
                            isLoading={loading}
                            ariaLabel="Prodotti del contenuto"
                            getRowId={row => row.key}
                            showFooter={false}
                            emptyState={{
                                title: "Nessun prodotto collegato",
                                description: "Un contenuto Promo o Bundle mostra i prodotti che colleghi qui.",
                                action: readOnly ? undefined : (
                                    <Button variant="secondary" size="sm" onClick={onAdd}>
                                        Aggiungi
                                    </Button>
                                )
                            }}
                            rowWrapper={
                                readOnly
                                    ? undefined
                                    : (row, rowData) => (
                                          <SortableDataTableRow key={rowData.key} id={rowData.key} draggingOpacity={0.55}>
                                              {row}
                                          </SortableDataTableRow>
                                      )
                            }
                        />
                    </SortableContext>
                </DndContext>
            )}
        </Card>
    );
}
