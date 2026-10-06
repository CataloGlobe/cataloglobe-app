import { useLayoutEffect, useState, type ReactNode } from "react";
import styles from "./DeviceFrame.module.scss";

export type DeviceFrameFormat = "mobile" | "tablet" | "desktop";

const FRAME_DIMENSIONS: Record<DeviceFrameFormat, { width: number; height: number }> = {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 720 },
};

// Bezel (modalità iframe, pagina pubblica): spessore del bordo "dispositivo"
// per formato. Sta FUORI dalle dimensioni logiche (box-sizing: content-box
// su .deviceBezel), così l'iframe conserva esattamente 375/768 px di viewport
// e il wrapper riserva l'ingombro totale bordo incluso. Desktop: mai in
// modalità iframe (preview=desktop è un no-op), 0 per completezza del Record.
const BEZEL_WIDTH: Record<DeviceFrameFormat, number> = {
    mobile: 12,
    tablet: 14,
    desktop: 0,
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
    /**
     * `"contain"`: il frame scala per stare nell'host in larghezza E in
     * altezza, anche il mobile (Style Editor, canvas ad altezza vincolata).
     * Solo per host la cui altezza non dipende dal frame: altrimenti la scala
     * rimpicciolisce l'host e si rincorre. Default: solo larghezza, mobile a 1.
     */
    fit?: "contain";
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
    fit?: never;
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
 * "mobile" resta a scala 1 (375px), salvo `fit="contain"` (Style Editor:
 * scala anche lui, su larghezza e altezza del canvas). "tablet"/"desktop" scalano via transform:scale
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
    fit,
}: DeviceFrameProps) {
    const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const { width, height } = FRAME_DIMENSIONS[format];
    // `contain` vale solo per i figli: il ramo iframe (pagina pubblica) resta
    // com'era, mobile a scala 1 e gli altri adattati sulla sola larghezza.
    const contain = !iframeSrc && fit === "contain";
    const scales = contain || format !== "mobile";
    // Solo la modalità iframe ha il bezel: lo Style Editor (children) resta
    // con il bordo sottile originale, sono due contesti visivi distinti.
    const bezel = iframeSrc ? BEZEL_WIDTH[format] : 0;
    const outerWidth = width + bezel * 2;
    const outerHeight = height + bezel * 2;

    useLayoutEffect(() => {
        if (!scales || !hostEl) {
            setScale(1);
            return;
        }
        const compute = (w: number, h: number) =>
            contain ? Math.min(1, w / outerWidth, h / outerHeight) : Math.min(1, w / outerWidth);
        // Compute synchronously on first observation to avoid a flash at scale 1
        const rect = hostEl.getBoundingClientRect();
        setScale(compute(rect.width, rect.height));

        const ro = new ResizeObserver(entries => {
            const box = entries[0]?.contentRect;
            setScale(compute(box?.width ?? 0, box?.height ?? 0));
        });
        ro.observe(hostEl);
        return () => ro.disconnect();
    }, [hostEl, outerWidth, outerHeight, scales, contain]);

    // Il mobile non ha transform a scala 1: vedi la nota sul containing block.
    const transformed = scales && (format !== "mobile" || scale < 1);

    const frameClassName = [
        styles.deviceFrame,
        format === "mobile" ? styles.deviceMobile : format === "tablet" ? styles.deviceTablet : styles.deviceDesktop,
        `preview-${format}`,
        bezel > 0 ? styles.deviceBezel : "",
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
                style={{ width: `${outerWidth * scale}px`, height: `${outerHeight * scale}px` }}
            >
                <div
                    className={frameClassName}
                    // Nessun transform quando non si scala: uno `scale(1)` inutile
                    // creerebbe un containing block per i discendenti position:fixed,
                    // cambiando il comportamento del ramo children (Style Editor).
                    style={transformed ? { transform: `scale(${scale})`, transformOrigin: "top left" } : undefined}
                >
                    {screen}
                </div>
            </div>
        </div>
    );
}
