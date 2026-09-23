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
import { CardGrid, CardGridItem } from "@/components/ui/CardGrid/CardGrid";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { CatalogDeleteDialog } from "./CatalogDeleteDialog";
import { CatalogForm } from "./components/CatalogForm";
import { isPostgrestFKError } from "@/utils/supabaseErrors";
import styles from "./Catalogs.module.scss";

const FORM_ID = "catalog-form";
const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function Catalogs() {
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const verticalConfig = useVerticalConfig();
    const { canEdit } = useSubscriptionGuard();
    const { permissions } = usePermissions();
    const canWriteCatalog = permissions != null ? canDoOnTenant(permissions, "catalogs.write") : false;
    const catalogLower = verticalConfig.catalogLabel.toLowerCase();
    const catalogPluralLower = verticalConfig.catalogLabelPlural.toLowerCase();
    const categoryLower = verticalConfig.categoryLabel.toLowerCase();
    const categoryPluralLower = verticalConfig.categoryLabelPlural.toLowerCase();
    const productLower = verticalConfig.productLabel.toLowerCase();
    const productPluralLower = verticalConfig.productLabelPlural.toLowerCase();

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

    // Eliminazione multipla (#235): la selezione è controllata perché la
    // `DataTable` la svuota quando chiede di eliminare; se l'utente annulla
    // la conferma, la selezione torna com'era.
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [pendingBulkIds, setPendingBulkIds] = useState<string[] | null>(null);

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
            showToast({ message: `Impossibile caricare i ${catalogPluralLower}.`, type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, catalogPluralLower, showToast]);

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
        subtitle: `Le ${categoryPluralLower} e i ${productPluralLower} di ogni ${catalogLower}: quello che i clienti vedono.`,
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

    const countLabel = (n: number) => `${n} ${n === 1 ? catalogLower : catalogPluralLower}`;

    const handleBulkDeleteConfirmed = async (): Promise<false> => {
        const ids = pendingBulkIds ?? [];
        if (!currentTenantId || ids.length === 0) return false;

        const results = await Promise.allSettled(ids.map(id => deleteCatalog(id, currentTenantId)));
        const ok = results.filter(r => r.status === "fulfilled").length;
        const blocked = results.filter(
            (r): r is PromiseRejectedResult =>
                r.status === "rejected" && isPostgrestFKError(r.reason)
        ).length;
        const otherErrors = results.length - ok - blocked;

        if (ok > 0) {
            showToast({ message: `${countLabel(ok)} ${ok === 1 ? "eliminato" : "eliminati"}.`, type: "success" });
        }
        if (blocked > 0) {
            showToast({
                message: `${countLabel(blocked)} non ${blocked === 1 ? "eliminato" : "eliminati"}: in uso da regole di programmazione.`,
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
                message: `${countLabel(otherErrors)} non ${otherErrors === 1 ? "eliminato" : "eliminati"} per errore.`,
                type: "error"
            });
        }

        // La conferma si chiude perché non c'è più niente da confermare,
        // non da `onClose`: quello ripristina la selezione (annulla).
        setPendingBulkIds(null);
        await loadData();
        return false;
    };

    const handleBulkDeleteCancel = () => {
        if (pendingBulkIds) setSelectedIds(pendingBulkIds);
        setPendingBulkIds(null);
    };

    const filteredCatalogs = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        if (!normalizedSearch) return catalogs;

        return catalogs.filter(catalog => catalog.name.toLowerCase().includes(normalizedSearch));
    }, [catalogs, searchQuery]);
    const allCatalogIds = useMemo(() => catalogs.map(c => c.id), [catalogs]);

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
    };

    /** «7 portate · 22 prodotti»: gli stessi numeri nella card e nella lista. */
    const categoriesText = (catalogId: string) => {
        const stats = statsMap[catalogId];
        if (statsLoading || !stats) return "—";
        const n = stats.categoryCount;
        return `${n} ${n === 1 ? categoryLower : categoryPluralLower}`;
    };
    const productsText = (catalogId: string) => {
        const stats = statsMap[catalogId];
        if (statsLoading || !stats) return "—";
        const n = stats.productCount;
        return `${n} ${n === 1 ? productLower : productPluralLower}`;
    };

    const rowActions = (catalog: V2Catalog) => (
        <TableRowActions
            ariaLabel={`Azioni ${catalog.name}`}
            actions={[
                {
                    label: `Aggiungi ${productPluralLower} con AI`,
                    icon: Sparkles,
                    variant: "accent",
                    onClick: () => handleAddWithAi(catalog)
                },
                {
                    label: "Rinomina",
                    onClick: () => handleOpenEdit(catalog),
                    separator: true
                },
                {
                    label: `Elimina ${catalogLower}`,
                    onClick: () => handleOpenDelete(catalog),
                    variant: "destructive",
                    separator: true
                }
            ]}
        />
    );

    const columns: ColumnDefinition<V2Catalog>[] = [
        {
            id: "name",
            header: "Nome",
            width: "2fr",
            accessor: catalog => catalog.name,
            cell: (_value, catalog) => (
                <Text variant="body-sm" weight={600}>
                    {catalog.name}
                </Text>
            )
        },
        {
            id: "categories",
            header: verticalConfig.categoryLabelPlural,
            width: "1fr",
            hideOnPhone: true,
            accessor: catalog => statsMap[catalog.id]?.categoryCount ?? 0,
            cell: (_value, catalog) => (
                <Text variant="body-sm" colorVariant="muted">
                    {categoriesText(catalog.id)}
                </Text>
            )
        },
        {
            id: "products",
            header: verticalConfig.productLabelPlural,
            width: "1fr",
            hideOnPhone: true,
            accessor: catalog => statsMap[catalog.id]?.productCount ?? 0,
            cell: (_value, catalog) => (
                <Text variant="body-sm" colorVariant="muted">
                    {productsText(catalog.id)}
                </Text>
            )
        },
        {
            id: "createdAt",
            header: "Creato il",
            width: "1fr",
            accessor: catalog => catalog.created_at,
            cell: (_value, catalog) => (
                <Text variant="body-sm" colorVariant="muted">
                    {formatDate(catalog.created_at)}
                </Text>
            )
        },
        ...(canWriteCatalog
            ? [
                  {
                      id: "actions",
                      header: "",
                      width: "56px",
                      align: "right" as const,
                      cell: (_value: unknown, catalog: V2Catalog) => rowActions(catalog)
                  }
              ]
            : [])
    ];

    const hasSearchFilter = searchQuery.trim().length > 0;
    const hints = verticalConfig.scheduleHints.slice(0, 3).map(h => h.toLowerCase()).join(", ");

    const renderContent = () => {
        if (!isLoading && catalogs.length === 0) {
            return canWriteCatalog ? (
                <EmptyState
                    icon={<IconBook2 />}
                    title={`Il ${catalogLower} è quello che i clienti vedono col QR`}
                    description={`Puoi crearne più di uno (${hints}) e decidere con la programmazione quando mostrarli.`}
                    action={
                        <Button variant="primary" onClick={handleOpenCreate} disabled={!canEdit}>
                            {`Crea il primo ${catalogLower}`}
                        </Button>
                    }
                />
            ) : (
                <EmptyState
                    variant="inline"
                    icon={<IconBook2 />}
                    title={`Nessun ${catalogLower}`}
                    description={`Qui compaiono i ${catalogPluralLower} dell'azienda, quando qualcuno li crea.`}
                />
            );
        }

        if (viewMode === "list") {
            return (
                <DataTable<V2Catalog>
                    data={filteredCatalogs}
                    allRowIds={allCatalogIds}
                    columns={columns}
                    isLoading={isLoading}
                    isFiltered={hasSearchFilter}
                    onClearFilters={() => setSearchQuery("")}
                    selectable={canWriteCatalog}
                    selectedRowIds={selectedIds}
                    onSelectedRowsChange={setSelectedIds}
                    onBulkDelete={canWriteCatalog ? ids => setPendingBulkIds(ids) : undefined}
                    onRowClick={catalog =>
                        navigate(`/business/${currentTenantId}/catalogs/${catalog.id}`)
                    }
                />
            );
        }

        if (!isLoading && filteredCatalogs.length === 0) {
            return <EmptyState variant="filtered" title="Nessun risultato" onClearFilters={() => setSearchQuery("")} />;
        }

        return (
            <CardGrid loading={isLoading} skeletonCount={3} aria-label={verticalConfig.catalogLabelPlural}>
                {filteredCatalogs.map(catalog => (
                    <CardGridItem
                        key={catalog.id}
                        to={`/business/${currentTenantId}/catalogs/${catalog.id}`}
                        title={catalog.name}
                        subtitle={`${categoriesText(catalog.id)} · ${productsText(catalog.id)}`}
                        footer={
                            <Text variant="caption" colorVariant="muted">
                                Creato il {formatDate(catalog.created_at)}
                            </Text>
                        }
                        actions={canWriteCatalog ? rowActions(catalog) : undefined}
                    />
                ))}
            </CardGrid>
        );
    };

    return (
        <PageGate readPermission="catalogs.read">
        {() => (
        <section className={styles.container}>
            <div className={styles.content} data-view-mode={viewMode}>
                {renderContent()}
            </div>

            <SystemDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} size="sm">
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>
                            {editingCatalog ? `Rinomina ${catalogLower}` : `Nuovo ${catalogLower}`}
                        </Text>
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
                                {editingCatalog ? "Salva" : "Crea"}
                            </Button>
                        </>
                    }
                >
                    <CatalogForm
                        formId={FORM_ID}
                        mode={editingCatalog ? "edit" : "create"}
                        entityData={editingCatalog}
                        tenantId={currentTenantId ?? ""}
                        catalogLabel={verticalConfig.catalogLabel}
                        placeholder={`Es. ${verticalConfig.scheduleHints.slice(0, 3).join(", ")}`}
                        onSuccess={handleFormSuccess}
                        onSavingChange={setIsSaving}
                    />
                </DrawerLayout>
            </SystemDrawer>

            <ConfirmDialog
                isOpen={pendingBulkIds !== null}
                onClose={handleBulkDeleteCancel}
                onConfirm={handleBulkDeleteConfirmed}
                title={`Eliminare ${countLabel(pendingBulkIds?.length ?? 0)}?`}
                message={`Si eliminano anche le loro ${categoryPluralLower} e i collegamenti ai ${productPluralLower}, e non si torna indietro. I ${productPluralLower} restano. Un ${catalogLower} usato da una regola di programmazione non si elimina.`}
                confirmLabel={`Elimina ${countLabel(pendingBulkIds?.length ?? 0)}`}
            />

            <CatalogDeleteDialog
                isOpen={isDeleteOpen}
                onClose={handleDeleteClose}
                catalog={catalogToDelete}
                tenantId={currentTenantId ?? ""}
                onSuccess={loadData}
            />
        </section>
        )}
        </PageGate>
    );
}
