import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { IconLeaf } from "@tabler/icons-react";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { listIngredients, deleteIngredient, V2Ingredient } from "@/services/supabase/ingredients";
import { IngredientsCreateEditDrawer } from "./IngredientsCreateEditDrawer";
import { IngredientsDeleteDrawer } from "./IngredientsDeleteDrawer";

type IngredientsProps = {
    createTrigger?: number;
};

const formatDate = (iso: string): string =>
    new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(iso));

export function Ingredients({ createTrigger }: IngredientsProps) {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { canEdit } = useSubscriptionGuard();

    const [isLoading, setIsLoading] = useState(true);
    const [ingredients, setIngredients] = useState<V2Ingredient[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [editMode, setEditMode] = useState<"create" | "edit">("create");
    const [ingredientToEdit, setIngredientToEdit] = useState<V2Ingredient | null>(null);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [ingredientToDelete, setIngredientToDelete] = useState<V2Ingredient | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        try {
            setIsLoading(true);
            const data = await listIngredients(tenantId);
            setIngredients(data);
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

    const handleCreate = () => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setIngredientToEdit(null);
        setEditMode("create");
        setIsCreateEditOpen(true);
    };

    const handleEdit = (ingredient: V2Ingredient) => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setIngredientToEdit(ingredient);
        setEditMode("edit");
        setIsCreateEditOpen(true);
    };

    const handleDelete = (ingredient: V2Ingredient) => {
        setIngredientToDelete(ingredient);
        setIsDeleteOpen(true);
    };

    const handleBulkDelete = useCallback(async (ids: string[]) => {
        if (!tenantId || ids.length === 0) return;
        try {
            await Promise.all(ids.map(id => deleteIngredient(id, tenantId)));
            showToast({
                message: `${ids.length} ${ids.length === 1 ? "ingrediente eliminato" : "ingredienti eliminati"}`,
                type: "success"
            });
            setSelectedIds([]);
            await loadData();
        } catch (error: unknown) {
            const code = error && typeof error === "object" && "code" in error
                ? (error as { code: string }).code
                : null;
            if (code === "23503") {
                showToast({
                    message: "Alcuni ingredienti sono utilizzati da prodotti e non possono essere eliminati.",
                    type: "error"
                });
            } else {
                showToast({ message: "Errore nell'eliminazione degli ingredienti.", type: "error" });
            }
        }
    }, [tenantId, showToast, loadData]);

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
            id: "created_at",
            header: "Data creazione",
            width: "160px",
            accessor: row => row.created_at,
            cell: value => (
                <Text variant="body-sm" colorVariant="muted">
                    {formatDate(value)}
                </Text>
            )
        },
        {
            id: "actions",
            header: "",
            width: "72px",
            align: "right",
            cell: (_value, row) => (
                <TableRowActions
                    actions={[
                        { label: "Modifica", onClick: () => handleEdit(row) },
                        {
                            label: "Elimina",
                            onClick: () => handleDelete(row),
                            variant: "destructive",
                            separator: true
                        }
                    ]}
                />
            )
        }
    ];

    return (
        <>
            <Text variant="body-sm" colorVariant="muted" style={{ marginBottom: 20 }}>
                Gli ingredienti vengono associati ai prodotti per descriverne la composizione.
            </Text>

            <div style={{ marginBottom: 16 }}>
                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: "Cerca ingrediente..."
                    }}
                />
            </div>

            <DataTable<V2Ingredient>
                data={filteredIngredients}
                columns={columns}
                isLoading={isLoading}
                selectable
                selectedRowIds={selectedIds}
                onSelectedRowsChange={setSelectedIds}
                onBulkDelete={handleBulkDelete}
                loadingState={
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento ingredienti in corso...
                    </Text>
                }
                emptyState={
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 10,
                            padding: "32px 0",
                            textAlign: "center"
                        }}
                    >
                        <IconLeaf size={40} stroke={1} style={{ color: "var(--color-gray-400)" }} />
                        <Text variant="title-sm" weight={600}>
                            {searchQuery ? "Nessun ingrediente trovato" : "Nessun ingrediente creato"}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {searchQuery
                                ? "Nessun ingrediente corrisponde alla tua ricerca."
                                : "Aggiungi ingredienti per associarli ai tuoi prodotti."}
                        </Text>
                        {!searchQuery && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleCreate}
                                disabled={!canEdit}
                                style={{ marginTop: 4 }}
                            >
                                Crea ingrediente
                            </Button>
                        )}
                    </div>
                }
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

                    <IngredientsDeleteDrawer
                        open={isDeleteOpen}
                        onClose={() => setIsDeleteOpen(false)}
                        ingredientData={ingredientToDelete}
                        tenantId={tenantId}
                        onSuccess={loadData}
                    />
                </>
            )}
        </>
    );
}
