import { useLayoutEffect, useState, type ReactNode } from "react";
import styles from "./DeviceFrame.module.scss";

export type DeviceFrameFormat = "mobile" | "tablet" | "desktop";

const FRAME_DIMENSIONS: Record<DeviceFrameFormat, { width: number; height: number }> = {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 720 },
};

type DeviceFrameBaseProps = {
    /** Formato simulato. Dimensioni logiche fisse (vedi FRAME_DIMENSIONS). */
    format: DeviceFrameFormat;
    /** True durante il cambio di formato: applica il fade-out prima del remount. */
    isTransitioning?: boolean;
};

/** Modalità "children": l'albero React vive in-place dentro il frame (Style Editor). */
type DeviceFrameChildrenProps = DeviceFrameBaseProps & {
    children: ReactNode;
    /** Riceve l'elemento .deviceScreen (scroll container interno) al mount/unmount. */
    screenRef?: (el: HTMLDivElement | null) => void;
    iframeSrc?: never;
    iframeTitle?: never;
};

/** Modalità "iframe": il frame ospita una finestra reale (preview pagina pubblica). */
type DeviceFrameIframeProps = DeviceFrameBaseProps & {
    /** URL caricato nell'iframe. DEVE restare stabile al cambio di formato:
     *  il formato si ottiene ridimensionando il frame, non ricaricando. */
    iframeSrc: string;
    /** Titolo accessibile dell'iframe (obbligatorio per a11y). */
    iframeTitle: string;
    children?: never;
    screenRef?: never;
};

type DeviceFrameProps = DeviceFrameChildrenProps | DeviceFrameIframeProps;

/**
 * Device frame condiviso (mobile/tablet/desktop) — estratto da StylePreview
 * (Style Editor) per essere riusato anche dalla preview della pagina pubblica.
 *
 * Due modalità mutuamente esclusive (union di props):
 *  - `children`: albero React in-place. Usato dallo Style Editor sui suoi mock.
 *  - `iframeSrc`: finestra reale dentro un <iframe>. Usato dalla preview della
 *    pagina pubblica: dentro l'iframe `window`/`matchMedia`/`createPortal`
 *    lavorano nativamente sulle dimensioni del frame, quindi ogni componente
 *    (header, bottom-bar, PublicSheet, …) si comporta come su un dispositivo
 *    reale di quel formato senza alcuno scoping manuale.
 *
 * "mobile" resta a scala 1 (375px, sempre più stretto del contenitore reale
 * nei contesti d'uso attuali). "tablet"/"desktop" scalano via transform:scale
 * per adattarsi a contenitori più stretti delle loro dimensioni logiche,
 * preservando le misure reali sia per le container query (vedi
 * CollectionView.module.scss `@container collection`) sia per la window
 * dell'iframe (transform non altera la dimensione di layout → l'iframe vede
 * comunque i suoi px logici).
 *
 * NB struttura DOM: wrapper + frame + screen sono renderizzati SEMPRE, per
 * tutti i formati (il wrapper non è più condizionale come nella prima
 * estrazione). Un albero a profondità costante è ciò che permette a React di
 * riusare lo stesso nodo <iframe> quando cambia il formato: una struttura
 * variabile lo smonterebbe e rimonterebbe, causando un reload completo della
 * pagina ospitata — esattamente ciò che questo design vuole evitare.
 */
export default function DeviceFrame({
    format,
    isTransitioning = false,
    screenRef,
    iframeSrc,
    iframeTitle,
    children,
}: DeviceFrameProps) {
    const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const { width, height } = FRAME_DIMENSIONS[format];
    const scales = format !== "mobile";

    useLayoutEffect(() => {
        if (!scales || !hostEl) {
            setScale(1);
            return;
        }
        const compute = (w: number) => Math.min(1, w / width);
        // Compute synchronously on first observation to avoid a flash at scale 1
        setScale(compute(hostEl.getBoundingClientRect().width));

        const ro = new ResizeObserver(entries => {
            setScale(compute(entries[0]?.contentRect.width ?? 0));
        });
        ro.observe(hostEl);
        return () => ro.disconnect();
    }, [hostEl, width, scales]);

    const frameClassName = [
        styles.deviceFrame,
        format === "mobile" ? styles.deviceMobile : format === "tablet" ? styles.deviceTablet : styles.deviceDesktop,
        `preview-${format}`,
        isTransitioning ? styles.deviceFrameTransitioning : "",
    ]
        .filter(Boolean)
        .join(" ");

    const screen = iframeSrc ? (
        // Nessun key legato al formato: l'elemento deve sopravvivere al cambio
        // di formato (resize, non reload — vedi doc del componente).
        <iframe className={styles.deviceIframe} src={iframeSrc} title={iframeTitle} />
    ) : (
        <div className={styles.deviceScreen} ref={screenRef}>
            {children}
        </div>
    );

    // Modalità iframe (pagina pubblica): il frame vive nel flusso della pagina
    // (.hostFlow), non in un canvas a altezza fissa. Vedi nota in .module.scss.
    const hostClassName = iframeSrc ? `${styles.host} ${styles.hostFlow}` : styles.host;

    return (
        <div className={hostClassName} ref={setHostEl}>
            <div
                className={styles.deviceVisualWrapper}
                style={{ width: `${width * scale}px`, height: `${height * scale}px` }}
            >
                <div
                    className={frameClassName}
                    // Nessun transform quando non si scala: uno `scale(1)` inutile
                    // creerebbe un containing block per i discendenti position:fixed,
                    // cambiando il comportamento del ramo children (Style Editor).
                    style={scales ? { transform: `scale(${scale})`, transformOrigin: "top left" } : undefined}
                >
                    {screen}
                </div>
            </div>
        </div>
    );
}
