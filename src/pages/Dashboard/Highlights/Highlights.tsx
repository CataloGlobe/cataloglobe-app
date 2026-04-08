import React, { useCallback, useMemo, useState, useEffect } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Pencil, Trash2, Layers } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import {
    listFeaturedContents,
    getFeaturedContentById,
    deleteFeaturedContent,
    FeaturedContentWithProducts
} from "@/services/supabase/featuredContents";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import FeaturedContentDrawer from "./FeaturedContentDrawer";
import styles from "./Highlights.module.scss";
import { useDrawer } from "@/context/Drawer/useDrawer";

import { useNavigate, Link } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";

export default function Highlights() {
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const [loading, setLoading] = useState(true);
    const [contents, setContents] = useState<FeaturedContentWithProducts[]>([]);
    const { openDrawer, closeDrawer } = useDrawer();
    const navigate = useNavigate();

    // Filters and Toolbar
    const [searchQuery, setSearchQuery] = useState("");
    const [densityView, setDensityView] = useState<"list" | "grid">("grid"); // list = compact, grid = extended mapping

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<FeaturedContentWithProducts | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

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
        openDrawer({
            title: "Crea contenuto",
            size: "md",
            content: (
                <FeaturedContentDrawer
                    onClose={closeDrawer}
                    onSuccess={() => {
                        closeDrawer();
                        loadData();
                    }}
                />
            ),
            footer: (
                <>
                    <Button variant="secondary" onClick={closeDrawer}>
                        Annulla
                    </Button>
                    <Button variant="primary" type="submit" form="featured-content-form">
                        Crea
                    </Button>
                </>
            )
        });
    };

    const handleEdit = (item: FeaturedContentWithProducts) => {
        navigate(`/business/${tenantId}/featured/${item.id}`);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;

        try {
            setIsDeleting(true);
            await deleteFeaturedContent(deleteTarget.id, tenantId!);
            setContents(prev => prev.filter(c => c.id !== deleteTarget.id));
            showToast({
                type: "success",
                message: "Contenuto eliminato con successo",
                duration: 2500
            });
        } catch (error) {
            console.error(error);
            showToast({
                type: "error",
                message: "Errore durante l'eliminazione del contenuto",
                duration: 3000
            });
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    const handleBulkDelete = async (selectedIds: string[]) => {
        if (selectedIds.length === 0) return;
        try {
            await Promise.all(selectedIds.map(id => deleteFeaturedContent(id, tenantId!)));
            setContents(prev => prev.filter(c => !selectedIds.includes(c.id)));
            showToast({
                type: "success",
                message: `${selectedIds.length} contenuti eliminati con successo`,
                duration: 2500
            });
        } catch (error) {
            console.error(error);
            showToast({
                type: "error",
                message: "Errore durante l'eliminazione di alcuni contenuti",
                duration: 3000
            });
        }
    };

    const filteredContents = useMemo(() => {
        return contents.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase())
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
                        {item.title}
                    </Text>
                    {item.subtitle ? (
                        <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                            {item.subtitle}
                        </Text>
                    ) : (
                        <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                            Nessun sottotitolo
                        </Text>
                    )}
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
                        <Button variant="primary" onClick={handleCreate}>
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
                        value: densityView,
                        onChange: setDensityView
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
                                    <Button variant="primary" onClick={handleCreate}>
                                        + Crea il primo contenuto
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <DataTable<FeaturedContentWithProducts>
                            data={filteredContents}
                            columns={columns}
                            density={densityView === "list" ? "compact" : "extended"}
                            selectable
                            onBulkDelete={handleBulkDelete}
                            onRowClick={item => navigate(`/business/${tenantId}/featured/${item.id}`)}
                        />
                    )}
                </div>
            </div>

            <SystemDrawer
                open={Boolean(deleteTarget)}
                onClose={() => !isDeleting && setDeleteTarget(null)}
                width={400}
            >
                <DrawerLayout
                    header={
                        <Text as="h2" variant="title-sm" weight={700}>
                            Elimina contenuto
                        </Text>
                    }
                    footer={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                            >
                                Annulla
                            </Button>
                            <Button variant="primary" onClick={handleDelete} loading={isDeleting}>
                                Elimina
                            </Button>
                        </>
                    }
                >
                    <Text variant="body">
                        Sei sicuro di voler eliminare <b>{deleteTarget?.title}</b>?
                        Questa azione non può essere annullata.
                    </Text>
                </DrawerLayout>
            </SystemDrawer>
        </>
    );
}
