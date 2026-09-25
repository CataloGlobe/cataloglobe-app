import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconLeaf } from "@tabler/icons-react";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useEnsureActive } from "../hooks/useEnsureActive";
import {
    listIngredients,
    listProductIngredientPairs,
    deleteIngredient,
    V2Ingredient
} from "@/services/supabase/ingredients";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { IngredientsCreateEditDrawer } from "./IngredientsCreateEditDrawer";
import { IngredientDeleteDialog } from "./IngredientDeleteDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useBulkDelete } from "../hooks/useBulkDelete";
import styles from "./Ingredients.module.scss";

type IngredientsProps = {
    createTrigger?: number;
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
    /** `products.write`: senza, niente selezione, «⋯» né CTA. */
    canWrite: boolean;
};

export function Ingredients({ createTrigger, searchQuery, canWrite }: IngredientsProps) {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { canEdit, ensureActive } = useEnsureActive();

    const [isLoading, setIsLoading] = useState(true);
    const [ingredients, setIngredients] = useState<V2Ingredient[]>([]);
    // Quanti prodotti usano ogni ingrediente (§26.2: «quanto è usato» batte
    // «quando è nato»). Una query sola, già nel service.
    const [usage, setUsage] = useState<Map<string, number>>(new Map());
    const { productLabel, productLabelPlural } = useVerticalConfig();

    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [editMode, setEditMode] = useState<"create" | "edit">("create");
    const [ingredientToEdit, setIngredientToEdit] = useState<V2Ingredient | null>(null);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [ingredientToDelete, setIngredientToDelete] = useState<V2Ingredient | null>(null);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        try {
            setIsLoading(true);
            const [data, pairs] = await Promise.all([
                listIngredients(tenantId),
                listProductIngredientPairs(tenantId)
            ]);
            setIngredients(data);
            const counts = new Map<string, number>();
            for (const pair of pairs) counts.set(pair.ingredient_id, (counts.get(pair.ingredient_id) ?? 0) + 1);
            setUsage(counts);
        } catch (error) {
            console.error("Errore nel caricamento degli ingredienti:", error);
            showToast({ message: "Non è stato possibile caricare gli ingredienti.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (createTrigger) {
            setIngredientToEdit(null);
            setEditMode("create");
            setIsCreateEditOpen(true);
        }
    }, [createTrigger]);

    const filteredIngredients = useMemo(
        () =>
            ingredients.filter(
                i =>
                    !searchQuery ||
                    i.name.toLowerCase().includes(searchQuery.toLowerCase())
            ),
        [ingredients, searchQuery]
    );
    const allIngredientIds = useMemo(() => ingredients.map(i => i.id), [ingredients]);

    const handleCreate = () => {
        if (!ensureActive()) return;
        setIngredientToEdit(null);
        setEditMode("create");
        setIsCreateEditOpen(true);
    };

    const handleEdit = (ingredient: V2Ingredient) => {
        if (!ensureActive()) return;
        setIngredientToEdit(ingredient);
        setEditMode("edit");
        setIsCreateEditOpen(true);
    };

    const handleDelete = (ingredient: V2Ingredient) => {
        setIngredientToDelete(ingredient);
        setIsDeleteOpen(true);
    };

    const bulk = useBulkDelete({
        deleteOne: id => deleteIngredient(id, tenantId!),
        onDone: loadData,
        nouns: { one: "ingrediente", many: "ingredienti", deletedOne: "eliminato", deletedMany: "eliminati" },
        blockedReason: "usato da uno o più prodotti"
    });

    const columns: ColumnDefinition<V2Ingredient>[] = [
        {
            id: "name",
            header: "Nome",
            width: "2fr",
            accessor: row => row.name,
            cell: value => (
                <Text variant="body-sm" weight={600}>
                    {value}
                </Text>
            )
        },
        {
            id: "usage",
            header: "Usato in",
            width: "160px",
            accessor: row => usage.get(row.id) ?? 0,
            cell: (_value, row) => {
                const n = usage.get(row.id) ?? 0;
                return n > 0 ? (
                    <Text variant="body-sm">
                        {n} {n === 1 ? productLabel.toLowerCase() : productLabelPlural.toLowerCase()}
                    </Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        nessuno
                    </Text>
                );
            }
        },
        ...(canWrite ? [{
            id: "actions",
            header: "",
            width: "56px",
            align: "right" as const,
            cell: (_value: unknown, row: V2Ingredient) => (
                <TableRowActions
                    actions={[
                        { label: "Modifica", onClick: () => handleEdit(row) },
                        {
                            label: "Elimina",
                            onClick: () => handleDelete(row),
                            variant: "destructive" as const,
                            separator: true
                        }
                    ]}
                />
            )
        }] : [])
    ];

    return (
        <div className={styles.root}>
            <DataTable<V2Ingredient>
                data={filteredIngredients}
                allRowIds={allIngredientIds}
                columns={columns}
                isLoading={isLoading}
                ariaLabel="Ingredienti"
                selectable={canWrite}
                selectedRowIds={bulk.selectedIds}
                onSelectedRowsChange={bulk.setSelectedIds}
                onBulkDelete={canWrite ? bulk.request : undefined}
                loadingState={{
                    message: "Caricamento ingredienti in corso..."
                }}
                emptyState={{
                    icon: <IconLeaf size={40} stroke={1} style={{ color: "var(--color-gray-400)" }} />,
                    title: searchQuery ? "Nessun ingrediente trovato" : "Nessun ingrediente creato",
                    description: searchQuery
                        ? "Nessun ingrediente corrisponde alla tua ricerca."
                        : "Aggiungi ingredienti per associarli ai tuoi prodotti.",
                    action: !searchQuery && canWrite ? (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleCreate}
                            disabled={!canEdit}
                        >
                            Crea ingrediente
                        </Button>
                    ) : undefined
                }}
            />

            {tenantId && (
                <>
                    <IngredientsCreateEditDrawer
                        open={isCreateEditOpen}
                        onClose={() => setIsCreateEditOpen(false)}
                        mode={editMode}
                        ingredientData={ingredientToEdit}
                        tenantId={tenantId}
                        onSuccess={loadData}
                    />

                    <ConfirmDialog
                        {...bulk.dialog}
                        message="Un ingrediente usato da un prodotto non si elimina: resta, e lo dice. Non si torna indietro."
                    />

                    <IngredientDeleteDialog
                        open={isDeleteOpen}
                        onClose={() => setIsDeleteOpen(false)}
                        ingredient={ingredientToDelete}
                        usedBy={ingredientToDelete ? (usage.get(ingredientToDelete.id) ?? 0) : 0}
                        tenantId={tenantId}
                        onSuccess={loadData}
                    />
                </>
            )}
        </div>
    );
}
