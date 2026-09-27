import { useEffect, useState, useMemo, useCallback } from "react";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { CardGrid, CardGridItem } from "@/components/ui/CardGrid/CardGrid";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconPalette } from "@tabler/icons-react";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { TableRowActions, type TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import styles from "./Styles.module.scss";

import { useNavigate } from "react-router-dom";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnTenant } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { listStyles, duplicateStyle, V2Style } from "@/services/supabase/styles";
import { StyleSwatch } from "./components/StyleSwatch";
import { StyleDeleteDrawer } from "./StyleDeleteDrawer";
import { StyleCreateDrawer } from "./StyleCreateDrawer";

const VIEW_MODE_KEY = "cataloglobe-styles-view-mode";

/** «Usato in 4 regole» / «Non utilizzato». Il conteggio vivo arriva col lotto «la riga deriva dalle regole» (§50.11/1). */
function usageLabel(style: V2Style): string {
    const count = style.usage_count || 0;
    if (count === 0) return "Non utilizzato";
    return `Usato in ${count} ${count === 1 ? "regola" : "regole"}`;
}

function readViewMode(): "list" | "grid" {
    try {
        return localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
    } catch {
        return "grid";
    }
}

export default function Styles() {
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const { canEdit, ensureActive } = useEnsureActive();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnTenant(permissions, "styles.write") : false;
    // Gate di lettura prima della fetch: chi non ha `styles.read` vede il
    // blocco di `PageGate` e nessuna richiesta parte.
    const canRead = permissions != null && canDoOnTenant(permissions, "styles.read");

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [allStyles, setAllStyles] = useState<V2Style[]>([]);

    const navigate = useNavigate();

    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">(readViewMode);

    const handleViewModeChange = useCallback((mode: "list" | "grid") => {
        setViewMode(mode);
        try {
            localStorage.setItem(VIEW_MODE_KEY, mode);
        } catch {
            // Preferenza di vista: senza storage vale per la sessione.
        }
    }, []);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [styleToDelete, setStyleToDelete] = useState<V2Style | null>(null);

    const loadData = useCallback(async () => {
        if (!currentTenantId || !canRead) return;
        try {
            setIsLoading(true);
            setLoadError(false);
            const data = await listStyles(currentTenantId);
            setAllStyles(data);
        } catch (error) {
            // Un errore non è un elenco vuoto: la pagina lo dice, con «Riprova».
            console.error("Caricamento stili:", error);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, canRead]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredStyles = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        return allStyles
            .filter(style => !normalizedQuery || style.name.toLowerCase().includes(normalizedQuery))
            .sort((a, b) => {
                if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });
    }, [allStyles, searchQuery]);
    const hasSearch = searchQuery.trim().length > 0;

    const handleCreateClick = useCallback(() => {
        if (!ensureActive()) return;
        setIsCreateOpen(true);
    }, [ensureActive]);

    const headerActions = useMemo(() => (
        <>
            <ToolbarSearch value={searchQuery} onChange={setSearchQuery} placeholder="Cerca stili..." />
            <SegmentedControl<"list" | "grid">
                iconsOnly
                value={viewMode}
                onChange={handleViewModeChange}
                options={[
                    { value: "grid", icon: <LayoutGrid size={16} />, label: "Vista griglia" },
                    { value: "list", icon: <ListIcon size={16} />, label: "Vista lista" }
                ]}
            />
            {canWrite && (
                <Button variant="primary" onClick={handleCreateClick} disabled={!canEdit}>
                    Crea stile
                </Button>
            )}
        </>
    ), [handleCreateClick, canEdit, canWrite, searchQuery, viewMode, handleViewModeChange]);

    // Stessa toolbar a dati per lo stato compatto: nessuna tab, quindi niente
    // `sections` — la riga parte dalle icone.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        search: { value: searchQuery, onChange: setSearchQuery, placeholder: "Cerca stili..." },
        persistentIcons: [
            viewMode === "list"
                ? { icon: <LayoutGrid size={18} />, label: "Vista griglia", onClick: () => handleViewModeChange("grid") }
                : { icon: <ListIcon size={18} />, label: "Vista lista", onClick: () => handleViewModeChange("list") }
        ],
        primaryAction: canWrite ? { label: "Crea stile", onClick: handleCreateClick, disabled: !canEdit } : undefined
    }), [searchQuery, viewMode, handleViewModeChange, canWrite, handleCreateClick, canEdit]);

    usePageHeader({
        title: "Stili",
        subtitle: "Personalizza l'aspetto visivo e i colori del tuo catalogo.",
        actions: headerActions,
        compact: headerCompact
    });

    const styleUrl = useCallback(
        (style: V2Style) => `/business/${currentTenantId}/styles/${style.id}`,
        [currentTenantId]
    );

    const handleDuplicateClick = useCallback(
        async (style: V2Style) => {
            if (!ensureActive() || !currentTenantId) return;
            try {
                await duplicateStyle(style.id, `Copia di ${style.name}`, currentTenantId);
                showToast({ message: "Stile duplicato con successo.", type: "success" });
                loadData();
            } catch (error) {
                console.error("Errore duplicazione stile:", error);
                showToast({ message: "Impossibile duplicare lo stile.", type: "error" });
            }
        },
        [loadData, showToast, ensureActive, currentTenantId]
    );

    const handleDeleteClick = useCallback((style: V2Style) => {
        if (!ensureActive()) return;
        setStyleToDelete(style);
        setIsDeleteOpen(true);
    }, [ensureActive]);

    // Niente selezione multipla: eliminare uno stile in uso chiede il suo
    // sostitutivo, e quella scelta non si fa una volta per N stili (§34.2).
    const renderRowActions = useCallback(
        (style: V2Style) => {
            const actions: TableRowAction[] = [
                { label: canWrite ? "Modifica" : "Apri", onClick: () => navigate(styleUrl(style)) }
            ];
            if (canWrite) {
                actions.push({ label: "Duplica", onClick: () => handleDuplicateClick(style) });
                if (!style.is_system) {
                    actions.push({
                        label: "Elimina",
                        onClick: () => handleDeleteClick(style),
                        variant: "destructive",
                        separator: true
                    });
                }
            }
            return <TableRowActions actions={actions} ariaLabel={`Azioni stile ${style.name}`} />;
        },
        [handleDeleteClick, handleDuplicateClick, canWrite, navigate, styleUrl]
    );

    const columns = useMemo<ColumnDefinition<V2Style>[]>(
        () => [
            {
                id: "preview",
                header: "Anteprima",
                width: "88px",
                cell: (_value, style) => <StyleSwatch style={style} compact />
            },
            {
                id: "name",
                header: "Nome stile",
                width: "1fr",
                accessor: style => style.name,
                cell: (_value, style) => (
                    <div className={styles.cellTwoLine}>
                        <span className={styles.nameLine}>
                            <Text variant="body-sm" weight={600}>{style.name}</Text>
                            {style.is_system && <Badge variant="neutral">Di sistema</Badge>}
                        </span>
                        <Text variant="caption" colorVariant="muted">
                            Versione {style.current_version?.version || "0"} · {usageLabel(style)}
                        </Text>
                    </div>
                )
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_value, style) => renderRowActions(style)
            }
        ],
        [renderRowActions]
    );

    const renderContent = () => {
        if (loadError) {
            return (
                <EmptyState
                    icon={<IconPalette />}
                    title="Non è stato possibile caricare gli stili"
                    description="Controlla la connessione e riprova."
                    action={
                        <Button variant="secondary" onClick={() => loadData()}>
                            Riprova
                        </Button>
                    }
                />
            );
        }

        if (!isLoading && allStyles.length === 0) {
            return (
                <EmptyState
                    icon={<IconPalette />}
                    title="Nessuno stile"
                    description="Uno stile decide colori, forme e caratteri della pagina che i clienti vedono."
                    action={
                        canWrite ? (
                            <Button variant="primary" onClick={handleCreateClick} disabled={!canEdit}>
                                Crea stile
                            </Button>
                        ) : undefined
                    }
                />
            );
        }

        if (viewMode === "list") {
            return (
                <DataTable<V2Style>
                    data={filteredStyles}
                    columns={columns}
                    isLoading={isLoading}
                    ariaLabel="Stili"
                    isFiltered={hasSearch}
                    onClearFilters={() => setSearchQuery("")}
                    onRowClick={style => navigate(styleUrl(style))}
                />
            );
        }

        if (!isLoading && filteredStyles.length === 0) {
            return <EmptyState variant="filtered" title="Nessun risultato" onClearFilters={() => setSearchQuery("")} />;
        }

        return (
            <CardGrid loading={isLoading} skeletonShape={{ media: true }} aria-label="Stili">
                {filteredStyles.map(style => (
                    <CardGridItem
                        key={style.id}
                        to={styleUrl(style)}
                        aria-label={style.name}
                        media={<StyleSwatch style={style} />}
                        title={style.name}
                        subtitle={usageLabel(style)}
                        badge={style.is_system ? <Badge variant="neutral">Di sistema</Badge> : undefined}
                        actions={renderRowActions(style)}
                    />
                ))}
            </CardGrid>
        );
    };

    if (permissions != null && !canRead) {
        return <PageGate readPermission="styles.read">{() => null}</PageGate>;
    }

    return (
        <PageGate readPermission="styles.read">
            {() => (
                <section className={styles.listPage}>
                    <div className={styles.listContent} data-view-mode={viewMode}>
                        {renderContent()}
                    </div>

                    <StyleCreateDrawer
                        open={isCreateOpen}
                        onClose={() => setIsCreateOpen(false)}
                        tenantId={currentTenantId ?? undefined}
                        allStyles={allStyles}
                        onSuccess={newStyleId => {
                            setIsCreateOpen(false);
                            navigate(`/business/${currentTenantId}/styles/${newStyleId}`);
                        }}
                    />

                    <StyleDeleteDrawer
                        open={isDeleteOpen}
                        onClose={() => setIsDeleteOpen(false)}
                        styleData={styleToDelete}
                        allStyles={allStyles}
                        onSuccess={loadData}
                    />
                </section>
            )}
        </PageGate>
    );
}
