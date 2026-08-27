import React from "react";
import Text from "@components/ui/Text/Text";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical, Building2, Clock, AlertTriangle } from "lucide-react";
import type { BusinessCardProps } from "@/types/Businesses";
import styles from "./BusinessCard.module.scss";
import { Button } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { formatInactiveReason } from "@/utils/activityStatus";
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

export const BusinessCard: React.FC<BusinessCardProps> = ({
    business,
    onEdit,
    onDelete,
    activeCatalog,
    catalogsStatus = "loading",
    onManageAvailability
}) => {
    const publicUrl = buildPublicUrl(business.slug);
    const catalogState = deriveActiveCatalogState(catalogsStatus, activeCatalog);
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
        <article
            className={`${styles.card} ${business.status === "inactive" ? styles.cardInactive : ""}`}
            onClick={handleCardClick}
        >
            <div className={styles.imageWrapper}>
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
                {business.status === "inactive" && (
                    <div className={styles.imageOverlay}>
                        {business.inactive_reason && (
                            <span className={styles.overlayPill}>
                                {formatInactiveReason(business.inactive_reason)}
                            </span>
                        )}
                    </div>
                )}
                <div className={styles.statusBadgeOverlay}>
                    {business.status === "inactive" ? (
                        <StatusBadge variant="neutral" label="Sospesa" />
                    ) : (
                        <StatusBadge variant="success" label="Pubblicata" />
                    )}
                </div>
            </div>

            <div className={styles.cardContent}>
                <div className={styles.mainInfo}>
                    <div className={styles.titleRow}>
                        <Text as="h3" variant="title-sm" weight={700} className={styles.entityName}>
                            {business.name}
                        </Text>
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
                                            window.open(publicUrl, "_blank", "noopener,noreferrer");
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
                                    {onDelete && (
                                        <DropdownMenu.Item
                                            className={`${styles.menuItem} ${styles.menuDanger}`}
                                            onClick={e => {
                                                e.stopPropagation();
                                                onDelete(business.id);
                                            }}
                                        >
                                            Elimina
                                        </DropdownMenu.Item>
                                    )}
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    </div>

                    <Text variant="body-sm" colorVariant="muted" className={styles.address}>
                        {business.address}, {business.city}
                    </Text>
                </div>

                <div className={styles.divider} />

                {/* Un solo blocco per tutti e quattro gli stati: la variante è
                    il testo, non la struttura. L'icona 26px fissa l'altezza
                    della riga, quindi skeleton, nome, "nessuno" ed errore
                    occupano lo stesso spazio — la card non salta quando il dato
                    arriva. */}
                <div className={styles.catalogFooter} data-state={catalogState}>
                    <div className={styles.catalogFooterMain}>
                        <div className={styles.catalogFooterLeft}>
                            <span className={styles.catalogIcon}>
                                <Clock size={14} strokeWidth={2} />
                            </span>
                            <div className={styles.catalogText}>
                                <Text variant="caption" className={styles.catalogFooterLabel}>
                                    Menu attivo ora
                                </Text>
                                {catalogState === "loading" ? (
                                    <Skeleton
                                        height="13px"
                                        width="118px"
                                        radius="6px"
                                        className={styles.catalogValueSkeleton}
                                    />
                                ) : catalogState === "resolved" ? (
                                    <Text
                                        variant="caption"
                                        weight={600}
                                        className={styles.catalogName}
                                    >
                                        {activeCatalogDisplayName(activeCatalog)}
                                    </Text>
                                ) : (
                                    <Text
                                        variant="caption"
                                        colorVariant="muted"
                                        className={styles.catalogName}
                                    >
                                        {catalogState === "error"
                                            ? ACTIVE_CATALOG_ERROR_LABEL
                                            : ACTIVE_CATALOG_NONE_SHORT_LABEL}
                                    </Text>
                                )}
                            </div>
                        </div>
                        {/* Anche a stato ignoto: il drawer riceve solo
                            `activityId` e risolve il catalogo per conto suo,
                            quindi negare l'accesso su una risoluzione fallita
                            toglierebbe un'azione che funziona. Nascosta invece
                            a `loading` e `none`, dove non c'è nulla su cui
                            operare. */}
                        {(catalogState === "resolved" || catalogState === "error") && (
                            <Button
                                variant="primary"
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
                    {(() => {
                        if (catalogState !== "resolved" || !activeCatalog) return null;
                        const overrideSummary = formatOverrideSummary(
                            activeCatalog.hiddenCount,
                            activeCatalog.unavailableCount
                        );
                        if (!overrideSummary) return null;
                        return (
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
                        );
                    })()}
                </div>
            </div>
        </article>
    );
};
