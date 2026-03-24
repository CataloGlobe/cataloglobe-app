import React, { useEffect, useState, useMemo, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useTenantId } from "@/context/useTenantId";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconPalette } from "@tabler/icons-react";
import { TableRowActions, type TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import styles from "./Styles.module.scss";

import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { listStyles, duplicateStyle, deleteStyle, V2Style } from "@/services/supabase/styles";
import { StyleDeleteDrawer } from "./StyleDeleteDrawer";
import { StyleCreateDrawer } from "./StyleCreateDrawer";

type StyleListRow = V2Style & {
    description?: string | null;
    status?: string | null;
};

function resolveStyleDescription(style: StyleListRow): string | null {
    if (typeof style.description === "string" && style.description.trim().length > 0) {
        return style.description.trim();
    }

    const config = style.current_version?.config;
    if (!config || typeof config !== "object") return null;

    const raw = config as Record<string, unknown>;
    if (typeof raw.description === "string" && raw.description.trim().length > 0) {
        return raw.description.trim();
    }

    const meta = raw.meta;
    if (meta && typeof meta === "object") {
        const metaDescription = (meta as Record<string, unknown>).description;
        if (typeof metaDescription === "string" && metaDescription.trim().length > 0) {
            return metaDescription.trim();
        }
    }

    return null;
}

function resolvePreviewColors(style: V2Style) {
    const config = style.current_version?.config;
    const raw = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
    const colors =
        raw.colors && typeof raw.colors === "object" ? (raw.colors as Record<string, unknown>) : {};
    const header =
        raw.header && typeof raw.header === "object" ? (raw.header as Record<string, unknown>) : {};

    const pageBackground =
        typeof colors.pageBackground === "string"
            ? colors.pageBackground
            : typeof colors.background === "string"
              ? colors.background
              : "#f3f4f6";

    const primary = typeof colors.primary === "string" ? colors.primary : "#6366f1";

    const headerBackground =
        typeof colors.headerBackground === "string"
            ? colors.headerBackground
            : typeof header.background === "string"
              ? header.background
              : "#ffffff";

    return { pageBackground, primary, headerBackground };
}

function StyleMiniPreview({ style }: { style: V2Style }) {
    const palette = resolvePreviewColors(style);

    return (
        <div className={styles.previewBox} aria-hidden="true">
            <span
                className={styles.previewHeaderBand}
                style={{ backgroundColor: palette.headerBackground }}
            />
            <span
                className={styles.previewBody}
                style={{ backgroundColor: palette.pageBackground }}
            />
            <span className={styles.previewAccent} style={{ backgroundColor: palette.primary }} />
        </div>
    );
}

function UsageBadge({ style }: { style: V2Style }) {
    return (style.usage_count || 0) > 0 ? (
        <Badge variant="warning">In uso ({style.usage_count})</Badge>
    ) : (
        <Badge variant="secondary">Non in uso</Badge>
    );
}

export default function Styles() {
    const currentTenantId = useTenantId();
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [allStyles, setAllStyles] = useState<V2Style[]>([]);

    const navigate = useNavigate();

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">("list");

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
        setIsCreateOpen(true);
    }, []);

    const handleEditClick = useCallback(
        (style: V2Style) => {
            navigate(`/business/${currentTenantId}/styles/${style.id}`);
        },
        [navigate]
    );

    const handleDuplicateClick = useCallback(
        async (style: V2Style) => {
            try {
                await duplicateStyle(style.id, `${style.name} (Copia)`, currentTenantId!);
                showToast({ message: "Stile duplicato con successo.", type: "success" });
                loadData();
            } catch (error) {
                console.error("Errore duplicazione stile:", error);
                showToast({ message: "Impossibile duplicare lo stile.", type: "error" });
            }
        },
        [loadData, showToast]
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
                cell: (_value, style) => <StyleMiniPreview style={style} />
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
                                {style.is_system && <Badge variant="primary">Default</Badge>}
                            </div>
                            <Text variant="caption" colorVariant="muted">
                                Versione {style.current_version?.version || "0"}
                            </Text>
                        </div>
                    </button>
                )
            },
            {
                id: "description",
                header: "Descrizione breve",
                width: "1.6fr",
                accessor: style => resolveStyleDescription(style as StyleListRow),
                cell: value => {
                    if (typeof value === "string" && value.trim().length > 0) {
                        return (
                            <Text variant="body-sm" className={styles.descriptionText}>
                                {value}
                            </Text>
                        );
                    }

                    return (
                        <Text variant="body-sm" colorVariant="muted">
                            Nessuna descrizione
                        </Text>
                    );
                }
            },
            {
                id: "usage",
                header: "Stato di utilizzo",
                width: "0.95fr",
                accessor: style =>
                    (style as StyleListRow).status ??
                    ((style.usage_count || 0) > 0 ? "in_use" : "unused"),
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
                <Button variant="primary" onClick={handleCreateClick}>
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
                    <Button variant="primary" onClick={handleCreateClick}>
                        Crea stile
                    </Button>
                }
            />

            <div className={styles.content}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                        marginBottom: "24px"
                    }}
                >
                    <FilterBar
                        search={{
                            value: searchQuery,
                            onChange: setSearchQuery,
                            placeholder: "Cerca stili..."
                        }}
                        view={{
                            value: viewMode,
                            onChange: setViewMode
                        }}
                        className={styles.filterBar}
                    />
                </div>

                {isLoading ? (
                    <Card className={styles.tableCard}>{loadingState}</Card>
                ) : filteredStyles.length === 0 ? (
                    emptyState
                ) : (
                    <Card className={styles.tableCard}>
                        {viewMode === "list" ? (
                            <DataTable<V2Style>
                                data={filteredStyles}
                                columns={columns}
                                selectable
                                onBulkDelete={handleBulkDelete}
                                emptyState={emptyState}
                            />
                        ) : (
                            <div className={styles.listContainer}>
                                <div className={styles.listHeader}>
                                    <div className={styles.colName}>Nome</div>
                                    <div className={styles.colUsage}>Stato</div>
                                    <div className={styles.colActions}></div>
                                </div>
                                <div className={styles.listBody}>
                                    {filteredStyles.map(style => (
                                        <div key={style.id} className={styles.listRow}>
                                            <div className={styles.colName}>
                                                <button
                                                    type="button"
                                                    className={styles.rowLink}
                                                    onClick={() => handleEditClick(style)}
                                                >
                                                    <div className={styles.styleNameRow}>
                                                        <Text variant="body-sm" weight={600}>
                                                            {style.name}
                                                        </Text>
                                                        {style.is_system && (
                                                            <Badge variant="primary">Default</Badge>
                                                        )}
                                                    </div>
                                                    <Text variant="caption" colorVariant="muted">
                                                        Versione {style.current_version?.version || "0"}
                                                    </Text>
                                                </button>
                                            </div>

                                            <div className={styles.colUsage}>
                                                <UsageBadge style={style} />
                                            </div>

                                            {renderRowActions(style)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>
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
