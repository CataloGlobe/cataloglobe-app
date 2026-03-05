import React, { useState } from "react";
import BusinessOverrides from "../BusinessOverrides/BusinessOverrides";
import Text from "@components/ui/Text/Text";
import { MoreVertical, ExternalLink, Link, FileText, Edit, Trash2, Calendar } from "lucide-react";
import type { BusinessCardProps } from "@/types/Businesses";
import styles from "./BusinessCard.module.scss";
import BusinessCollectionSchedule from "../BusinessCollectionSchedule/BusinessCollectionSchedule";
import { Button } from "@/components/ui";
import { IconButton } from "@/components/ui/Button/IconButton";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge/Badge";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import { DropdownSeparator } from "@/components/ui/DropdownMenu/DropdownSeparator";

export const BusinessCard: React.FC<BusinessCardProps> = ({
    business,
    onEdit,
    onDelete,
    activeCatalog,
    onManageAvailability
}) => {
    const publicUrl = `${window.location.origin}/${business.slug}`;
    const [overrideOpen, setOverrideOpen] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const navigate = useNavigate();

    const handleCardClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) {
            return;
        }
        navigate(`/dashboard/attivita/${business.id}`);
    };

    const handleCopyLink = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(publicUrl);
        // Toast?
    };

    return (
        <>
            <article className={styles.card} onClick={handleCardClick}>
                <div className={styles.cardHeader}>
                    <div className={styles.thumbnail}>
                        {business.cover_image ? (
                            <img src={business.cover_image} alt={`Copertina di ${business.name}`} />
                        ) : (
                            <div className={styles.thumbnailPlaceholder} />
                        )}
                    </div>
                    <div className={styles.menuWrapper}>
                        <DropdownMenu
                            placement="bottom-end"
                            trigger={
                                <IconButton
                                    icon={<MoreVertical size={18} />}
                                    aria-label="Azioni attività"
                                    variant="ghost"
                                />
                            }
                        >
                            <DropdownItem
                                onClick={() => navigate(`/dashboard/attivita/${business.id}`)}
                            >
                                Apri dettaglio
                            </DropdownItem>
                            <DropdownItem
                                href={publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Apri URL pubblico
                            </DropdownItem>
                            <DropdownItem onClick={handleCopyLink}>Copia link</DropdownItem>

                            <DropdownSeparator />

                            <DropdownItem onClick={() => onEdit(business)}>Modifica</DropdownItem>
                            <DropdownItem danger onClick={() => onDelete(business.id)}>
                                Elimina
                            </DropdownItem>
                        </DropdownMenu>
                    </div>
                </div>

                <div className={styles.cardContent}>
                    <div className={styles.mainInfo}>
                        <div className={styles.titleRow}>
                            <Text
                                as="h3"
                                variant="title-sm"
                                weight={700}
                                className={styles.entityName}
                            >
                                {business.name}
                            </Text>
                            <Badge variant={business.status === "active" ? "success" : "secondary"}>
                                {business.status === "active" ? "Attiva" : "Inattiva"}
                            </Badge>
                        </div>

                        <Text variant="body-sm" colorVariant="muted" className={styles.address}>
                            {business.address}, {business.city}
                        </Text>
                    </div>

                    <div className={styles.catalogInfo}>
                        <div className={styles.catalogLabel}>
                            <Text variant="caption" colorVariant="muted">
                                Catalogo attivo
                            </Text>
                            <Text variant="caption" weight={600}>
                                {activeCatalog?.catalogName ?? "—"}
                            </Text>
                        </div>
                        {activeCatalog && (
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
                        )}
                    </div>
                </div>
            </article>

            <BusinessOverrides
                isOpen={overrideOpen}
                onClose={() => setOverrideOpen(false)}
                businessId={business.id}
                title={`${business.name} - Disponibilità e prezzi`}
            />

            <BusinessCollectionSchedule
                isOpen={showScheduleModal}
                businessId={business.id}
                businessType={business.activity_type as any}
                onClose={() => setShowScheduleModal(false)}
            />
        </>
    );
};
