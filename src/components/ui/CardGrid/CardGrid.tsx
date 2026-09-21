import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import styles from "./CardGrid.module.scss";

/**
 * CardGrid — cose che si scelgono guardandole (design system §5, scheda
 * CardGrid): sedi, stili, storie, campioni di stile.
 *
 * Griglia di card con area media sopra (immagine, anteprima, QR) · titolo ·
 * una riga · StatusBadge o Badge · azioni al hover (o nel TableRowActions).
 * 3 colonne → 2 sotto 1024 → 1 sotto 768; gap 16; media 16:10; padding 16;
 * raggio `radius-surface`. Nessun lift: le card non si sollevano.
 *
 * Stati: `loading` = card Skeleton; vuoto = la pagina rende `EmptyState page`
 * (serve un'azione, e la decide la pagina); `selected` = bordo brand;
 * `suspended` = StatusBadge danger dal chiamante, media attenuata qui.
 * Lo switch griglia/lista (SegmentedControl sm) vive nell'header band della
 * pagina, non qui.
 *
 * Non per elenchi di dati (→ DataTable), non per liste con un chevron
 * (→ ListRow), non per un form a colonne (→ FormGrid).
 */
export interface CardGridProps {
    /** Card Skeleton al posto dei figli. */
    loading?: boolean;
    /** Quante card Skeleton (default 6 = due righe a 3 colonne). */
    skeletonCount?: number;
    className?: string;
    children?: ReactNode;
    "aria-label"?: string;
}

export function CardGrid({ loading = false, skeletonCount = 6, className, children, "aria-label": ariaLabel }: CardGridProps) {
    return (
        <div className={`${styles.grid} ${className ?? ""}`.trim()} role="list" aria-label={ariaLabel} aria-busy={loading || undefined}>
            {loading
                ? Array.from({ length: skeletonCount }, (_, i) => <CardGridSkeleton key={i} />)
                : children}
        </div>
    );
}

function CardGridSkeleton() {
    return (
        <div className={styles.item} role="listitem" aria-hidden="true">
            <div className={styles.surface}>
                <div className={styles.media}>
                    <Skeleton className={styles.mediaSkeleton} radius="0" />
                </div>
                <div className={styles.body}>
                    <Skeleton width="60%" height={14} radius="var(--radius-inner)" />
                    <Skeleton width="40%" height={12} radius="var(--radius-inner)" />
                </div>
            </div>
        </div>
    );
}

export interface CardGridItemProps {
    /** Immagine di copertina; in alternativa `media` per anteprime, QR, campioni. */
    image?: string;
    imageAlt?: string;
    /** Contenuto libero dell'area media (16:10). Vince su `image`. */
    media?: ReactNode;
    title: ReactNode;
    /** Una riga muta, con ellissi. */
    subtitle?: ReactNode;
    /** StatusBadge o Badge, sotto il titolo. */
    badge?: ReactNode;
    /** Azioni: compaiono al hover / focus-within (IconButton ghost, TableRowActions). */
    actions?: ReactNode;
    /** Bordo `brand-primary`. */
    selected?: boolean;
    /** Media attenuata; il chiamante mette lo StatusBadge danger nel badge. */
    suspended?: boolean;
    onClick?: (event: MouseEvent<HTMLElement>) => void;
    /** Link interno (react-router). */
    to?: string;
    className?: string;
    "aria-label"?: string;
}

export function CardGridItem({
    image,
    imageAlt = "",
    media,
    title,
    subtitle,
    badge,
    actions,
    selected = false,
    suspended = false,
    onClick,
    to,
    className,
    "aria-label": ariaLabel
}: CardGridItemProps) {
    const interactive = Boolean(onClick) || Boolean(to);
    const classes = [
        styles.item,
        interactive ? styles.interactive : "",
        selected ? styles.selected : "",
        suspended ? styles.suspended : "",
        className ?? ""
    ]
        .join(" ")
        .trim();

    const mediaNode = media ?? (image ? <img className={styles.image} src={image} alt={imageAlt} loading="lazy" /> : null);

    const body = (
        <>
            <div className={styles.media}>
                <div className={styles.mediaInner}>{mediaNode}</div>
            </div>
            <div className={styles.body}>
                <Text as="div" variant="body-sm" weight={500} className={styles.title}>
                    {title}
                </Text>
                {subtitle && (
                    <Text as="div" variant="caption" colorVariant="muted" className={styles.subtitle}>
                        {subtitle}
                    </Text>
                )}
                {badge && <div className={styles.badge}>{badge}</div>}
            </div>
        </>
    );

    // Le azioni stanno fuori dall'elemento cliccabile: un bottone dentro un
    // link o un role=button è markup invalido e ruba il click.
    const actionsNode = actions ? (
        <div className={styles.actions} onClick={e => e.stopPropagation()}>
            {actions}
        </div>
    ) : null;

    if (to) {
        return (
            <div className={classes} role="listitem">
                <Link to={to} className={styles.surface} aria-current={selected || undefined} aria-label={ariaLabel}>
                    {body}
                </Link>
                {actionsNode}
            </div>
        );
    }

    if (onClick) {
        const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick(event as unknown as MouseEvent<HTMLElement>);
            }
        };
        return (
            <div className={classes} role="listitem">
                <div
                    role="button"
                    tabIndex={0}
                    className={styles.surface}
                    onClick={onClick}
                    onKeyDown={onKeyDown}
                    aria-pressed={selected || undefined}
                    aria-label={ariaLabel}
                >
                    {body}
                </div>
                {actionsNode}
            </div>
        );
    }

    return (
        <div className={classes} role="listitem" aria-label={ariaLabel}>
            <div className={styles.surface}>{body}</div>
            {actionsNode}
        </div>
    );
}
