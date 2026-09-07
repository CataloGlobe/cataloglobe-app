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
 * `data-blur="on"` è deliberato e NON configurabile (niente prop, query param
 * o stato): serve solo a disattivare i 3 layer blur dal Web Inspector su
 * iPhone reale (`data-blur="off"`) per un confronto A/B dal vivo senza rebuild.
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
            data-blur="on"
        >
            <div className={styles.layer1} />
            <div className={styles.layer2} />
            <div className={styles.layer3} />
            <div className={styles.scrim} />
        </div>
    );
}
