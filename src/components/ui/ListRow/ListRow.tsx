import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import styles from "./ListRow.module.scss";

/**
 * ListRow — una riga in una lista di cose, ognuna con un nome e una o due
 * informazioni (design system §5, scheda ListRow).
 *
 * Anatomia: leading (icona 20, avatar, QR, spunta, checkbox) · title ·
 * subtitle (una riga con ellissi) · meta (Badge, StatusBadge, cifra) ·
 * trailing (chevron, Switch, Button ghost sm, TableRowActions).
 *
 * Altezza `row-height` (56, = riga di tabella), padding 0 16, gap 12;
 * `dense` porta a `row-height-dense` (48) gli elenchi di servizio (agenda,
 * sala), che sono lunghi e si leggono a colpo d'occhio.
 * divisore 1px fra righe adiacenti. Vive in `Card flush` o nudo in un drawer.
 * Ogni riga porta `data-list-row`: è il segnale con cui la Card capisce che il
 * suo body è una lista e annulla il proprio gap — il divisore separa le righe,
 * lo spazio in mezzo no (prima ogni pagina se lo azzerava da sé).
 * Hover solo se cliccabile (`onClick` o `to`). Chi mette un controllo nel
 * trailing di una riga cliccabile ferma lui la propagazione del click.
 * `muted` è solo l'aspetto: la voce a zero senza `onClick` resta ferma, la
 * riga spenta ma consultabile (una richiesta scaduta, una prenotazione
 * annullata) con `onClick` si apre come le altre.
 *
 * Non per colonne da ordinare/filtrare (→ DataTable), non per scelte a
 * immagine (→ CardGrid), non per un form (→ FormField).
 */
interface ListRowBaseProps {
    leading?: ReactNode;
    /** Una riga muta, con ellissi. */
    subtitle?: ReactNode;
    /** Il sottotitolo va a capo fino a due righe invece di troncarsi: per
     *  le righe in cui è una spiegazione (Checklist), non un dato.
     *  `"full"`: va a capo senza limite — per il dato che non si può tagliare
     *  (le aggiunte e le note di un articolo nel dettaglio della comanda). */
    wrapSubtitle?: boolean | "full";
    /** Badge, StatusBadge, cifra. */
    meta?: ReactNode;
    /** Il meta resta in riga anche sotto 768, invece di scendere sotto il
     *  titolo: per una cifra corta (un importo, una quantità), non per un
     *  gruppo di badge. */
    metaInline?: boolean;
    trailing?: ReactNode;
    /** Riga cliccabile: hover, focus, Enter/Spazio. */
    onClick?: (event: MouseEvent<HTMLElement>) => void;
    /** Riga che è un link interno (react-router). */
    to?: string;
    /** Selezionata: sfondo `brand-primary-soft`. */
    selected?: boolean;
    /** Spenta: testo e icona muti. Solo aspetto — con `onClick`/`to` la riga
     *  resta cliccabile (la scaduta si apre), senza è la voce a zero, ferma. */
    muted?: boolean;
    /** Riga a 48 invece che a 56: elenchi di servizio lunghi, non gestione. */
    dense?: boolean;
    className?: string;
    "aria-label"?: string;
}

interface ListRowContentProps extends ListRowBaseProps {
    title: ReactNode;
    loading?: false;
}

/** Caricamento: Skeleton della riga (leading, titolo, sottotitolo). */
interface ListRowLoadingProps extends ListRowBaseProps {
    title?: ReactNode;
    loading: true;
}

export type ListRowProps = ListRowContentProps | ListRowLoadingProps;

export function ListRow({
    leading,
    title,
    subtitle,
    wrapSubtitle = false,
    meta,
    metaInline = false,
    trailing,
    onClick,
    to,
    selected = false,
    muted = false,
    loading = false,
    dense,
    className,
    "aria-label": ariaLabel
}: ListRowProps) {
    if (loading) {
        return (
            <div className={`${styles.row} ${className ?? ""}`.trim()} data-list-row="" aria-busy="true">
                <div className={styles.leading}>
                    <Skeleton width={20} height={20} radius="50%" />
                </div>
                <div className={styles.body}>
                    <Skeleton width="40%" height={14} radius="var(--radius-inner)" />
                    <Skeleton width="60%" height={12} radius="var(--radius-inner)" />
                </div>
            </div>
        );
    }

    const interactive = Boolean(onClick) || Boolean(to);
    const classes = [
        styles.row,
        interactive ? styles.interactive : "",
        selected ? styles.selected : "",
        muted ? styles.muted : "",
        metaInline ? styles.metaInline : "",
        dense ? styles.dense : "",
        className ?? ""
    ]
        .join(" ")
        .trim();

    const content = (
        <>
            {leading && <div className={styles.leading}>{leading}</div>}
            <div className={styles.body}>
                <Text as="div" variant="body-sm" weight={500} className={styles.title}>
                    {title}
                </Text>
                {subtitle && (
                    <Text
                        as="div"
                        variant="caption"
                        colorVariant="muted"
                        className={
                            wrapSubtitle === "full"
                                ? styles.subtitleFull
                                : wrapSubtitle
                                  ? styles.subtitleWrap
                                  : styles.subtitle
                        }
                    >
                        {subtitle}
                    </Text>
                )}
            </div>
            {meta && <div className={styles.meta}>{meta}</div>}
            {trailing && <div className={styles.trailing}>{trailing}</div>}
        </>
    );

    if (to) {
        return (
            <Link to={to} className={classes} data-list-row="" aria-current={selected || undefined} aria-label={ariaLabel}>
                {content}
            </Link>
        );
    }

    if (interactive) {
        const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.(event as unknown as MouseEvent<HTMLElement>);
            }
        };
        return (
            <div
                role="button"
                tabIndex={0}
                className={classes}
                data-list-row=""
                onClick={onClick}
                onKeyDown={onKeyDown}
                aria-pressed={selected || undefined}
                aria-label={ariaLabel}
            >
                {content}
            </div>
        );
    }

    return (
        <div className={classes} data-list-row="" aria-label={ariaLabel}>
            {content}
        </div>
    );
}
