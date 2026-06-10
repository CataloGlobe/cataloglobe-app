import { useCallback, useMemo, useState, useEffect } from "react";
import { usePageHeader } from "@/context/usePageHeader";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Pencil, Trash2, Layers, LayoutGrid, List as ListIcon } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import {
    listFeaturedContents,
    deleteFeaturedContent,
    FeaturedContentWithProducts,
    type DeleteFeaturedContentResult
} from "@/services/supabase/featuredContents";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import FeaturedContentDrawer from "./FeaturedContentDrawer";
import FeaturedContentDeleteDrawer from "./FeaturedContentDeleteDrawer";
import FeaturedContentCard from "./components/FeaturedContentCard";
import styles from "./Highlights.module.scss";

import { useNavigate } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";

export default function Highlights() {
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const { canEdit } = useSubscriptionGuard();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "featured.write") : false;
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
        if (!tenantId) return;
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
    }, [tenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreate = useCallback(() => {
        if (!canEdit) {
            showToast({
                message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.",
                type: "error"
            });
            return;
        }
        setIsCreateOpen(true);
    }, [canEdit, showToast]);

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

    usePageHeader({
        title: "Contenuti in evidenza",
        subtitle: "Gestisci i contenuti editoriali e aggregatori di prodotti.",
        actions: headerActions,
        sticky: true,
    });

    const handleEdit = (item: FeaturedContentWithProducts) => {
        navigate(`/business/${tenantId}/featured/${item.id}`);
    };

    const handleBulkDelete = async (selectedIds: string[]) => {
        if (!tenantId) return;
        if (selectedIds.length === 0) return;

        const results = await Promise.allSettled(
            selectedIds.map(id => deleteFeaturedContent(id, tenantId))
        );

        const fulfilledIndexes: number[] = [];
        const rejected: PromiseRejectedResult[] = [];
        let totalDisabled = 0;

        results.forEach((r, idx) => {
            if (r.status === "fulfilled") {
                fulfilledIndexes.push(idx);
                const value = r.value as DeleteFeaturedContentResult;
                totalDisabled += value.schedules_disabled;
            } else {
                rejected.push(r);
            }
        });

        const okIds = fulfilledIndexes.map(i => selectedIds[i]);
        if (okIds.length > 0) {
            setContents(prev => prev.filter(c => !okIds.includes(c.id)));
            const ok = okIds.length;
            const parts = [
                `${ok} ${ok === 1 ? "contenuto eliminato" : "contenuti eliminati"}.`
            ];
            if (totalDisabled > 0) {
                parts.push(
                    `${totalDisabled} ${totalDisabled === 1 ? "regola spostata" : "regole spostate"} in bozze.`
                );
            }
            showToast({ type: "success", message: parts.join(" "), duration: 3000 });
        }

        if (rejected.length > 0) {
            const failed = rejected.length;
            rejected.forEach(r =>
                console.error("[Highlights] bulk delete featured failed:", r.reason)
            );
            showToast({
                type: "error",
                message: `${failed} ${failed === 1 ? "contenuto non eliminato" : "contenuti non eliminati"} per errore.`,
                duration: 3500
            });
        }

        await loadData();
    };

    const filteredContents = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return contents.filter(item =>
            item.title.toLowerCase().includes(q) ||
            item.internal_name.toLowerCase().includes(q)
        );
    }, [contents, searchQuery]);

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
                            onClick: () => setDeleteTarget(item),
                            variant: "destructive" as const,
                            separator: true
                        }] : [])
                    ]}
                />
            )
        }
    ];

    return (
        <PageGate readPermission="featured.read">
            {() => (
        <>
            <div className={styles.wrapper}>
                <div className={styles.tableCard}>
                    {loading ? (
                        <div className={styles.loadingState}>
                            <Text colorVariant="muted">Caricamento in corso...</Text>
                        </div>
                    ) : filteredContents.length === 0 ? (
                        <EmptyState
                            icon={<Layers size={40} strokeWidth={1.5} />}
                            title={
                                searchQuery
                                    ? "Nessun contenuto trovato"
                                    : "Non hai ancora creato contenuti in evidenza"
                            }
                            description={
                                searchQuery
                                    ? "Nessun contenuto corrisponde alla ricerca."
                                    : "I contenuti in evidenza compaiono nella homepage del tuo catalogo."
                            }
                            action={
                                !searchQuery && canWrite ? (
                                    <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                                        + Crea il primo contenuto
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : viewMode === "list" ? (
                        <DataTable<FeaturedContentWithProducts>
                            data={filteredContents}
                            columns={columns}
                            selectable={canWrite}
                            onBulkDelete={canWrite ? handleBulkDelete : undefined}
                            onRowClick={item => navigate(`/business/${tenantId}/featured/${item.id}`)}
                        />
                    ) : (
                        <div className={styles.contentGrid}>
                            {filteredContents.map(item => (
                                <FeaturedContentCard
                                    key={item.id}
                                    item={item}
                                    onEdit={() => handleEdit(item)}
                                    onDelete={canWrite ? () => setDeleteTarget(item) : undefined}
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
