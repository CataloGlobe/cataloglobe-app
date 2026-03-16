import React from "react";
import Text from "@components/ui/Text/Text";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical, ExternalLink, Link, FileText, Edit, Trash2, Calendar, Building2 } from "lucide-react";
import type { BusinessCardProps } from "@/types/Businesses";
import styles from "./BusinessCard.module.scss";
import { Button } from "@/components/ui";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge/Badge";

export const BusinessCard: React.FC<BusinessCardProps> = ({
    business,
    onEdit,
    onDelete,
    activeCatalog,
    catalogsLoading,
    onManageAvailability
}) => {
    const publicUrl = `${window.location.origin}/${business.slug}`;
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();

    const handleCardClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) {
            return;
        }
        navigate(`/business/${businessId}/locations/${business.id}`);
    };

    const handleCopyLink = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(publicUrl);
        // Toast?
    };

    return (
        <article className={styles.card} onClick={handleCardClick}>
                {business.cover_image ? (
                    <img
                        className={styles.thumbnail}
                        src={business.cover_image}
                        alt={`Copertina di ${business.name}`}
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className={styles.thumbnailPlaceholder}>
                        <Building2 size={32} strokeWidth={1.5} />
                    </div>
                )}

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
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <button
                                        className={styles.menuTrigger}
                                        aria-label="Azioni sede"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <MoreVertical size={16} />
                                    </button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                    <DropdownMenu.Content
                                        className={styles.menuContent}
                                        align="end"
                                        sideOffset={6}
                                    >
                                        <DropdownMenu.Item
                                            className={styles.menuItem}
                                            onClick={() =>
                                                navigate(
                                                    `/business/${businessId}/locations/${business.id}`
                                                )
                                            }
                                        >
                                            Apri dettaglio
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Item
                                            className={styles.menuItem}
                                            onClick={e => {
                                                e.stopPropagation();
                                                window.open(
                                                    publicUrl,
                                                    "_blank",
                                                    "noopener,noreferrer"
                                                );
                                            }}
                                        >
                                            Apri URL pubblico
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Item
                                            className={styles.menuItem}
                                            onClick={handleCopyLink}
                                        >
                                            Copia link
                                        </DropdownMenu.Item>

                                        <DropdownMenu.Separator className={styles.menuSeparator} />

                                        <DropdownMenu.Item
                                            className={styles.menuItem}
                                            onClick={e => {
                                                e.stopPropagation();
                                                onEdit(business);
                                            }}
                                        >
                                            Modifica
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Item
                                            className={`${styles.menuItem} ${styles.menuDanger}`}
                                            onClick={e => {
                                                e.stopPropagation();
                                                onDelete(business.id);
                                            }}
                                        >
                                            Elimina
                                        </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        </div>

                        <Text variant="body-sm" colorVariant="muted" className={styles.address}>
                            {business.address}, {business.city}
                        </Text>
                    </div>

                    <div className={styles.catalogInfo}>
                        <div className={styles.catalogLabel}>
                            {catalogsLoading ? (
                                <>
                                    <Text variant="caption" colorVariant="muted">
                                        Catalogo attivo
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        Caricamento...
                                    </Text>
                                </>
                            ) : activeCatalog ? (
                                <>
                                    <Text variant="caption" colorVariant="muted">
                                        Catalogo attivo ora
                                    </Text>
                                    <Text variant="caption" weight={600}>
                                        {activeCatalog.catalogName}
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Text variant="caption" colorVariant="muted">
                                        Catalogo attivo
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        Nessuno
                                    </Text>
                                </>
                            )}
                        </div>
                        {!catalogsLoading && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={e => {
                                    e.stopPropagation();
                                    onManageAvailability?.(business.id, business.name);
                                }}
                            >
                                {activeCatalog ? "Gestisci" : "Configura"}
                            </Button>
                        )}
                    </div>
                </div>
        </article>
    );
};
