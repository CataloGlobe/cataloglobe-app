import React, { useMemo } from "react";
import Text from "@components/ui/Text/Text";
import { BusinessCard } from "../BusinessCard/BusinessCard";
import type { BusinessListProps, BusinessWithCapabilities } from "@/types/Businesses";
import styles from "./BusinessList.module.scss";
import clsx from "clsx";
import { DataTable, ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { Badge } from "@/components/ui/Badge/Badge";
import { IconButton } from "@/components/ui/Button/IconButton";
import {
    MoreVertical,
    ExternalLink,
    Link,
    FileText,
    Edit,
    Trash2,
    Calendar,
    ClipboardCheck
} from "lucide-react";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import { DropdownSeparator } from "@/components/ui/DropdownMenu/DropdownSeparator";
import { useNavigate } from "react-router-dom";

export const BusinessList: React.FC<BusinessListProps> = ({
    businesses,
    viewMode = "grid",
    onEdit,
    onDelete,
    onOpenReviews,
    activeCatalogsMap,
    onManageAvailability
}) => {
    const navigate = useNavigate();

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

                    const handleCopyLink = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(publicUrl);
                    };

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
                            <DropdownMenu
                                placement="bottom-end"
                                trigger={
                                    <IconButton
                                        icon={<MoreVertical size={18} />}
                                        variant="ghost"
                                        aria-label="Azioni"
                                    />
                                }
                            >
                                <DropdownItem
                                    onClick={() => navigate(`/dashboard/attivita/${business.id}`)}
                                >
                                    <FileText size={16} />
                                    Apri dettaglio
                                </DropdownItem>
                                <DropdownItem
                                    href={publicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <ExternalLink size={16} />
                                    Apri URL pubblico
                                </DropdownItem>
                                <DropdownItem onClick={handleCopyLink}>
                                    <Link size={16} />
                                    Copia link
                                </DropdownItem>
                                {activeCatalog && (
                                    <DropdownItem
                                        onClick={() =>
                                            onManageAvailability?.(business.id, business.name)
                                        }
                                    >
                                        <Calendar size={16} />
                                        Gestisci disponibilità
                                    </DropdownItem>
                                )}
                                <DropdownSeparator />
                                <DropdownItem onClick={() => onEdit(business)}>
                                    <Edit size={16} />
                                    Modifica
                                </DropdownItem>
                                <DropdownItem danger onClick={() => onDelete(business.id)}>
                                    <Trash2 size={16} />
                                    Elimina
                                </DropdownItem>
                            </DropdownMenu>
                        </div>
                    );
                }
            }
        ],
        [activeCatalogsMap, onManageAvailability, onEdit, onDelete, navigate]
    );

    if (businesses.length === 0) {
        return (
            <div className={styles.emptyState}>
                <Text as="h3" variant="title-sm" weight={600}>
                    Nessuna attività trovata
                </Text>
                <Text variant="body" colorVariant="muted">
                    Aggiungi una nuova attività usando il form sulla sinistra.
                </Text>
            </div>
        );
    }

    if (viewMode === "list") {
        return (
            <DataTable
                data={businesses}
                columns={columns}
                onRowClick={business => navigate(`/dashboard/attivita/${business.id}`)}
            />
        );
    }

    return (
        <div className={clsx(styles.listWrapper, styles.grid)}>
            {businesses.map(business => (
                <BusinessCard
                    key={business.id}
                    business={business}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onOpenReviews={onOpenReviews}
                    activeCatalog={activeCatalogsMap?.[business.id]}
                    onManageAvailability={onManageAvailability}
                />
            ))}
        </div>
    );
};
