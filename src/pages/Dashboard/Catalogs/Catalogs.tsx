import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageHeader } from "@/context/usePageHeader";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconBook2 } from "@tabler/icons-react";
import { Sparkles } from "lucide-react";
import { AiMenuImportDrawer } from "./AiMenuImport/AiMenuImportDrawer";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import {
    listCatalogs,
    createCatalog,
    updateCatalog,
    deleteCatalog,
    getCatalogStatsMap,
    type V2Catalog,
    type CatalogStats
} from "@/services/supabase/catalogs";
import { CatalogCard } from "@/components/Catalogs/CatalogCard/CatalogCard";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { CatalogDeleteDrawer } from "./CatalogDeleteDrawer";
import { isPostgrestFKError } from "@/utils/supabaseErrors";
import styles from "./Catalogs.module.scss";

export default function Catalogs() {
    const currentTenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const verticalConfig = useVerticalConfig();
    const { canEdit } = useSubscriptionGuard();
    const catalogLower = verticalConfig.catalogLabel.toLowerCase();

    const [catalogs, setCatalogs] = useState<V2Catalog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
        const stored = localStorage.getItem("cataloglobe_catalogs_view_mode");
        return stored === "list" ? "list" : "grid";
    });
    const [statsMap, setStatsMap] = useState<Record<string, CatalogStats>>({});
    const [statsLoading, setStatsLoading] = useState(false);

    // Drawer state
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingCatalog, setEditingCatalog] = useState<V2Catalog | null>(null);
    const [name, setName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // AI Import state
    const [isAiImportOpen, setIsAiImportOpen] = useState(false);

    // Delete confirmation state
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [catalogToDelete, setCatalogToDelete] = useState<V2Catalog | null>(null);

    const loadData = useCallback(async () => {
        if (!currentTenantId) return;
        setIsLoading(true);
        try {
            const data = await listCatalogs(currentTenantId);
            setCatalogs(data);

            if (data.length > 0) {
                setStatsLoading(true);
                getCatalogStatsMap(currentTenantId, data.map(c => c.id))
                    .then(map => setStatsMap(map))
                    .catch(() => {})
                    .finally(() => setStatsLoading(false));
            }
        } catch (error) {
            console.error("Errore caricamento cataloghi:", error);
            showToast({ message: "Impossibile caricare i cataloghi.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleOpenCreate = useCallback(() => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setEditingCatalog(null);
        setName("");
        setIsDrawerOpen(true);
    }, [canEdit, showToast]);

    const headerActions = useMemo(() => (
        <div style={{ display: "flex", gap: 8 }}>
            <Button
                variant="outline"
                onClick={() => {
                    if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
                    setIsAiImportOpen(true);
                }}
                disabled={!canEdit}
                leftIcon={<Sparkles size={16} />}
            >
                Importa con AI
            </Button>
            <Button variant="primary" onClick={handleOpenCreate} disabled={!canEdit}>
                {`Crea ${catalogLower}`}
            </Button>
        </div>
    ), [canEdit, showToast, handleOpenCreate, catalogLower]);

    usePageHeader({
        title: verticalConfig.catalogLabel,
        subtitle: `Gestisci l'albero delle categorie e i gruppi del tuo ${catalogLower}.`,
        actions: headerActions,
        sticky: true,
    });

    const handleOpenEdit = (catalog: V2Catalog) => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setEditingCatalog(catalog);
        setName(catalog.name);
        setIsDrawerOpen(true);
    };

    const handleOpenDelete = (catalog: V2Catalog) => {
        setCatalogToDelete(catalog);
        setIsDeleteOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentTenantId) return;
        if (!name.trim()) {
            showToast({ message: "Il nome è obbligatorio", type: "error" });
            return;
        }

        setIsSaving(true);
        try {
            if (editingCatalog) {
                await updateCatalog(editingCatalog.id, currentTenantId, { name });
                showToast({ message: "Catalogo aggiornato con successo.", type: "success" });
            } else {
                await createCatalog(currentTenantId, name);
                showToast({ message: "Catalogo creato con successo.", type: "success" });
            }
            setIsDrawerOpen(false);
            loadData();
        } catch (error) {
            console.error("Errore salvataggio catalogo:", error);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClose = () => {
        setIsDeleteOpen(false);
        setCatalogToDelete(null);
    };

    const handleBulkDelete = async (selectedIds: string[]) => {
        if (!currentTenantId || selectedIds.length === 0) return;

        const results = await Promise.allSettled(
            selectedIds.map(id => deleteCatalog(id, currentTenantId))
        );
        const ok = results.filter(r => r.status === "fulfilled").length;
        const blocked = results.filter(
            (r): r is PromiseRejectedResult =>
                r.status === "rejected" && isPostgrestFKError(r.reason)
        ).length;
        const otherErrors = results.length - ok - blocked;

        if (ok > 0) {
            showToast({ message: `${ok} cataloghi eliminati.`, type: "success" });
        }
        if (blocked > 0) {
            showToast({
                message: `${blocked} cataloghi non eliminati: in uso da regole di programmazione.`,
                type: "error"
            });
        }
        if (otherErrors > 0) {
            results.forEach(r => {
                if (r.status === "rejected" && !isPostgrestFKError(r.reason)) {
                    console.error("Errore eliminazione catalogo:", r.reason);
                }
            });
            showToast({
                message: `${otherErrors} cataloghi non eliminati per errore.`,
                type: "error"
            });
        }

        await loadData();
    };

    const filteredCatalogs = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        if (!normalizedSearch) return catalogs;

        return catalogs.filter(catalog => catalog.name.toLowerCase().includes(normalizedSearch));
    }, [catalogs, searchQuery]);

    const columns: ColumnDefinition<V2Catalog>[] = [
        {
            id: "name",
            header: "Nome",
            width: "2fr",
            accessor: catalog => catalog.name,
            cell: (_value, catalog) => (
                <div className={styles.colName}>
                    <div className={styles.catalogNameRow}>
                        <Text variant="body-sm" weight={600}>
                            {catalog.name}
                        </Text>
                    </div>
                </div>
            )
        },
        {
            id: "createdAt",
            header: "Creato il",
            width: "1fr",
            accessor: catalog => catalog.created_at,
            cell: value => {
                const dateValue = typeof value === "string" ? new Date(value) : null;
                const formattedDate =
                    dateValue && !Number.isNaN(dateValue.getTime())
                        ? new Intl.DateTimeFormat("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric"
                          }).format(dateValue)
                        : "—";

                return (
                    <Text variant="body-sm" colorVariant="muted">
                        {formattedDate}
                    </Text>
                );
            }
        },
        {
            id: "actions",
            header: "",
            width: "60px",
            align: "right",
            cell: (_value, catalog) => (
                <TableRowActions
                    actions={[
                        { label: "Modifica nome", onClick: () => handleOpenEdit(catalog) },
                        {
                            label: `Elimina ${catalogLower}`,
                            onClick: () => handleOpenDelete(catalog),
                            variant: "destructive",
                            separator: true
                        }
                    ]}
                />
            )
        }
    ];

    const loadingState = (
        <div className={styles.loadingState}>
            <Text variant="body-sm" colorVariant="muted">
                Caricamento in corso...
            </Text>
        </div>
    );

    const hasSearchFilter = searchQuery.trim().length > 0;

    const emptyState = (
        <EmptyState
            icon={<IconBook2 size={40} stroke={1.5} />}
            title={hasSearchFilter ? `Nessun ${catalogLower} trovato` : `Non hai ancora creato ${catalogLower}`}
            description={
                hasSearchFilter
                    ? `Nessun ${catalogLower} corrisponde alla ricerca.`
                    : `I ${catalogLower} organizzano i tuoi ${verticalConfig.productLabel.toLowerCase()}i e vengono mostrati ai clienti.`
            }
            action={
                !hasSearchFilter ? (
                    <Button variant="primary" onClick={handleOpenCreate} disabled={!canEdit}>
                        {`+ Crea il tuo primo ${catalogLower}`}
                    </Button>
                ) : undefined
            }
        />
    );

    return (
        <section className={styles.container}>
            <div className={styles.content}>
                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: `Cerca ${catalogLower}...`
                    }}
                    view={{
                        value: viewMode,
                        onChange: v => {
                            setViewMode(v);
                            localStorage.setItem("cataloglobe_catalogs_view_mode", v);
                        }
                    }}
                    className={styles.filterBar}
                />

                {isLoading ? (
                    loadingState
                ) : filteredCatalogs.length === 0 ? (
                    emptyState
                ) : viewMode === "grid" ? (
                    <div className={styles.catalogsGrid}>
                        {filteredCatalogs.map(catalog => (
                            <CatalogCard
                                key={catalog.id}
                                catalog={catalog}
                                stats={statsMap[catalog.id]}
                                statsLoading={statsLoading}
                                catalogLower={catalogLower}
                                onEdit={handleOpenEdit}
                                onDelete={handleOpenDelete}
                                onClick={c =>
                                    navigate(`/business/${currentTenantId}/catalogs/${c.id}`)
                                }
                            />
                        ))}
                    </div>
                ) : (
                    <DataTable<V2Catalog>
                        data={filteredCatalogs}
                        columns={columns}
                        density="compact"
                        selectable
                        onBulkDelete={handleBulkDelete}
                        onRowClick={catalog =>
                            navigate(`/business/${currentTenantId}/catalogs/${catalog.id}`)
                        }
                    />
                )}
            </div>

            {/* Create/Edit Drawer */}
            <SystemDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} width={400}>
                <DrawerLayout
                    header={
                        <div>
                            <Text variant="title-sm" weight={600}>
                                {editingCatalog ? `Modifica ${verticalConfig.catalogLabel}` : `Nuovo ${verticalConfig.catalogLabel}`}
                            </Text>
                        </div>
                    }
                    footer={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setIsDrawerOpen(false)}
                                disabled={isSaving}
                            >
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form="catalog-form"
                                loading={isSaving}
                            >
                                {editingCatalog ? "Salva Modifiche" : `Crea ${verticalConfig.catalogLabel}`}
                            </Button>
                        </>
                    }
                >
                    <form id="catalog-form" onSubmit={handleSave} className={styles.form}>
                        <TextInput
                            label="Nome del Catalogo"
                            required
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Es: Menu Cena, Asporto, Cantina dei Vini..."
                        />
                    </form>
                </DrawerLayout>
            </SystemDrawer>

            {/* AI Import Drawer */}
            <AiMenuImportDrawer
                open={isAiImportOpen}
                onClose={() => setIsAiImportOpen(false)}
                onSuccess={loadData}
            />

            {/* Delete Drawer */}
            <CatalogDeleteDrawer
                isOpen={isDeleteOpen}
                onClose={handleDeleteClose}
                catalog={catalogToDelete}
                tenantId={currentTenantId ?? ""}
                businessId={currentTenantId ?? ""}
                catalogLabel={verticalConfig.catalogLabel}
                onSuccess={loadData}
            />
        </section>
    );
}
