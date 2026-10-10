import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnTenant } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { AiSparkles } from "@/components/ui/Button/AiSparkles";
import { IconBook2 } from "@tabler/icons-react";
import { Sparkles, Eye, LayoutGrid, List as ListIcon, TextCursorInput } from "lucide-react";
import { Loader } from "@/components/ui/Loader/Loader";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import {
    listCatalogs,
    deleteCatalog,
    duplicateCatalog,
    getCatalogStatsMap,
    type V2Catalog,
    type CatalogStats
} from "@/services/supabase/catalogs";
import { CardGrid, CardGridItem } from "@/components/ui/CardGrid/CardGrid";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { listStyleSwatches, type V2Style } from "@/services/supabase/styles";
import { useRuleAppearance } from "@/hooks/useRuleAppearance";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { appearanceOf, catalogStyleIds, describeCatalogSummary, type SummaryTone } from "@/utils/ruleAppearance";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { CatalogDeleteDialog } from "./CatalogDeleteDialog";
import { CatalogForm } from "./components/CatalogForm";
import { CatalogSheet } from "./components/CatalogSheet";
import { isPostgrestFKError } from "@/utils/supabaseErrors";
import styles from "./Catalogs.module.scss";
import { useCreateOnArrival } from "@/hooks/useCreateOnArrival";

const FORM_ID = "catalog-form";

/** Dove è attivo un menù (§23.2, §50.13): la riga e il suo stile. */
type CatalogUsage = { label: string; tone: SummaryTone; style: V2Style | null; moreStyles: number; liveNow: boolean };

/** L'altezza della card dei Menù (M2): foglio disegnato, nome, numeri, stato. */
const CARD_HEIGHT = 236;

export default function Catalogs() {
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const verticalConfig = useVerticalConfig();
    const { canEdit, ensureActive } = useEnsureActive();
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
    const [styleById, setStyleById] = useState<Map<string, V2Style>>(new Map());
    // Chi lo sta guardando adesso: dalle regole, con la stessa competizione di Programmazione.
    const appearance = useRuleAppearance(currentTenantId);
    // Sotto 768 la tabella tiene una colonna: lo stato scende sotto il nome.
    const isPhone = useMediaQuery("(max-width: 767px)");

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
                // Lo swatch sulla card: senza, la card resta senza campione.
                listStyleSwatches(currentTenantId)
                    .then(list => setStyleById(new Map(list.map(style => [style.id, style]))))
                    .catch(() => {});
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
        if (!ensureActive()) return;
        setEditingCatalog(null);
        setIsDrawerOpen(true);
    }, [ensureActive]);
    // Da «Cosa vuoi creare?» della Panoramica.
    useCreateOnArrival(handleOpenCreate, permissions != null ? canWriteCatalog : null);

    const handleViewModeChange = useCallback((next: "list" | "grid") => {
        setViewMode(next);
        localStorage.setItem("cataloglobe_catalogs_view_mode", next);
    }, []);

    const handleOpenAiImport = useCallback(() => {
        if (!ensureActive()) return;
        openAiImport?.();
    }, [ensureActive, openAiImport]);

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
                    variant="secondary"
                    onClick={handleOpenAiImport}
                    disabled={!canEdit}
                    leftIcon={
                        importStatus === "analyzing" || importStatus === "creating"
                            ? <Loader size="sm" className={styles.importSpinner} />
                            : importStatus === "review"
                                ? <Eye size={16} />
                                : <AiSparkles size={16} />
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
        actions: headerActions,
        compact: headerCompact,
    });

    const handleOpenEdit = (catalog: V2Catalog) => {
        if (!ensureActive()) return;
        setEditingCatalog(catalog);
        setIsDrawerOpen(true);
    };

    // Scorciatoia: apre il wizard AI import puntato su questo catalogo (2C-5).
    const handleAddWithAi = (catalog: V2Catalog) => {
        if (!ensureActive()) return;
        openAiImport?.({ catalogId: catalog.id, catalogName: catalog.name });
    };

    // La copia nasce senza sedi: si collega da Programmazione.
    // Una copia alla volta: ci vuole qualche secondo, e un secondo clic ne farebbe due.
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
    const handleDuplicate = async (catalog: V2Catalog) => {
        if (!ensureActive()) return;
        if (duplicatingId) return;
        setDuplicatingId(catalog.id);
        showToast({ message: `Sto duplicando «${catalog.name}»…`, type: "info" });
        try {
            await duplicateCatalog(catalog.id, currentTenantId!, `${catalog.name} (Copia)`);
            showToast({ message: `${verticalConfig.catalogLabel} duplicato.`, type: "success" });
            await loadData();
        } catch {
            showToast({ message: `Impossibile duplicare il ${catalogLower}.`, type: "error" });
        } finally {
            setDuplicatingId(null);
        }
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

    const usageById = useMemo(() => {
        const map = new Map<string, CatalogUsage>();
        if (!appearance.index) return map;
        for (const catalog of catalogs) {
            const a = appearanceOf(appearance.index, { kind: "catalog", id: catalog.id });
            const styleIds = catalogStyleIds(a).filter(id => styleById.has(id));
            map.set(catalog.id, {
                ...describeCatalogSummary(a),
                style: styleIds.length > 0 ? styleById.get(styleIds[0])! : null,
                moreStyles: Math.max(0, styleIds.length - 1),
                liveNow: a.summary === "liveNow"
            });
        }
        return map;
    }, [appearance.index, catalogs, styleById]);

    /** Solo lo stato, nella card e nell'elenco: il campione dello stile vive in Stili. */
    const usageBadge = (catalogId: string) => {
        const usage = usageById.get(catalogId);
        return usage ? <StatusBadge variant={usage.tone} label={usage.label} /> : undefined;
    };
    const cardBadge = usageBadge;
    // Le card: prima quelli attivi adesso, poi per nome (M2).
    const cardCatalogs = [...filteredCatalogs].sort(
        (a, b) =>
            Number(usageById.get(b.id)?.liveNow ?? false) - Number(usageById.get(a.id)?.liveNow ?? false) ||
            a.name.localeCompare(b.name, "it")
    );
    /** «· 1 vuota»: le categorie che i clienti non vedono (#238). */
    const emptyText = (catalogId: string) => {
        const n = statsMap[catalogId]?.emptyCategoryCount ?? 0;
        if (statsLoading || n === 0) return "";
        return ` · ${n} ${n === 1 ? "vuota" : "vuote"}`;
    };

    /** «7 categorie · 22 prodotti»: gli stessi numeri nella card e nella lista. */
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
                rowAction.edit(() => navigate(`/business/${currentTenantId}/catalogs/${catalog.id}`)),
                rowAction.duplicate(() => void handleDuplicate(catalog), {
                    label: duplicatingId === catalog.id ? "Duplicazione…" : "Duplica",
                    disabled: duplicatingId !== null
                }),
                {
                    label: `Aggiungi ${productPluralLower} con AI`,
                    icon: Sparkles,
                    variant: "accent",
                    onClick: () => handleAddWithAi(catalog)
                },
                // Il nome del menù non si cambia nel dettaglio: finché non ci arriva resta qui.
                { label: "Rinomina", icon: TextCursorInput, onClick: () => handleOpenEdit(catalog) },
                rowAction.remove(() => handleOpenDelete(catalog))
            ]}
        />
    );

    const columns: ColumnDefinition<V2Catalog>[] = [
        {
            id: "name",
            header: "Nome",
            width: "2fr",
            accessor: catalog => catalog.name,
            cell: (_value, catalog) =>
                isPhone ? (
                    <span className={styles.nameStack}>
                        <Text variant="body-sm" weight={600}>
                            {catalog.name}
                        </Text>
                        {usageBadge(catalog.id)}
                    </span>
                ) : (
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
                    {emptyText(catalog.id)}
                </Text>
            )
        },
        {
            // Al posto di «Creato il» (§50.13/4): quanto è usato batte quando è nato.
            id: "where",
            header: "Dove è attivo",
            width: "1.6fr",
            hideOnPhone: true,
            cell: (_value, catalog) => usageBadge(catalog.id)
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
                    ariaLabel={verticalConfig.catalogLabelPlural}
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
            <CardGrid
                loading={isLoading}
                skeletonCount={3}
                skeletonShape={{ media: true, badge: true, height: CARD_HEIGHT }}
                aria-label={verticalConfig.catalogLabelPlural}
            >
                {cardCatalogs.map(catalog => (
                    <CardGridItem
                        key={catalog.id}
                        to={`/business/${currentTenantId}/catalogs/${catalog.id}`}
                        height={CARD_HEIGHT}
                        media={<CatalogSheet categories={statsMap[catalog.id]?.previewCategories ?? []} />}
                        title={catalog.name}
                        subtitle={`${categoriesText(catalog.id)} · ${productsText(catalog.id)}${emptyText(catalog.id)}`}
                        badge={cardBadge(catalog.id)}
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
