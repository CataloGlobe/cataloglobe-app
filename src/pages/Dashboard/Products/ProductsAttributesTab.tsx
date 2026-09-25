import { useCallback, useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconTags } from "@tabler/icons-react";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import {
    listAttributeDefinitions,
    deleteAttributeDefinition,
    V2ProductAttributeDefinition
} from "@/services/supabase/attributes";
import { AttributeCreateEditDrawer } from "./Attributes/AttributeCreateEditDrawer";
import { AttributeDeleteDialog } from "./Attributes/AttributeDeleteDialog";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useEnsureActive } from "./hooks/useEnsureActive";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useBulkDelete } from "./hooks/useBulkDelete";
import styles from "./ProductsAttributesTab.module.scss";

interface ProductsAttributesTabProps {
    tenantId: string | undefined;
    vertical?: string;
    createTrigger?: number;
    /** Ricerca in testata (Products), per nome o codice. */
    searchQuery: string;
    /** `attributes.write`: senza, niente selezione, «⋯» né CTA. */
    canWrite: boolean;
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

export function ProductsAttributesTab({ tenantId, vertical, createTrigger, searchQuery, canWrite }: ProductsAttributesTabProps) {
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();
    const { canEdit, ensureActive } = useEnsureActive();

    const [isLoading, setIsLoading] = useState(true);
    const [allAttributes, setAllAttributes] = useState<V2ProductAttributeDefinition[]>([]);

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
    const allTenantAttrIds = useMemo(
        () => allAttributes.filter(a => a.tenant_id !== null).map(a => a.id),
        [allAttributes]
    );

    const handleCreate = () => {
        if (!ensureActive()) return;
        setAttributeToEdit(null); setIsCreateEditOpen(true);
    };
    const handleEdit = (attr: V2ProductAttributeDefinition) => {
        if (!ensureActive()) return;
        setAttributeToEdit(attr); setIsCreateEditOpen(true);
    };
    const handleDelete = (attr: V2ProductAttributeDefinition) => { setAttributeToDelete(attr); setIsDeleteOpen(true); };

    // Solo i personalizzati sono selezionabili: la piattaforma è in sola lettura.
    const bulk = useBulkDelete({
        deleteOne: id => deleteAttributeDefinition(id, tenantId!),
        onDone: loadData,
        nouns: { one: "attributo", many: "attributi", deletedOne: "eliminato", deletedMany: "eliminati" }
    });

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
        ...(canWrite ? [{
            id: "actions",
            header: "",
            width: "56px",
            align: "right" as const,
            cell: (_value: unknown, row: V2ProductAttributeDefinition) => (
                <TableRowActions
                    actions={[
                        { label: "Modifica", onClick: () => handleEdit(row) },
                        { label: "Elimina", onClick: () => handleDelete(row), variant: "destructive" as const, separator: true }
                    ]}
                />
            )
        }] : [])
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
                {verticalConfig.copy.productAttributes.introDescription}
            </Text>

            {platformAttrs.length > 0 && (
                <div className={styles.platformSection}>
                    <Text variant="body-sm" weight={600} className={styles.sectionTitle}>
                        Suggeriti dalla piattaforma
                    </Text>
                    <DataTable<V2ProductAttributeDefinition>
                        data={platformAttrs}
                        columns={platformColumns}
                        isLoading={isLoading}
                        ariaLabel="Attributi suggeriti dalla piattaforma"
                        loadingState={{ message: "Caricamento attributi in corso..." }}
                        emptyState={{ title: "Nessun attributo suggerito" }}
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
                    allRowIds={allTenantAttrIds}
                    columns={tenantColumns}
                    isLoading={isLoading}
                    ariaLabel="Attributi personalizzati"
                    selectable={canWrite}
                    selectedRowIds={bulk.selectedIds}
                    onSelectedRowsChange={bulk.setSelectedIds}
                    onBulkDelete={canWrite ? bulk.request : undefined}
                    loadingState={{ message: "Caricamento attributi in corso..." }}
                    emptyState={{
                        icon: <IconTags size={40} stroke={1} />,
                        title: searchQuery ? "Nessun attributo trovato" : "Nessun attributo personalizzato",
                        description: searchQuery
                            ? "Nessun attributo corrisponde alla tua ricerca."
                            : verticalConfig.copy.productAttributes.emptyDescription,
                        action: !searchQuery && canWrite ? (
                            <Button variant="primary" size="sm" onClick={handleCreate} disabled={!canEdit}>
                                Crea attributo
                            </Button>
                        ) : undefined
                    }}
                />
            </div>

            <AttributeCreateEditDrawer
                open={isCreateEditOpen}
                onClose={() => setIsCreateEditOpen(false)}
                attributeData={attributeToEdit}
                onSuccess={loadData}
                tenantId={tenantId}
            />
            <ConfirmDialog
                {...bulk.dialog}
                message="Si tolgono anche i valori che questi attributi hanno sui prodotti, e non si torna indietro."
            />
            <AttributeDeleteDialog
                open={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                attributeData={attributeToDelete}
                onSuccess={loadData}
            />
        </>
    );
}
