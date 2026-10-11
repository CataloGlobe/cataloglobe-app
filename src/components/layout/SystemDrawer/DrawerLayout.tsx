import { ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronUp, X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { IconButton } from "@/components/ui/Button/IconButton";
import { useDetailPaneNav } from "@/components/layout/DetailPane/DetailPaneContext";
import styles from "./DrawerLayout.module.scss";

export interface DrawerLayoutProps {
    /**
     * Header libero (markup del consumer). In alternativa `title` (+ `onClose`)
     * rende l'header canonico: titolo `title-sm` e chiudi `IconButton ghost`.
     */
    header?: ReactNode;
    /** Titolo dell'header canonico. Ignorato se `header` è passato. */
    title?: string;
    /** Con `title`: rende il bottone «Chiudi» a destra. */
    onClose?: () => void;
    /** Id del titolo canonico, da passare ad `aria-labelledby` del drawer. */
    titleId?: string;
    footer?: ReactNode;
    children: ReactNode;
    /**
     * Layout del body. Default `"block"` (comportamento storico: il body è un
     * flex-item scrollabile ma NON un flex-container). Passare `"flex"` quando
     * il contenuto deve propagare l'altezza bounded del body ai figli (es. un
     * DataTable con auto-size): il body diventa `display:flex; flex-direction:
     * column`. Opt-in per non alterare gli altri drawer.
     */
    bodyLayout?: "block" | "flex";
    /**
     * Opt-in: azzera il `padding-bottom` dell'header così che dei `<Tabs>` come
     * ultimo elemento dell'header appoggino l'indicatore esattamente sul divider
     * (border-bottom dell'header), senza gap. Default `false` → header invariato,
     * nessuna regressione sugli altri drawer. Usare SOLO quando l'header termina
     * con un gruppo Tabs.
     */
    headerFlush?: boolean;
}

export const DrawerLayout = ({
    header,
    title,
    onClose,
    titleId,
    footer,
    children,
    bodyLayout = "block",
    headerFlush = false
}: DrawerLayoutProps) => {
    // Dentro un dettaglio dal vivo (`DetailPane`): le frecce per il precedente
    // e il successivo, e al telefono «‹ Comande» al posto della X.
    const pane = useDetailPaneNav();
    const back = pane?.phone && onClose;
    // Le frecce restano ferme ai capi dell'elenco (spente), così «2 di 5» non
    // salta di posto; senza posizione compaiono solo quelle che servono.
    const stepping = Boolean(pane?.onPrev || pane?.onNext || (pane?.position && pane.position.total > 1));
    const headerContent =
        header ??
        (title ? (
            <div className={styles.headerRow}>
                {back && (
                    <button type="button" className={styles.back} onClick={onClose}>
                        <ChevronLeft size={18} aria-hidden="true" />
                        {pane.backLabel}
                    </button>
                )}
                {back ? (
                    <span className={styles.title} />
                ) : (
                    <Text as="h2" id={titleId} variant="title-sm" weight={600} className={styles.title}>
                        {title}
                    </Text>
                )}
                {(stepping || (onClose && !back)) && (
                    <div className={styles.headerActions} data-detail-nav={stepping || undefined}>
                        {stepping && (
                            <IconButton
                                icon={<ChevronUp size={18} />}
                                aria-label="Precedente"
                                title="Precedente (tasto ↑)"
                                variant="ghost"
                                size="sm"
                                onClick={pane?.onPrev}
                                disabled={!pane?.onPrev}
                            />
                        )}
                        {pane?.position && (
                            <Text as="span" variant="caption" colorVariant="muted" className={styles.position}>
                                {pane.position.index + 1} di {pane.position.total}
                            </Text>
                        )}
                        {stepping && (
                            <IconButton
                                icon={<ChevronDown size={18} />}
                                aria-label="Successivo"
                                title="Successivo (tasto ↓)"
                                variant="ghost"
                                size="sm"
                                onClick={pane?.onNext}
                                disabled={!pane?.onNext}
                            />
                        )}
                        {onClose && !back && (
                            <IconButton icon={<X size={18} />} aria-label="Chiudi" variant="ghost" size="sm" onClick={onClose} />
                        )}
                    </div>
                )}
            </div>
        ) : null);

    return (
        <div className={styles.container}>
            {headerContent && (
                <div className={styles.header} data-header-flush={headerFlush || undefined}>
                    {headerContent}
                    {/* Al telefono il titolo scende sotto «‹ Comande» e le frecce:
                        accanto non ci stava (D141). */}
                    {back && title && (
                        <Text as="h2" id={titleId} variant="title-sm" weight={600} className={styles.phoneTitle}>
                            {title}
                        </Text>
                    )}
                </div>
            )}
            <div className={styles.body} data-body-layout={bodyLayout}>{children}</div>
            {footer && <div className={styles.footer}>{footer}</div>}
        </div>
    );
};
