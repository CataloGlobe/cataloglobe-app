import { useCallback, useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { IconTags } from "@tabler/icons-react";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import {
    listAttributeDefinitions,
    deleteAttributeDefinition,
    V2ProductAttributeDefinition
} from "@/services/supabase/attributes";
import { AttributeCreateEditDrawer } from "@/pages/Dashboard/Attributes/AttributeCreateEditDrawer";
import { AttributeDeleteDrawer } from "@/pages/Dashboard/Attributes/AttributeDeleteDrawer";
import { useToast } from "@/context/Toast/ToastContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import styles from "./ProductsAttributesTab.module.scss";

interface ProductsAttributesTabProps {
    tenantId: string | undefined;
    vertical?: string;
    createTrigger?: number;
}

function getTypeLabel(type: string): string {
    switch (type) {
        case "text": return "Testo";
        case "number": return "Numero";
        case "boolean": return "Sì / No";
        case "select": return "Selezione";
        case "multi_select": return "Selezione multipla";
        default: return type;
    }
}

export function ProductsAttributesTab({ tenantId, vertical, createTrigger }: ProductsAttributesTabProps) {
    const { showToast } = useToast();
    const { canEdit } = useSubscriptionGuard();

    const [isLoading, setIsLoading] = useState(true);
    const [allAttributes, setAllAttributes] = useState<V2ProductAttributeDefinition[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [attributeToEdit, setAttributeToEdit] = useState<V2ProductAttributeDefinition | null>(null);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [attributeToDelete, setAttributeToDelete] = useState<V2ProductAttributeDefinition | null>(null);

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        try {
            setIsLoading(true);
            const data = await listAttributeDefinitions(tenantId, vertical);
            setAllAttributes(data);
        } catch {
            showToast({ message: "Non è stato possibile caricare gli attributi.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, vertical, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (createTrigger) {
            setAttributeToEdit(null);
            setIsCreateEditOpen(true);
        }
    }, [createTrigger]);

    const filteredAttributes = useMemo(() => {
        return allAttributes.filter(attr => {
            if (
                searchQuery &&
                !attr.label.toLowerCase().includes(searchQuery.toLowerCase()) &&
                !attr.code.toLowerCase().includes(searchQuery.toLowerCase())
            ) {
                return false;
            }
            return true;
        });
    }, [allAttributes, searchQuery]);

    const platformAttrs = useMemo(
        () => filteredAttributes.filter(a => a.tenant_id === null),
        [filteredAttributes]
    );
    const tenantAttrs = useMemo(
        () => filteredAttributes.filter(a => a.tenant_id !== null),
        [filteredAttributes]
    );

    const handleCreate = () => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setAttributeToEdit(null); setIsCreateEditOpen(true);
    };
    const handleEdit = (attr: V2ProductAttributeDefinition) => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setAttributeToEdit(attr); setIsCreateEditOpen(true);
    };
    const handleDelete = (attr: V2ProductAttributeDefinition) => { setAttributeToDelete(attr); setIsDeleteOpen(true); };

    const handleBulkDelete = useCallback(async (selectedIds: string[]) => {
        if (!tenantId || selectedIds.length === 0) return;
        const deletableIds = selectedIds.filter(id =>
            allAttributes.find(a => a.id === id)?.tenant_id !== null
        );
        if (deletableIds.length === 0) return;
        try {
            await Promise.all(deletableIds.map(id => deleteAttributeDefinition(id, tenantId)));
            showToast({
                message: `${deletableIds.length} attribut${deletableIds.length === 1 ? "o eliminato" : "i eliminati"}.`,
                type: "success"
            });
            await loadData();
        } catch {
            showToast({ message: "Errore durante l'eliminazione degli attributi.", type: "error" });
        }
    }, [tenantId, allAttributes, showToast, loadData]);

    const tenantColumns: ColumnDefinition<V2ProductAttributeDefinition>[] = [
        {
            id: "label",
            header: "Nome",
            width: "2fr",
            accessor: row => row.label,
            cell: (value) => (
                <Text variant="body-sm" weight={600}>{value}</Text>
            )
        },
        {
            id: "type",
            header: "Tipo di valore",
            width: "160px",
            accessor: row => row.type,
            cell: (value) => (
                <Badge variant="secondary">{getTypeLabel(value)}</Badge>
            )
        },
        {
            id: "show_in_public_channels",
            header: "Pubblico",
            width: "80px",
            accessor: row => row.show_in_public_channels,
            cell: (value) =>
                value ? (
                    <Badge variant="secondary">Sì</Badge>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">—</Text>
                )
        },
        {
            id: "is_required",
            header: "Richiesto",
            width: "80px",
            accessor: row => row.is_required,
            cell: (value) =>
                value ? (
                    <Badge variant="warning">Sì</Badge>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">—</Text>
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
                        { label: "Elimina", onClick: () => handleDelete(row), variant: "destructive", separator: true }
                    ]}
                />
            )
        }
    ];

    const platformColumns: ColumnDefinition<V2ProductAttributeDefinition>[] = [
        {
            id: "label",
            header: "Nome",
            width: "2fr",
            accessor: row => row.label,
            cell: (value) => (
                <Text variant="body-sm" weight={600}>{value}</Text>
            )
        },
        {
            id: "type",
            header: "Tipo di valore",
            width: "160px",
            accessor: row => row.type,
            cell: (value) => (
                <Badge variant="secondary">{getTypeLabel(value)}</Badge>
            )
        },
        {
            id: "is_required",
            header: "Richiesto",
            width: "80px",
            accessor: row => row.is_required,
            cell: (value) =>
                value ? (
                    <Badge variant="warning">Sì</Badge>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">—</Text>
                )
        }
    ];

    return (
        <>
            <Text variant="body-sm" colorVariant="muted" className={styles.description}>
                Gli attributi descrivono caratteristiche dei prodotti (es. colore, taglia). Non influenzano il prezzo.
            </Text>

            <div className={styles.filterBar}>
                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: "Cerca per nome o codice..."
                    }}
                />
            </div>

            {platformAttrs.length > 0 && (
                <div className={styles.platformSection}>
                    <Text variant="body-sm" weight={600} className={styles.sectionTitle}>
                        Suggeriti dalla piattaforma
                    </Text>
                    <DataTable<V2ProductAttributeDefinition>
                        data={platformAttrs}
                        columns={platformColumns}
                        isLoading={isLoading}
                        loadingState={
                            <Text variant="body-sm" colorVariant="muted">Caricamento attributi in corso...</Text>
                        }
                        emptyState={<></>}
                    />
                </div>
            )}

            <div>
                {platformAttrs.length > 0 && (
                    <Text variant="body-sm" weight={600} className={styles.sectionTitle}>
                        Personalizzati
                    </Text>
                )}
                <DataTable<V2ProductAttributeDefinition>
                    data={tenantAttrs}
                    columns={tenantColumns}
                    isLoading={isLoading}
                    selectable
                    onBulkDelete={handleBulkDelete}
                    loadingState={
                        <Text variant="body-sm" colorVariant="muted">Caricamento attributi in corso...</Text>
                    }
                    emptyState={
                        <div className={styles.emptyState}>
                            <IconTags size={40} stroke={1} style={{ color: "var(--color-gray-400)" }} />
                            <Text variant="title-sm" weight={600}>
                                {searchQuery ? "Nessun attributo trovato" : "Nessun attributo personalizzato"}
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                {searchQuery
                                    ? "Nessun attributo corrisponde alla tua ricerca."
                                    : "Crea attributi personalizzati per aggiungere caratteristiche ai prodotti."}
                            </Text>
                            {!searchQuery && (
                                <Button variant="primary" size="sm" onClick={handleCreate} disabled={!canEdit} className={styles.emptyStateButton}>
                                    Crea attributo
                                </Button>
                            )}
                        </div>
                    }
                />
            </div>

            <AttributeCreateEditDrawer
                open={isCreateEditOpen}
                onClose={() => setIsCreateEditOpen(false)}
                attributeData={attributeToEdit}
                onSuccess={loadData}
                tenantId={tenantId}
            />
            <AttributeDeleteDrawer
                open={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                attributeData={attributeToDelete}
                onSuccess={loadData}
            />
        </>
    );
}
