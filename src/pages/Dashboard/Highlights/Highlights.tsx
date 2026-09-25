import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Pencil, Trash2, Pin, LayoutGrid, List as ListIcon } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import {
    listFeaturedContents,
    deleteFeaturedContent,
    FeaturedContentWithProducts
} from "@/services/supabase/featuredContents";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useBulkDelete } from "@/hooks/useBulkDelete";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import FeaturedContentDrawer from "./FeaturedContentDrawer";
import FeaturedContentDeleteDrawer from "./FeaturedContentDeleteDrawer";
import FeaturedContentCard from "./components/FeaturedContentCard";
import styles from "./Highlights.module.scss";

import { useNavigate } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";

export default function Highlights() {
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { canEdit, ensureActive } = useEnsureActive();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "featured.write") : false;
    // Gate di lettura prima della fetch: senza `featured.read` nessuna richiesta.
    const canRead = permissions != null && canDoOnAnyActivity(permissions, "featured.read");
    const [loading, setLoading] = useState(true);
    const [contents, setContents] = useState<FeaturedContentWithProducts[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const navigate = useNavigate();

    // Filters and Toolbar
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
        const saved = localStorage.getItem("featuredContents_viewMode");
        return saved === "list" ? "list" : "grid";
    });

    const handleViewChange = useCallback((v: "list" | "grid") => {
        setViewMode(v);
        localStorage.setItem("featuredContents_viewMode", v);
    }, []);

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<FeaturedContentWithProducts | null>(null);

    const loadData = useCallback(async () => {
        if (!tenantId || !canRead) return;
        try {
            setLoading(true);
            const data = await listFeaturedContents(tenantId);
            setContents(data);
        } catch (error) {
            console.error(error);
            showToast({
                type: "error",
                message: "Errore durante il caricamento dei contenuti in evidenza",
                duration: 3000
            });
        } finally {
            setLoading(false);
        }
    }, [tenantId, canRead, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreate = useCallback(() => {
        if (!ensureActive()) return;
        setIsCreateOpen(true);
    }, [ensureActive]);

    const headerActions = useMemo(() => (
        <>
            <ToolbarSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Cerca per titolo..."
            />
            <SegmentedControl<"list" | "grid">
                iconsOnly
                value={viewMode}
                onChange={handleViewChange}
                options={[
                    { value: "grid", icon: <LayoutGrid size={16} />, label: "Vista griglia" },
                    { value: "list", icon: <ListIcon size={16} />, label: "Vista lista" }
                ]}
            />
            {canWrite && (
                <Button
                    variant="primary"
                    onClick={handleCreate}
                    disabled={!canEdit}
                    className={styles.toolbarCta}
                >
                    Crea contenuto
                </Button>
            )}
        </>
    ), [handleCreate, canEdit, canWrite, searchQuery, viewMode, handleViewChange]);

    // Stessa toolbar dichiarata a dati per lo stato compatto. Nessuna
    // `sections`: la pagina non ha tab, quindi la riga compatta parte dalle
    // icone. Il toggle vista resta a vista — azione frequente.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        search: {
            value: searchQuery,
            onChange: setSearchQuery,
            placeholder: "Cerca per titolo..."
        },
        persistentIcons: [
            viewMode === "list"
                ? { icon: <LayoutGrid size={18} />, label: "Vista griglia", onClick: () => handleViewChange("grid") }
                : { icon: <ListIcon size={18} />, label: "Vista lista", onClick: () => handleViewChange("list") }
        ],
        primaryAction: canWrite
            ? { label: "Crea contenuto", onClick: handleCreate, disabled: !canEdit }
            : undefined
    }), [searchQuery, viewMode, handleViewChange, canWrite, handleCreate, canEdit]);

    usePageHeader({
        title: "Contenuti in evidenza",
        subtitle: "Gestisci i contenuti editoriali e aggregatori di prodotti.",
        actions: headerActions,
        compact: headerCompact,
    });

    const handleEdit = (item: FeaturedContentWithProducts) => {
        navigate(`/business/${tenantId}/featured/${item.id}`);
    };

    // Eliminazione multipla con conferma (§50.11, come Prodotti): il conteggio
    // delle regole rimaste senza contenuti, che il servizio mette in bozza, si
    // dice a parte dopo l'esito.
    const disabledRulesRef = useRef(0);
    const bulk = useBulkDelete({
        deleteOne: async id => {
            const result = await deleteFeaturedContent(id, tenantId!);
            disabledRulesRef.current += result.schedules_disabled;
        },
        onDone: async () => {
            const disabled = disabledRulesRef.current;
            disabledRulesRef.current = 0;
            if (disabled > 0) {
                showToast({
                    type: "info",
                    message: `${disabled} ${disabled === 1 ? "regola spostata" : "regole spostate"} in bozze.`
                });
            }
            await loadData();
        },
        nouns: { one: "contenuto", many: "contenuti", deletedOne: "eliminato", deletedMany: "eliminati" }
    });

    const requestDelete = (item: FeaturedContentWithProducts) => {
        if (!ensureActive()) return;
        setDeleteTarget(item);
    };

    const filteredContents = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return contents.filter(item =>
            item.title.toLowerCase().includes(q) ||
            item.internal_name.toLowerCase().includes(q)
        );
    }, [contents, searchQuery]);
    const allContentIds = useMemo(() => contents.map(c => c.id), [contents]);

    const columns: ColumnDefinition<FeaturedContentWithProducts>[] = [
        {
            id: "title",
            header: "Titolo",
            width: "2fr",
            cell: (_value, item) => (
                <div className={styles.titleCell}>
                    <Text variant="body-sm" weight={600}>
                        {item.internal_name}
                    </Text>
                    {item.title !== item.internal_name && (
                        <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                            {item.title}
                        </Text>
                    )}
                    <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                        {item.subtitle || "Nessun sottotitolo"}
                    </Text>
                </div>
            )
        },
        {
            id: "products",
            header: "Prodotti",
            width: "0.8fr",
            accessor: item => item.products_count || 0,
            cell: (value, item) =>
                item.pricing_mode === "none" ? (
                    <Text variant="body-sm" colorVariant="muted">
                        -
                    </Text>
                ) : (
                    <Text variant="body-sm">{(value as number) || 0}</Text>
                )
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_value, item) => (
                <TableRowActions
                    actions={[
                        { label: "Modifica", icon: Pencil, onClick: () => handleEdit(item) },
                        ...(canWrite ? [{
                            label: "Elimina",
                            icon: Trash2,
                            onClick: () => requestDelete(item),
                            variant: "destructive" as const,
                            separator: true
                        }] : [])
                    ]}
                />
            )
        }
    ];

    if (permissions != null && !canRead) {
        return <PageGate readPermission="featured.read">{() => null}</PageGate>;
    }

    return (
        <PageGate readPermission="featured.read">
            {() => (
        <>
            <div className={styles.wrapper} data-view-mode={viewMode}>
                <div className={styles.tableCard}>
                    {loading ? (
                        <div className={styles.loadingState}>
                            <Text colorVariant="muted">Caricamento in corso...</Text>
                        </div>
                    ) : filteredContents.length === 0 ? (
                        <EmptyState
                            icon={<Pin size={40} strokeWidth={1.5} />}
                            title={
                                searchQuery
                                    ? "Nessun risultato"
                                    : "Metti in risalto quello che vuoi far notare"
                            }
                            description={
                                searchQuery
                                    ? "Nessun contenuto corrisponde alla ricerca."
                                    : "Promozioni, piatti consigliati, eventi: compaiono sopra o sotto il menù, e puoi programmarli per periodi specifici."
                            }
                            action={
                                !searchQuery && canWrite ? (
                                    <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                                        Crea il primo contenuto
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : viewMode === "list" ? (
                        <DataTable<FeaturedContentWithProducts>
                            data={filteredContents}
                            allRowIds={allContentIds}
                            columns={columns}
                            selectable={canWrite && canEdit}
                            selectedRowIds={bulk.selectedIds}
                            onSelectedRowsChange={bulk.setSelectedIds}
                            onBulkDelete={canWrite && canEdit ? bulk.request : undefined}
                            onRowClick={item => navigate(`/business/${tenantId}/featured/${item.id}`)}
                        />
                    ) : (
                        <div className={styles.contentGrid}>
                            {filteredContents.map(item => (
                                <FeaturedContentCard
                                    key={item.id}
                                    item={item}
                                    onEdit={() => handleEdit(item)}
                                    onDelete={canWrite ? () => requestDelete(item) : undefined}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <FeaturedContentDrawer
                open={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onSuccess={() => {
                    setIsCreateOpen(false);
                    loadData();
                }}
            />

            <ConfirmDialog
                {...bulk.dialog}
                message="Le regole che li mostrano restano; quelle che restano senza contenuti passano in bozza. Non si torna indietro."
            />

            <FeaturedContentDeleteDrawer
                open={Boolean(deleteTarget) && Boolean(tenantId)}
                onClose={() => setDeleteTarget(null)}
                featured={deleteTarget}
                tenantId={tenantId ?? ""}
                onSuccess={loadData}
            />
        </>
            )}
        </PageGate>
    );
}
