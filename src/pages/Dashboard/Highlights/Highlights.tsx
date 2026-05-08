import { useCallback, useMemo, useState, useEffect } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Pencil, Trash2, Layers } from "lucide-react";
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

export default function Highlights() {
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const { canEdit } = useSubscriptionGuard();
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

    const handleViewChange = (v: "list" | "grid") => {
        setViewMode(v);
        localStorage.setItem("featuredContents_viewMode", v);
    };

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

    const handleCreate = () => {
        if (!canEdit) {
            showToast({
                message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.",
                type: "error"
            });
            return;
        }
        setIsCreateOpen(true);
    };

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
            header: "Azioni",
            width: "96px",
            align: "right",
            cell: (_value, item) => (
                <TableRowActions
                    actions={[
                        { label: "Modifica", icon: Pencil, onClick: () => handleEdit(item) },
                        {
                            label: "Elimina",
                            icon: Trash2,
                            onClick: () => setDeleteTarget(item),
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
            <div className={styles.wrapper}>
                <PageHeader
                    title="Contenuti in evidenza"
                    businessName={selectedTenant?.name}
                    subtitle="Gestisci i contenuti editoriali e aggregatori di prodotti."
                    actions={
                        <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                            Crea contenuto
                        </Button>
                    }
                />

                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: "Cerca per titolo..."
                    }}
                    view={{
                        value: viewMode,
                        onChange: handleViewChange
                    }}
                />

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
                                !searchQuery ? (
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
                            density="compact"
                            selectable
                            onBulkDelete={handleBulkDelete}
                            onRowClick={item => navigate(`/business/${tenantId}/featured/${item.id}`)}
                        />
                    ) : (
                        <div className={styles.contentGrid}>
                            {filteredContents.map(item => (
                                <FeaturedContentCard
                                    key={item.id}
                                    item={item}
                                    onEdit={() => handleEdit(item)}
                                    onDelete={() => setDeleteTarget(item)}
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
    );
}
