import React, { useEffect, useState, useMemo, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconPalette, IconShieldCheck } from "@tabler/icons-react";
import { TableRowActions, type TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import styles from "./Styles.module.scss";

import { useNavigate } from "react-router-dom";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { listStyles, duplicateStyle, deleteStyle, V2Style } from "@/services/supabase/styles";
import { parseTokens, DEFAULT_STYLE_TOKENS } from "./Editor/StyleTokenModel";
import { StyleDeleteDrawer } from "./StyleDeleteDrawer";
import { StyleCreateDrawer } from "./StyleCreateDrawer";

function resolvePreviewColors(style: V2Style) {
    const tokens = style.current_version?.config
        ? parseTokens(style.current_version.config)
        : DEFAULT_STYLE_TOKENS;
    return {
        pageBackground: tokens.colors.pageBackground,
        primary: tokens.colors.primary,
        headerBackground: tokens.colors.headerBackground
    };
}

function UsageBadge({ style }: { style: V2Style }) {
    const count = style.usage_count || 0;
    if (count > 0) {
        return (
            <span className={styles.usageText}>
                Usato in {count} {count === 1 ? "regola" : "regole"}
            </span>
        );
    }
    return <span className={styles.usageTextMuted}>Non utilizzato</span>;
}

function StyleCardPreview({ style, compact = false }: { style: V2Style; compact?: boolean }) {
    const palette = resolvePreviewColors(style);
    return (
        <div
            className={`${styles.cardPreviewBox} ${compact ? styles.cardPreviewBoxCompact : ""}`}
            aria-hidden="true"
        >
            <div
                className={styles.cardPreviewHeader}
                style={{ backgroundColor: palette.headerBackground }}
            />
            <div
                className={styles.cardPreviewBody}
                style={{ backgroundColor: palette.pageBackground }}
            >
                <div className={styles.cardPreviewNav}>
                    <span
                        className={styles.cardPreviewNavPillActive}
                        style={{ backgroundColor: palette.primary }}
                    />
                    <span className={styles.cardPreviewNavPillIdle} />
                    <span className={styles.cardPreviewNavPillIdle} />
                </div>
                <div className={styles.cardPreviewContent}>
                    <span className={styles.cardPreviewBlock} />
                    <span className={styles.cardPreviewBlockNarrow} />
                </div>
                <span
                    className={styles.cardPreviewCta}
                    style={{ backgroundColor: palette.primary }}
                />
            </div>
        </div>
    );
}

export default function Styles() {
    const currentTenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();
    const { canEdit } = useSubscriptionGuard();

    const [isLoading, setIsLoading] = useState(true);
    const [allStyles, setAllStyles] = useState<V2Style[]>([]);

    const navigate = useNavigate();

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
        const saved = localStorage.getItem("cataloglobe-styles-view-mode");
        return saved === "list" ? "list" : "grid";
    });

    const handleViewModeChange = useCallback((mode: "list" | "grid") => {
        setViewMode(mode);
        localStorage.setItem("cataloglobe-styles-view-mode", mode);
    }, []);

    // Drawer States
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [styleToDelete, setStyleToDelete] = useState<V2Style | null>(null);

    const loadData = useCallback(async () => {
        if (!currentTenantId) return;
        try {
            setIsLoading(true);
            const data = await listStyles(currentTenantId!);
            setAllStyles(data);
        } catch (error) {
            console.error("Errore nel caricamento degli stili:", error);
            showToast({ message: "Non è stato possibile caricare gli stili.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredStyles = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();

        return allStyles
            .filter(style => {
                if (normalizedQuery && !style.name.toLowerCase().includes(normalizedQuery)) {
                    return false;
                }
                return true;
            })
            .sort((a, b) => {
                if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
    }, [allStyles, searchQuery]);

    const handleCreateClick = useCallback(() => {
        if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
        setIsCreateOpen(true);
    }, [canEdit, showToast]);

    const handleEditClick = useCallback(
        (style: V2Style) => {
            if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
            navigate(`/business/${currentTenantId}/styles/${style.id}`);
        },
        [navigate, canEdit, showToast]
    );

    const handleDuplicateClick = useCallback(
        async (style: V2Style) => {
            if (!canEdit) { showToast({ message: "Abbonamento non attivo. Vai alla pagina abbonamento per riattivarlo.", type: "error" }); return; }
            try {
                await duplicateStyle(style.id, `${style.name} (Copia)`, currentTenantId!);
                showToast({ message: "Stile duplicato con successo.", type: "success" });
                loadData();
            } catch (error) {
                console.error("Errore duplicazione stile:", error);
                showToast({ message: "Impossibile duplicare lo stile.", type: "error" });
            }
        },
        [loadData, showToast, canEdit]
    );

    const handleDeleteClick = useCallback((style: V2Style) => {
        setStyleToDelete(style);
        setIsDeleteOpen(true);
    }, []);

    const handleBulkDelete = async (selectedIds: string[]) => {
        if (selectedIds.length === 0) return;

        const protectedIds = new Set(allStyles.filter(style => style.is_system).map(style => style.id));
        const deletableIds = selectedIds.filter(id => !protectedIds.has(id));

        if (deletableIds.length === 0) {
            showToast({
                message: "Lo stile predefinito non può essere eliminato.",
                type: "error"
            });
            return;
        }

        if (deletableIds.length < selectedIds.length) {
            showToast({
                message: "Lo stile predefinito è stato escluso dall'eliminazione.",
                type: "info"
            });
        }

        try {
            await Promise.all(deletableIds.map(id => deleteStyle(id, currentTenantId!)));
            showToast({
                message: `${deletableIds.length} stili eliminati con successo.`,
                type: "success"
            });
            loadData();
        } catch (error) {
            console.error("Errore eliminazione multipla stili:", error);
            showToast({ message: "Errore durante l'eliminazione di alcuni stili.", type: "error" });
        }
    };

    const renderRowActions = useCallback(
        (style: V2Style) => {
            const actions: TableRowAction[] = [
                { label: "Modifica", onClick: () => handleEditClick(style) },
                { label: "Duplica", onClick: () => handleDuplicateClick(style) }
            ];

            if (!style.is_system) {
                actions.push({
                    label: "Elimina",
                    onClick: () => handleDeleteClick(style),
                    variant: "destructive",
                    separator: true
                });
            }

            return <TableRowActions actions={actions} />;
        },
        [handleDeleteClick, handleDuplicateClick, handleEditClick]
    );

    const columns = useMemo<ColumnDefinition<V2Style>[]>(
        () => [
            {
                id: "preview",
                header: "Anteprima",
                width: "96px",
                cell: (_value, style) => <StyleCardPreview style={style} compact />
            },
            {
                id: "name",
                header: "Nome stile",
                width: "1.4fr",
                accessor: style => style.name,
                sortable: false,
                cell: (_value, style) => (
                    <button
                        type="button"
                        className={styles.rowLink}
                        onClick={() => handleEditClick(style)}
                    >
                        <div className={styles.colName}>
                            <div className={styles.styleNameRow}>
                                <Text variant="body-sm" weight={600}>
                                    {style.name}
                                </Text>
                                {style.is_system && (
                                    <IconShieldCheck size={14} className={styles.systemIcon} />
                                )}
                            </div>
                            <Text variant="caption" colorVariant="muted">
                                Versione {style.current_version?.version || "0"}
                            </Text>
                        </div>
                    </button>
                )
            },
            {
                id: "usage",
                header: "Stato di utilizzo",
                width: "0.95fr",
                accessor: style => ((style.usage_count || 0) > 0 ? "in_use" : "unused"),
                cell: (_value, style) => <UsageBadge style={style} />
            },
            {
                id: "actions",
                header: "",
                width: "72px",
                align: "right",
                cell: (_value, style) => renderRowActions(style)
            }
        ],
        [handleEditClick, renderRowActions]
    );

    const loadingState = (
        <div className={styles.loadingState}>
            <Text variant="body-sm" colorVariant="muted">
                Caricamento stili in corso...
            </Text>
        </div>
    );

    const emptyState = (
        <EmptyState
            icon={<IconPalette size={48} stroke={1} />}
            title="Nessuno stile trovato"
            description="Crea un nuovo stile per personalizzare l'aspetto del tuo catalogo."
            action={
                <Button variant="primary" onClick={handleCreateClick} disabled={!canEdit}>
                    Crea stile
                </Button>
            }
        />
    );

    return (
        <section className={styles.container}>
            <PageHeader
                title="Stili"
                businessName={selectedTenant?.name}
                subtitle="Personalizza l'aspetto visivo e i colori del tuo catalogo."
                actions={
                    <Button variant="primary" onClick={handleCreateClick} disabled={!canEdit}>
                        Crea stile
                    </Button>
                }
            />

            <div className={styles.content}>
                <div className={styles.filterBarRow}>
                    <FilterBar
                        search={{
                            value: searchQuery,
                            onChange: setSearchQuery,
                            placeholder: "Cerca stili..."
                        }}
                        view={{
                            value: viewMode,
                            onChange: handleViewModeChange
                        }}
                        className={styles.filterBar}
                    />
                </div>

                {isLoading ? (
                    <Card className={styles.tableCard}>{loadingState}</Card>
                ) : filteredStyles.length === 0 ? (
                    emptyState
                ) : viewMode === "list" ? (
                    <Card className={styles.tableCard}>
                        <DataTable<V2Style>
                            data={filteredStyles}
                            columns={columns}
                            selectable
                            onBulkDelete={handleBulkDelete}
                            emptyState={emptyState}
                        />
                    </Card>
                ) : (
                    <div className={styles.gridWrapper}>
                        <div className={styles.gridView}>
                            {filteredStyles.map(style => (
                                <div key={style.id} className={styles.styleCard}>
                                    <button
                                        type="button"
                                        className={styles.cardPreviewArea}
                                        onClick={() => handleEditClick(style)}
                                    >
                                        <StyleCardPreview style={style} />
                                    </button>
                                    <div className={styles.cardFooter}>
                                        <div className={styles.cardFooterLeft}>
                                            <div className={styles.styleNameRow}>
                                                <Text variant="body-sm" weight={600}>
                                                    {style.name}
                                                </Text>
                                                {style.is_system && (
                                                    <IconShieldCheck
                                                        size={14}
                                                        className={styles.systemIcon}
                                                    />
                                                )}
                                            </div>
                                            <UsageBadge style={style} />
                                        </div>
                                        <div className={styles.cardFooterRight}>
                                            {renderRowActions(style)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
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
    );
}
