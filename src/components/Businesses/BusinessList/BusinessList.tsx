import React, { useMemo } from "react";
import Text from "@components/ui/Text/Text";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { LocationsGrid } from "../LocationsGrid/LocationsGrid";
import type { BusinessListProps, BusinessWithCapabilities } from "@/types/Businesses";
import styles from "./BusinessList.module.scss";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { ExternalLink, Link, FileText, Edit, Trash2, MapPin, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { formatOverrideSummary } from "@/services/supabase/activeCatalog";
import {
    ACTIVE_CATALOG_ERROR_LABEL,
    ACTIVE_CATALOG_NONE_SHORT_LABEL,
    activeCatalogDisplayName,
    deriveActiveCatalogState
} from "@/utils/activeCatalogStatus";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { buildPublicUrl } from "@/utils/publicUrl";
import { useNavigate, useParams } from "react-router-dom";

export const BusinessList: React.FC<BusinessListProps> = ({
    businesses,
    viewMode = "grid",
    onEdit,
    onDelete,
    onOpenReviews,
    activeCatalogsMap,
    catalogsStatus = "loading",
    onManageAvailability,
    onCreateClick,
    hasActiveFilter = false
}) => {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();

    const columns = useMemo<ColumnDefinition<BusinessWithCapabilities>[]>(
        () => [
            {
                id: "name",
                header: "Attività",
                width: "2fr",
                cell: (_, business) => (
                    <div className={styles.nameCell}>
                        <Text variant="body-sm" weight={600}>{business.name}</Text>
                        <Text variant="caption" colorVariant="muted">
                            {business.slug}
                        </Text>
                    </div>
                )
            },
            {
                id: "address",
                header: "Indirizzo",
                width: "1.5fr",
                accessor: b => b.address,
                cell: (_, b) => <Text variant="body-sm">{b.address ?? "—"}</Text>
            },
            {
                id: "city",
                header: "Città",
                width: "1fr",
                accessor: b => b.city,
                cell: (_, b) => <Text variant="body-sm">{b.city ?? "—"}</Text>
            },
            {
                id: "status",
                header: "Stato",
                width: "100px",
                align: "center",
                cell: (_, business) =>
                    business.status === "inactive" ? (
                        <StatusBadge variant="neutral" label="Sospesa" />
                    ) : (
                        <StatusBadge variant="success" label="Pubblicata" />
                    )
            },
            {
                id: "catalog",
                header: "Menu attivo ora",
                width: "1.5fr",
                cell: (_, business) => {
                    const activeCatalog = activeCatalogsMap?.[business.id];
                    const state = deriveActiveCatalogState(catalogsStatus, activeCatalog);

                    if (state === "loading") {
                        // Stesso trattamento della card: un placeholder della
                        // riga, non la parola "Caricamento" — che occupa la
                        // colonna come se fosse un valore.
                        return (
                            <div className={styles.catalogCell}>
                                <Skeleton height="14px" width="60%" radius="6px" />
                            </div>
                        );
                    }

                    if (state !== "resolved" || !activeCatalog) {
                        return (
                            <div className={styles.catalogCell}>
                                <Text variant="body-sm" colorVariant="muted">
                                    {state === "none"
                                        ? ACTIVE_CATALOG_NONE_SHORT_LABEL
                                        : ACTIVE_CATALOG_ERROR_LABEL}
                                </Text>
                            </div>
                        );
                    }

                    const overrideSummary = formatOverrideSummary(
                        activeCatalog.hiddenCount,
                        activeCatalog.unavailableCount,
                        { abbreviate: true }
                    );
                    return (
                        <div className={styles.catalogCell}>
                            <Text variant="body-sm">{activeCatalogDisplayName(activeCatalog)}</Text>
                            {overrideSummary && (
                                <div className={styles.catalogWarningRow}>
                                    <AlertTriangle
                                        size={12}
                                        strokeWidth={2}
                                        className={styles.catalogWarningIcon}
                                    />
                                    <Text variant="caption" colorVariant="muted">
                                        {overrideSummary}
                                    </Text>
                                </div>
                            )}
                        </div>
                    );
                }
            },
            {
                id: "manage",
                header: "",
                width: "110px",
                align: "right",
                cell: (_, business) => {
                    // Anche a stato ignoto: il drawer riceve solo `activityId`
                    // e risolve il catalogo per conto suo, quindi negare
                    // l'accesso su una risoluzione fallita toglierebbe
                    // un'azione che funziona. Nascosta invece a `loading` e
                    // `none`, dove non c'è nulla su cui operare.
                    const activeCatalog = activeCatalogsMap?.[business.id];
                    const state = deriveActiveCatalogState(catalogsStatus, activeCatalog);
                    if (state !== "resolved" && state !== "error") {
                        return null;
                    }
                    return (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={e => {
                                e.stopPropagation();
                                onManageAvailability?.(business.id, business.name);
                            }}
                        >
                            Gestisci
                        </Button>
                    );
                }
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_, business) => {
                    const publicUrl = buildPublicUrl(business.slug);

                    return (
                        <TableRowActions
                            actions={[
                                {
                                    label: "Apri dettaglio",
                                    icon: FileText,
                                    onClick: () =>
                                        navigate(`/business/${businessId}/locations/${business.id}`)
                                },
                                {
                                    label: "Apri URL pubblico",
                                    icon: ExternalLink,
                                    onClick: () =>
                                        window.open(publicUrl, "_blank", "noopener,noreferrer")
                                },
                                {
                                    label: "Copia link",
                                    icon: Link,
                                    onClick: () => navigator.clipboard.writeText(publicUrl)
                                },
                                {
                                    label: "Modifica",
                                    icon: Edit,
                                    onClick: () => onEdit(business),
                                    separator: true
                                },
                                ...(onDelete ? [{
                                    label: "Elimina",
                                    icon: Trash2,
                                    onClick: () => onDelete!(business.id),
                                    variant: "destructive" as const
                                }] : [])
                            ]}
                        />
                    );
                }
            }
        ],
        [activeCatalogsMap, catalogsStatus, onManageAvailability, onEdit, onDelete, navigate]
    );

    const handleBulkDelete = (selectedIds: string[]) => {
        if (!onDelete) return;
        selectedIds.forEach(id => onDelete!(id));
    };

    if (businesses.length === 0) {
        return (
            <EmptyState
                icon={<MapPin size={40} strokeWidth={1.5} />}
                title={
                    hasActiveFilter
                        ? "Nessun risultato"
                        : "Le sedi sono i locali che i clienti raggiungono con il QR"
                }
                description={
                    hasActiveFilter
                        ? "Nessuna sede corrisponde alla ricerca."
                        : "Ogni sede ha il suo indirizzo e il suo link pubblico. Se gestisci più locali, li trovi tutti qui."
                }
                action={
                    !hasActiveFilter && onCreateClick ? (
                        <Button variant="primary" onClick={onCreateClick}>
                            Aggiungi la prima sede
                        </Button>
                    ) : undefined
                }
            />
        );
    }

    if (viewMode === "list") {
        return (
            <DataTable
                data={businesses}
                columns={columns}
                selectable={!!onDelete}
                onBulkDelete={onDelete ? handleBulkDelete : undefined}
                onRowClick={business => navigate(`/business/${businessId}/locations/${business.id}`)}
            />
        );
    }

    return (
        <LocationsGrid
            businesses={businesses}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpenReviews={onOpenReviews}
            activeCatalogsMap={activeCatalogsMap}
            catalogsStatus={catalogsStatus}
            onManageAvailability={onManageAvailability}
        />
    );
};
