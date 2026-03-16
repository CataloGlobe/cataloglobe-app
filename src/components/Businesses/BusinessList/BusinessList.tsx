import React, { useMemo } from "react";
import Text from "@components/ui/Text/Text";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { LocationsGrid } from "../LocationsGrid/LocationsGrid";
import type { BusinessListProps, BusinessWithCapabilities } from "@/types/Businesses";
import styles from "./BusinessList.module.scss";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Badge } from "@/components/ui/Badge/Badge";
import { IconButton } from "@/components/ui/Button/IconButton";
import { ExternalLink, Link, FileText, Edit, Trash2, Calendar, ClipboardCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useNavigate, useParams } from "react-router-dom";

export const BusinessList: React.FC<BusinessListProps> = ({
    businesses,
    viewMode = "grid",
    onEdit,
    onDelete,
    onOpenReviews,
    activeCatalogsMap,
    catalogsLoading,
    onManageAvailability,
    onCreateClick
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
                        <Text weight={600}>{business.name}</Text>
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
                accessor: b => b.address
            },
            {
                id: "city",
                header: "Città",
                width: "1fr",
                accessor: b => b.city
            },
            {
                id: "status",
                header: "Stato",
                width: "100px",
                align: "center",
                cell: (_, business) => (
                    <Badge variant={business.status === "active" ? "success" : "secondary"}>
                        {business.status === "active" ? "Attiva" : "Inattiva"}
                    </Badge>
                )
            },
            {
                id: "catalog",
                header: "Catalogo attivo",
                width: "1.5fr",
                cell: (_, business) => {
                    const activeCatalog = activeCatalogsMap?.[business.id];
                    return <Text variant="body-sm">{activeCatalog?.catalogName ?? "—"}</Text>;
                }
            },
            {
                id: "actions",
                header: "",
                width: "100px",
                align: "right",
                cell: (_, business) => {
                    const activeCatalog = activeCatalogsMap?.[business.id];
                    const publicUrl = `${window.location.origin}/${business.slug}`;

                    return (
                        <div className={styles.actionsCell} onClick={e => e.stopPropagation()}>
                            {activeCatalog && (
                                <IconButton
                                    icon={<ClipboardCheck size={18} />}
                                    variant="ghost"
                                    onClick={() =>
                                        onManageAvailability?.(business.id, business.name)
                                    }
                                    aria-label="Gestisci disponibilità"
                                    title="Gestisci disponibilità"
                                />
                            )}
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
                                        label: "Gestisci disponibilità",
                                        icon: Calendar,
                                        onClick: () =>
                                            onManageAvailability?.(business.id, business.name),
                                        hidden: !activeCatalog
                                    },
                                    {
                                        label: "Modifica",
                                        icon: Edit,
                                        onClick: () => onEdit(business),
                                        separator: true
                                    },
                                    {
                                        label: "Elimina",
                                        icon: Trash2,
                                        onClick: () => onDelete(business.id),
                                        variant: "destructive"
                                    }
                                ]}
                            />
                        </div>
                    );
                }
            }
        ],
        [activeCatalogsMap, onManageAvailability, onEdit, onDelete, navigate]
    );

    const handleBulkDelete = (selectedIds: string[]) => {
        selectedIds.forEach(id => onDelete(id));
    };

    if (businesses.length === 0) {
        return (
            <EmptyState
                icon={<MapPin size={40} strokeWidth={1.5} />}
                title="Non hai ancora aggiunto sedi"
                description="Le sedi rappresentano i tuoi punti vendita o ristoranti."
                action={
                    onCreateClick ? (
                        <Button variant="primary" onClick={onCreateClick}>
                            + Aggiungi la prima sede
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
                selectable
                onBulkDelete={handleBulkDelete}
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
            catalogsLoading={catalogsLoading}
            onManageAvailability={onManageAvailability}
        />
    );
};
