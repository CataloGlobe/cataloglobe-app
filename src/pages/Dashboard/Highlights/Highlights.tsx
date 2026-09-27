import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { CardGrid, CardGridItem } from "@/components/ui/CardGrid/CardGrid";
import { Badge } from "@/components/ui/Badge/Badge";
import { FramedMedia } from "@/components/ui/FramedMedia";
import { Pencil, Trash2, Pin, LayoutGrid, List as ListIcon, Image as ImageIcon } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import {
    listFeaturedContents,
    deleteFeaturedContent,
    columnsToFraming,
    FeaturedContentWithProducts
} from "@/services/supabase/featuredContents";
import { CONTENT_TYPE_LABEL } from "./featuredContentTypes";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useBulkDelete } from "@/hooks/useBulkDelete";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import FeaturedContentDrawer from "./FeaturedContentDrawer";
import FeaturedContentDeleteDialog from "./FeaturedContentDeleteDialog";
import styles from "./Highlights.module.scss";

import { useNavigate } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";

const VIEW_MODE_KEY = "featuredContents_viewMode";

/** «I clienti leggono «Menu coppia» · 2 prodotti» (§28.6: i due nomi, dichiarati). */
function readsLine(item: FeaturedContentWithProducts): string {
    const reads = `I clienti leggono «${item.title}»`;
    if (item.pricing_mode === "none") return reads;
    const n = item.products_count || 0;
    return `${reads} · ${n === 1 ? "1 prodotto" : `${n} prodotti`}`;
}

// Lista di default (mockup, come Prodotti); la scelta salvata vince.
function readViewMode(): "list" | "grid" {
    try {
        return localStorage.getItem(VIEW_MODE_KEY) === "grid" ? "grid" : "list";
    } catch {
        return "list";
    }
}

export default function Highlights() {
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { canEdit, ensureActive } = useEnsureActive();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "featured.write") : false;
    // Gate di lettura prima della fetch: senza `featured.read` nessuna richiesta.
    const canRead = permissions != null && canDoOnAnyActivity(permissions, "featured.read");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [contents, setContents] = useState<FeaturedContentWithProducts[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const navigate = useNavigate();

    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">(readViewMode);

    const handleViewChange = useCallback((v: "list" | "grid") => {
        setViewMode(v);
        try {
            localStorage.setItem(VIEW_MODE_KEY, v);
        } catch {
            // Preferenza di vista: senza storage vale per la sessione.
        }
    }, []);

    const [deleteTarget, setDeleteTarget] = useState<FeaturedContentWithProducts | null>(null);

    const loadData = useCallback(async () => {
        if (!tenantId || !canRead) return;
        try {
            setLoading(true);
            setLoadError(false);
            const data = await listFeaturedContents(tenantId);
            setContents(data);
        } catch (error) {
            // Un errore non è un elenco vuoto: la pagina lo dice, con «Riprova».
            console.error("Caricamento contenuti in evidenza:", error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [tenantId, canRead]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreate = useCallback(() => {
        if (!ensureActive()) return;
        setIsCreateOpen(true);
    }, [ensureActive]);

    const headerActions = useMemo(() => (
        <>
            <ToolbarSearch value={searchQuery} onChange={setSearchQuery} placeholder="Cerca contenuti..." />
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
                <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                    Crea contenuto
                </Button>
            )}
        </>
    ), [handleCreate, canEdit, canWrite, searchQuery, viewMode, handleViewChange]);

    // Stessa toolbar dichiarata a dati per lo stato compatto. Nessuna
    // `sections`: la pagina non ha tab, quindi la riga compatta parte dalle
    // icone. Il toggle vista resta a vista — azione frequente.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        search: { value: searchQuery, onChange: setSearchQuery, placeholder: "Cerca contenuti..." },
        persistentIcons: [
            viewMode === "list"
                ? { icon: <LayoutGrid size={18} />, label: "Vista griglia", onClick: () => handleViewChange("grid") }
                : { icon: <ListIcon size={18} />, label: "Vista lista", onClick: () => handleViewChange("list") }
        ],
        primaryAction: canWrite ? { label: "Crea contenuto", onClick: handleCreate, disabled: !canEdit } : undefined
    }), [searchQuery, viewMode, handleViewChange, canWrite, handleCreate, canEdit]);

    usePageHeader({
        title: "In evidenza",
        subtitle: "Blocchi sopra o sotto il menù. Dove e quando lo decide la regola.",
        actions: headerActions,
        compact: headerCompact
    });

    const contentUrl = (item: FeaturedContentWithProducts) => `/business/${tenantId}/featured/${item.id}`;

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
        const q = searchQuery.trim().toLowerCase();
        return contents.filter(
            item => item.title.toLowerCase().includes(q) || item.internal_name.toLowerCase().includes(q)
        );
    }, [contents, searchQuery]);
    const allContentIds = useMemo(() => contents.map(c => c.id), [contents]);
    const hasSearch = searchQuery.trim().length > 0;

    const rowActions = (item: FeaturedContentWithProducts) => (
        <TableRowActions
            ariaLabel={`Azioni contenuto ${item.internal_name}`}
            actions={[
                { label: canWrite ? "Modifica" : "Apri", icon: Pencil, onClick: () => navigate(contentUrl(item)) },
                ...(canWrite
                    ? [{
                          label: "Elimina",
                          icon: Trash2,
                          onClick: () => requestDelete(item),
                          variant: "destructive" as const,
                          separator: true
                      }]
                    : [])
            ]}
        />
    );

    const columns: ColumnDefinition<FeaturedContentWithProducts>[] = [
        {
            id: "title",
            header: "Contenuto",
            width: "1fr",
            cell: (_value, item) => (
                <div className={styles.cellTwoLine}>
                    <span className={styles.nameLine}>
                        <Text variant="body-sm" weight={600} className={styles.ellipsis}>
                            {item.internal_name}
                        </Text>
                        <Badge variant="neutral">{CONTENT_TYPE_LABEL[item.content_type ?? "announcement"]}</Badge>
                    </span>
                    <Text variant="caption" colorVariant="muted" className={styles.ellipsis}>
                        {readsLine(item)}
                    </Text>
                </div>
            )
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_value, item) => rowActions(item)
        }
    ];

    const renderContent = () => {
        if (loadError) {
            return (
                <EmptyState
                    icon={<Pin />}
                    title="Non è stato possibile caricare i contenuti"
                    description="Controlla la connessione e riprova."
                    action={
                        <Button variant="secondary" onClick={() => loadData()}>
                            Riprova
                        </Button>
                    }
                />
            );
        }
        if (!loading && contents.length === 0) {
            return (
                <EmptyState
                    icon={<Pin />}
                    title="Metti in risalto quello che vuoi far notare"
                    description="Promozioni, piatti consigliati, eventi: compaiono sopra o sotto il menù, e puoi programmarli per periodi specifici."
                    action={
                        canWrite ? (
                            <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                                Crea il primo contenuto
                            </Button>
                        ) : undefined
                    }
                />
            );
        }
        if (viewMode === "list") {
            return (
                <DataTable<FeaturedContentWithProducts>
                    data={filteredContents}
                    allRowIds={allContentIds}
                    columns={columns}
                    isLoading={loading}
                    ariaLabel="Contenuti in evidenza"
                    isFiltered={hasSearch}
                    onClearFilters={() => setSearchQuery("")}
                    selectable={canWrite && canEdit}
                    selectedRowIds={bulk.selectedIds}
                    onSelectedRowsChange={bulk.setSelectedIds}
                    onBulkDelete={canWrite && canEdit ? bulk.request : undefined}
                    onRowClick={item => navigate(contentUrl(item))}
                />
            );
        }
        if (!loading && filteredContents.length === 0) {
            return <EmptyState variant="filtered" title="Nessun risultato" onClearFilters={() => setSearchQuery("")} />;
        }
        return (
            <CardGrid loading={loading} skeletonShape={{ media: true }} aria-label="Contenuti in evidenza">
                {filteredContents.map(item => (
                    <CardGridItem
                        key={item.id}
                        to={contentUrl(item)}
                        aria-label={item.internal_name}
                        media={
                            item.media_id ? (
                                <FramedMedia
                                    source={item.media_id}
                                    framing={columnsToFraming(item)}
                                    aspectRatio={item.media_aspect_ratio}
                                    alt={item.title}
                                />
                            ) : (
                                <div className={styles.mediaPlaceholder} aria-hidden="true">
                                    <ImageIcon size={24} strokeWidth={1.5} />
                                </div>
                            )
                        }
                        title={item.internal_name}
                        subtitle={readsLine(item)}
                        badge={<Badge variant="neutral">{CONTENT_TYPE_LABEL[item.content_type ?? "announcement"]}</Badge>}
                        actions={rowActions(item)}
                    />
                ))}
            </CardGrid>
        );
    };

    if (permissions != null && !canRead) {
        return <PageGate readPermission="featured.read">{() => null}</PageGate>;
    }

    return (
        <PageGate readPermission="featured.read">
            {() => (
                <>
                    <div className={styles.wrapper} data-view-mode={viewMode}>
                        {renderContent()}
                    </div>

                    <FeaturedContentDrawer
                        open={isCreateOpen}
                        onClose={() => setIsCreateOpen(false)}
                        onSuccess={() => setIsCreateOpen(false)}
                    />

                    <ConfirmDialog
                        {...bulk.dialog}
                        message="Le regole che li mostrano restano; quelle che restano senza contenuti passano in bozza. Non si torna indietro."
                    />

                    <FeaturedContentDeleteDialog
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
