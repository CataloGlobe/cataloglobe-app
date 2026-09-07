import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnTenant } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconBook2 } from "@tabler/icons-react";
import { Sparkles, Eye, LayoutGrid, List as ListIcon } from "lucide-react";
import { Loader } from "@/components/ui/Loader/Loader";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import {
    listCatalogs,
    deleteCatalog,
    getCatalogStatsMap,
    type V2Catalog,
    type CatalogStats
} from "@/services/supabase/catalogs";
import { CatalogCard } from "@/components/Catalogs/CatalogCard/CatalogCard";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { CatalogDeleteDrawer } from "./CatalogDeleteDrawer";
import { CatalogForm } from "./components/CatalogForm";
import { isPostgrestFKError } from "@/utils/supabaseErrors";
import styles from "./Catalogs.module.scss";

const FORM_ID = "catalog-form";

export default function Catalogs() {
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const verticalConfig = useVerticalConfig();
    const { canEdit } = useSubscriptionGuard();
    const { permissions } = usePermissions();
    const canWriteCatalog = permissions != null ? canDoOnTenant(permissions, "catalogs.write") : false;
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
    const [isSaving, setIsSaving] = useState(false);

    // AI Import: sessione sollevata in MainLayout. La pagina apre il drawer via
    // context e ricarica quando l'import completa (importRefreshKey bumpato).
    const outletCtx = useBusinessOutletContext();
    const openAiImport = outletCtx?.openAiImport;
    const importRefreshKey = outletCtx?.importRefreshKey ?? 0;
    const importStatus = outletCtx?.importStatus ?? "idle";

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

    // Ricarica al completamento di un import AI. Skip al mount (prev === current):
    // evita il doppio-load con l'effetto loadData sopra.
    const prevImportKeyRef = useRef(importRefreshKey);
    useEffect(() => {
        if (prevImportKeyRef.current !== importRefreshKey) {
            prevImportKeyRef.current = importRefreshKey;
            loadData();
        }
    }, [importRefreshKey, loadData]);

    const handleOpenCreate = useCallback(() => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setEditingCatalog(null);
        setIsDrawerOpen(true);
    }, [canEdit, showToast]);

    const handleViewModeChange = useCallback((next: "list" | "grid") => {
        setViewMode(next);
        localStorage.setItem("cataloglobe_catalogs_view_mode", next);
    }, []);

    const handleOpenAiImport = useCallback(() => {
        if (!canEdit) {
            showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" });
            return;
        }
        openAiImport?.();
    }, [canEdit, showToast, openAiImport]);

    const aiImportIsBusy = importStatus !== "idle";

    const aiImportLabel =
        importStatus === "analyzing"
            ? "Analisi in corso…"
            : importStatus === "creating"
                ? "Salvataggio…"
                : importStatus === "review"
                    ? "Rivedi menù analizzato"
                    : "Importa con AI";

    const headerActions = useMemo(() => (
        <>
            <ToolbarSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={`Cerca ${catalogLower}...`}
            />
            <SegmentedControl<"list" | "grid">
                iconsOnly
                value={viewMode}
                onChange={handleViewModeChange}
                options={[
                    { value: "grid", icon: <LayoutGrid size={16} />, label: "Vista griglia" },
                    { value: "list", icon: <ListIcon size={16} />, label: "Vista lista" }
                ]}
            />
            {canWriteCatalog && (
                <Button
                    variant="outline"
                    onClick={handleOpenAiImport}
                    disabled={!canEdit}
                    leftIcon={
                        importStatus === "analyzing" || importStatus === "creating"
                            ? <Loader size="sm" className={styles.importSpinner} />
                            : importStatus === "review"
                                ? <Eye size={16} />
                                : <Sparkles size={16} />
                    }
                    className={styles.toolbarCta}
                >
                    {aiImportLabel}
                </Button>
            )}
            {canWriteCatalog && (
                <Button
                    variant="primary"
                    onClick={handleOpenCreate}
                    disabled={!canEdit}
                    className={styles.toolbarCta}
                >
                    {`Crea ${catalogLower}`}
                </Button>
            )}
        </>
    ), [canWriteCatalog, canEdit, handleOpenCreate, catalogLower, searchQuery, viewMode, handleViewModeChange, handleOpenAiImport, importStatus, aiImportLabel]);

    // Import AI: stessa azione, due collocazioni a seconda dello stato.
    //
    // A riposo è una secondaria come le altre e sta nel kebab. Mentre lavora
    // NON può nascondersi lì: un'operazione in corso che l'utente non vede è
    // un'operazione che l'utente rilancia. Finché non torna `idle` viene quindi
    // promossa fra le icone sempre visibili, con l'icona che ne dice lo stato
    // (spinner mentre analizza o salva, occhio quando il risultato è pronto da
    // rivedere). Regola generale del rollout, non un'eccezione di questa pagina.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => {
        const viewToggle = viewMode === "list"
            ? { icon: <LayoutGrid size={18} />, label: "Vista griglia", onClick: () => handleViewModeChange("grid") }
            : { icon: <ListIcon size={18} />, label: "Vista lista", onClick: () => handleViewModeChange("list") };

        const aiIcon = importStatus === "review"
            ? <Eye size={18} />
            : <Loader size="sm" className={styles.importSpinner} />;

        return {
            search: {
                value: searchQuery,
                onChange: setSearchQuery,
                placeholder: `Cerca ${catalogLower}...`
            },
            persistentIcons: canWriteCatalog && aiImportIsBusy
                ? [{ icon: aiIcon, label: aiImportLabel, onClick: handleOpenAiImport }, viewToggle]
                : [viewToggle],
            secondaryActions: canWriteCatalog && !aiImportIsBusy
                ? [{ label: aiImportLabel, onClick: handleOpenAiImport, disabled: !canEdit }]
                : undefined,
            primaryAction: canWriteCatalog
                ? { label: `Crea ${catalogLower}`, onClick: handleOpenCreate, disabled: !canEdit }
                : undefined
        };
    }, [
        searchQuery,
        catalogLower,
        viewMode,
        handleViewModeChange,
        canWriteCatalog,
        canEdit,
        importStatus,
        aiImportIsBusy,
        aiImportLabel,
        handleOpenAiImport,
        handleOpenCreate
    ]);

    usePageHeader({
        title: verticalConfig.catalogLabel,
        subtitle: `Gestisci l'albero delle categorie e i gruppi del tuo ${catalogLower}.`,
        actions: headerActions,
        compact: headerCompact,
    });

    const handleOpenEdit = (catalog: V2Catalog) => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setEditingCatalog(catalog);
        setIsDrawerOpen(true);
    };

    // Scorciatoia: apre il wizard AI import puntato su questo catalogo (2C-5).
    const handleAddWithAi = (catalog: V2Catalog) => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        openAiImport?.({ catalogId: catalog.id, catalogName: catalog.name });
    };

    const handleOpenDelete = (catalog: V2Catalog) => {
        setCatalogToDelete(catalog);
        setIsDeleteOpen(true);
    };

    const handleFormSuccess = () => {
        setIsDrawerOpen(false);
        loadData();
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
    const allCatalogIds = useMemo(() => catalogs.map(c => c.id), [catalogs]);

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
        ...(canWriteCatalog ? [{
            id: "actions",
            header: "",
            width: "56px",
            align: "right" as const,
            cell: (_value: unknown, catalog: V2Catalog) => (
                <TableRowActions
                    actions={[
                        {
                            label: "Aggiungi prodotti con AI",
                            icon: Sparkles,
                            variant: "accent" as const,
                            onClick: () => handleAddWithAi(catalog)
                        },
                        {
                            label: "Modifica nome",
                            onClick: () => handleOpenEdit(catalog),
                            separator: true
                        },
                        {
                            label: `Elimina ${catalogLower}`,
                            onClick: () => handleOpenDelete(catalog),
                            variant: "destructive" as const,
                            separator: true
                        }
                    ]}
                />
            )
        }] : [])
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
            title={
                hasSearchFilter
                    ? "Nessun risultato"
                    : `Il ${catalogLower} è quello che i clienti vedono col QR`
            }
            description={
                hasSearchFilter
                    ? `Nessun ${catalogLower} corrisponde alla ricerca.`
                    : "Puoi crearne più di uno — alla carta, colazioni, carta dei vini — e decidere con la programmazione quando mostrarli."
            }
            action={
                !hasSearchFilter && canWriteCatalog ? (
                    <Button variant="primary" onClick={handleOpenCreate} disabled={!canEdit}>
                        {`Crea il primo ${catalogLower}`}
                    </Button>
                ) : undefined
            }
        />
    );

    return (
        <PageGate readPermission="catalogs.read">
        {() => (
        <section className={styles.container}>
            <div className={styles.content} data-view-mode={viewMode}>
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
                                onAddWithAi={handleAddWithAi}
                                onClick={c =>
                                    navigate(`/business/${currentTenantId}/catalogs/${c.id}`)
                                }
                            />
                        ))}
                    </div>
                ) : (
                    <DataTable<V2Catalog>
                        data={filteredCatalogs}
                        allRowIds={allCatalogIds}
                        columns={columns}
                        selectable={canWriteCatalog}
                        onBulkDelete={canWriteCatalog ? handleBulkDelete : undefined}
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
                                form={FORM_ID}
                                loading={isSaving}
                            >
                                {editingCatalog ? "Salva Modifiche" : `Crea ${verticalConfig.catalogLabel}`}
                            </Button>
                        </>
                    }
                >
                    <CatalogForm
                        formId={FORM_ID}
                        mode={editingCatalog ? "edit" : "create"}
                        entityData={editingCatalog}
                        tenantId={currentTenantId ?? ""}
                        onSuccess={handleFormSuccess}
                        onSavingChange={setIsSaving}
                    />
                </DrawerLayout>
            </SystemDrawer>

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
        )}
        </PageGate>
    );
}
