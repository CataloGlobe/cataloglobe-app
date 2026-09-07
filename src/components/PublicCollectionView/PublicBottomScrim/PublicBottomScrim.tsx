import styles from "./PublicBottomScrim.module.scss";

/**
 * Scrim + blur progressivo sul bordo inferiore della pagina pubblica mobile.
 *
 * Componente puro: nessuno stato, nessun listener, nessun effect. Tutto
 * l'effetto è CSS (vedi .module.scss). Vive come sibling di PublicBottomBar,
 * figlio diretto di `main.page`, con la stessa condizione di mount della barra.
 *
 * - Strato A (`.scrim`): gradiente `rgba(var(--pub-bg-rgb), 1 → 0)` dal bordo
 *   inferiore verso l'alto.
 * - Strato B (`.layer1..3`): 3 layer `backdrop-filter` mascherati con
 *   `mask-image` per ammorbidire il bordo superiore dello scrim.
 *
 * `data-blur` è deliberato e NON configurabile (niente prop, query param o
 * stato): attributo statico, toggleabile dal Web Inspector per un confronto A/B
 * dal vivo senza rebuild. Default `"off"`: sul device reale (iPhone, Safari,
 * foto prodotto vere) on/off non produce differenza percepibile — sotto la
 * curva alpha dello scrim non resta abbastanza contenuto da sfocare, quindi i
 * layer costavano composizione (fascia fixed sopra contenuto che scrolla) senza
 * resa. Markup e regole SCSS dei layer restano per un eventuale riesame su
 * stili con `pageBackground` scuro: `data-blur="on"` dal DevTools li riaccende.
 *
 * `isPreview`: nello Style Editor lo scroll container è `.deviceScreen`, non
 * la finestra → `position: sticky` invece di `fixed` (stesso pattern di
 * `.barWrap[data-preview]` in PublicBottomBar).
 */
type Props = {
    isPreview?: boolean;
};

export default function PublicBottomScrim({ isPreview = false }: Props) {
    return (
        <div
            className={styles.root}
            aria-hidden="true"
            data-preview={isPreview ? "true" : undefined}
            data-blur="off"
        >
            <div className={styles.layer1} />
            <div className={styles.layer2} />
            <div className={styles.layer3} />
            <div className={styles.scrim} />
        </div>
    );
}
