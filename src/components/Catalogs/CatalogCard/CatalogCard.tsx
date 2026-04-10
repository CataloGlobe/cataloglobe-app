import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical } from "lucide-react";
import Text from "@components/ui/Text/Text";
import type { V2Catalog, CatalogStats } from "@/services/supabase/catalogs";
import styles from "./CatalogCard.module.scss";

interface CatalogCardProps {
    catalog: V2Catalog;
    stats?: CatalogStats;
    statsLoading?: boolean;
    catalogLower?: string;
    onEdit: (catalog: V2Catalog) => void;
    onDelete: (catalog: V2Catalog) => void;
    onClick: (catalog: V2Catalog) => void;
}

export const CatalogCard: React.FC<CatalogCardProps> = ({
    catalog,
    stats,
    statsLoading,
    catalogLower = "catalogo",
    onEdit,
    onDelete,
    onClick
}) => {
    const formattedDate = new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(new Date(catalog.created_at));

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick(catalog);
        }
    };

    const categoryLabel =
        statsLoading || !stats
            ? "—"
            : `${stats.categoryCount} ${stats.categoryCount === 1 ? "categoria" : "categorie"}`;

    const productCount = statsLoading || !stats ? "—" : String(stats.productCount);

    return (
        <article
            className={styles.card}
            onClick={() => onClick(catalog)}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Apri catalogo ${catalog.name}`}
        >
            <div className={styles.preview}>
                <div className={styles.previewInner}>
                    <div className={styles.accentBar} />
                    <div className={styles.previewContent}>
                        <div className={styles.lines}>
                            <span className={`${styles.line} ${styles.lineFull}`} />
                            <span className={`${styles.line} ${styles.lineLg}`} />
                            <span className={`${styles.line} ${styles.lineMd}`} />
                            <span className={`${styles.line} ${styles.lineFull}`} />
                            <span className={`${styles.line} ${styles.lineSm}`} />
                        </div>
                        <div className={styles.thumbs}>
                            <span className={styles.thumb} />
                            <span className={styles.thumb} />
                            <span className={styles.thumb} />
                        </div>
                    </div>
                </div>
                <div className={styles.productBadge}>
                    <strong>{productCount}</strong> prodotti
                </div>
            </div>

            <div className={styles.body}>
                <div className={styles.titleRow}>
                    <Text as="h3" variant="title-sm" weight={700} className={styles.name}>
                        {catalog.name}
                    </Text>
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button
                                className={styles.menuTrigger}
                                aria-label="Azioni catalogo"
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
                                    onClick={e => {
                                        e.stopPropagation();
                                        onEdit(catalog);
                                    }}
                                >
                                    Modifica nome
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator className={styles.menuSeparator} />
                                <DropdownMenu.Item
                                    className={`${styles.menuItem} ${styles.menuDanger}`}
                                    onClick={e => {
                                        e.stopPropagation();
                                        onDelete(catalog);
                                    }}
                                >
                                    {`Elimina ${catalogLower}`}
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>

                <div className={styles.meta}>
                    <Text variant="caption" colorVariant="muted">
                        {categoryLabel}
                    </Text>
                    <Text variant="caption" colorVariant="muted">
                        Creato il {formattedDate}
                    </Text>
                </div>
            </div>
        </article>
    );
};
