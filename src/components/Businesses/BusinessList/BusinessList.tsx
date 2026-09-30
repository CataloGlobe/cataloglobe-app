import React, { useMemo } from "react";
import Text from "@components/ui/Text/Text";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { LocationsGrid } from "../LocationsGrid/LocationsGrid";
import { PendingReservationsLink } from "../PendingReservationsLink/PendingReservationsLink";
import type { BusinessListProps, BusinessWithCapabilities } from "@/types/Businesses";
import styles from "./BusinessList.module.scss";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { ExternalLink, Link, FileText, Edit, Trash2, MapPin, AlertTriangle } from "lucide-react";
import { useToast } from "@/context/Toast/ToastContext";
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
    activeCatalogsMap,
    catalogsStatus = "loading",
    onManageAvailability,
    onCreateClick,
    hasActiveFilter = false,
    onClearFilters,
    isLoading = false,
    pendingReservationsMap
}) => {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    const { showToast } = useToast();

    const columns = useMemo<ColumnDefinition<BusinessWithCapabilities>[]>(
        () => [
            {
                id: "name",
                header: "Sede",
                width: "2fr",
                cell: (_, business) => {
                    const pending = pendingReservationsMap?.[business.id] ?? 0;
                    return (
                        <div className={styles.nameCell}>
                            <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                                <span>{business.name}</span>
                                <span>{business.slug}</span>
                            </div>
                            {/* Un link nella cella: la riga non lo intercetta. */}
                            {pending > 0 && (
                                <PendingReservationsLink
                                    count={pending}
                                    to={`/business/${businessId}/locations/${business.id}/prenotazioni`}
                                />
                            )}
                        </div>
                    );
                }
            },
            {
                id: "address",
                header: "Indirizzo",
                width: "1.5fr",
                hideOnPhone: true,
                accessor: b => b.address,
                cell: (_, b) => (
                    <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                        <span>{b.address ?? "—"}</span>
                        <span>{b.city ?? ""}</span>
                    </div>
                )
            },
            {
                id: "status",
                header: "Stato",
                width: "100px",
                hideOnPhone: true,
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
                        return <Skeleton height="14px" width="60%" radius="var(--radius-inner)" />;
                    }

                    if (state !== "resolved" || !activeCatalog) {
                        return (
                            <Text variant="body-sm" colorVariant="muted">
                                {state === "none"
                                    ? ACTIVE_CATALOG_NONE_SHORT_LABEL
                                    : ACTIVE_CATALOG_ERROR_LABEL}
                            </Text>
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
                                <span className={styles.catalogWarning}>
                                    <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
                                    <Text as="span" variant="caption" colorVariant="muted">
                                        {overrideSummary}
                                    </Text>
                                </span>
                            )}
                        </div>
                    );
                }
            },
            {
                id: "manage",
                header: "",
                width: "110px",
                hideOnPhone: true,
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
                            variant="secondary"
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
                                    onClick: () => {
                                        void navigator.clipboard.writeText(publicUrl);
                                        showToast({ message: "Link copiato negli appunti.", type: "success" });
                                    }
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
        [activeCatalogsMap, catalogsStatus, onManageAvailability, onEdit, onDelete, navigate, businessId, showToast, pendingReservationsMap]
    );

    if (!isLoading && businesses.length === 0) {
        if (hasActiveFilter) {
            return (
                <EmptyState
                    variant="filtered"
                    title="Nessun risultato"
                    description="Nessuna sede corrisponde alla ricerca."
                    onClearFilters={onClearFilters}
                />
            );
        }
        return (
            <EmptyState
                variant="page"
                icon={<MapPin />}
                title="Le sedi sono i locali che i clienti raggiungono con il QR"
                description="Ogni sede ha il suo indirizzo e il suo link pubblico. Se gestisci più locali, li trovi tutti qui."
                action={
                    onCreateClick ? (
                        <Button variant="primary" onClick={onCreateClick}>
                            Aggiungi la prima sede
                        </Button>
                    ) : undefined
                }
            />
        );
    }

    if (viewMode === "list") {
        // Niente selezione multipla / bulk delete qui: eliminare una sede è
        // terminale, non libera posti pagati e può far passare in bozza
        // regole di Programmazione di ALTRE sedi (target azzerati). Decisione
        // presa esplicitamente — solo delete di riga (kebab → Elimina).
        return (
            <DataTable
                data={businesses}
                columns={columns}
                isLoading={isLoading}
                onRowClick={business => navigate(`/business/${businessId}/locations/${business.id}`)}
            />
        );
    }

    return (
        <LocationsGrid
            businesses={businesses}
            isLoading={isLoading}
            onEdit={onEdit}
            onDelete={onDelete}
            activeCatalogsMap={activeCatalogsMap}
            catalogsStatus={catalogsStatus}
            onManageAvailability={onManageAvailability}
            pendingReservationsMap={pendingReservationsMap}
        />
    );
};
