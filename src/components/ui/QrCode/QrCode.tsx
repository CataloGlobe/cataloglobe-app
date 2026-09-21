import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Menu } from "@/components/ui/Menu";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import styles from "./QrCode.module.scss";

/** Taglie della scheda: sm 40 (leading di ListRow) · md 96 (drawer tavolo) · lg 160 (scheda singola, Setup). */
export type QrCodeSize = "sm" | "md" | "lg";
const SIZE_PX: Record<QrCodeSize, number> = { sm: 40, md: 96, lg: 160 };

export type QrCodeImageSettings = {
    src: string;
    width: number;
    height: number;
    excavate: boolean;
    crossOrigin?: "anonymous";
};

export type QrCodeHandle = {
    /** Scarica il QR come PNG rasterizzato via canvas. */
    downloadPng: () => Promise<void>;
    /** Scarica il QR come SVG vettoriale. */
    downloadSvg: () => void;
};

type Props = {
    /** Contenuto codificato: di norma l'URL pubblico della sede. */
    value: string;
    /**
     * `sm | md | lg` (40 / 96 / 160) rende il codice nella cornice della
     * scheda (surface, bordo, quiet zone 8). Un numero è la taglia storica,
     * nuda: i chiamanti con la cornice propria restano com'erano.
     */
    size?: number | QrCodeSize;
    /** Sotto il codice, in caption muta: nome sede o numero tavolo. */
    label?: string;
    /** Pronto (default) · in caricamento (Skeleton della stessa taglia) · non disponibile (sede sospesa). */
    status?: "ready" | "loading" | "unavailable";
    /** Azione «Copia link» (Button ghost sm sotto il codice). */
    onCopyLink?: () => void;
    /** Azione «Apri»: link alla pagina pubblica. */
    openHref?: string;
    level?: "L" | "M" | "Q" | "H";
    includeMargin?: boolean;
    fgColor?: string;
    bgColor?: string;
    /** Logo sovrapposto al centro del QR. */
    imageSettings?: QrCodeImageSettings;
    /** Nome dei file scaricati, senza estensione. */
    fileName: string;
    /** Mostra i controlli di download accanto al QR. Con `false` il chiamante
     *  li rende dove vuole e invoca i download via ref. */
    showActions?: boolean;
    className?: string;
};

/**
 * Serializza un SVG inlinando le `<image>` referenziate come data-URI.
 *
 * Necessario per il PNG: il canvas disegna l'SVG da un data-URL, e un `<image>`
 * che punta a una URL remota (il logo del tenant su Storage) non viene caricato
 * in quel contesto — il logo sparirebbe dal file scaricato. Un fetch fallito
 * non è bloccante: si scarica il QR senza logo invece di non scaricare nulla.
 */
async function serializeSvgWithInlinedImages(svg: SVGSVGElement): Promise<string> {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const images = clone.querySelectorAll("image");

    await Promise.all(
        Array.from(images).map(async imgEl => {
            const href =
                imgEl.getAttribute("href") ??
                imgEl.getAttributeNS("http://www.w3.org/1999/xlink", "href");
            if (!href || href.startsWith("data:")) return;
            try {
                const resp = await fetch(href, { mode: "cors" });
                const blob = await resp.blob();
                const dataUrl = await new Promise<string>(resolve => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
                imgEl.setAttribute("href", dataUrl);
                imgEl.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
            } catch {
                // logo may not appear
            }
        })
    );

    return new XMLSerializer().serializeToString(clone);
}

function triggerDownload(href: string, fileName: string): void {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = href;
    link.click();
}

/**
 * QR code con download PNG/SVG incorporati.
 *
 * I download sono esposti anche via ref (`QrCodeHandle`) perché alcuni
 * chiamanti rendono i propri controlli altrove e scelgono a runtime quale
 * istanza scaricare (es. anteprima piccola vs modale ingrandita).
 */
export const QrCode = forwardRef<QrCodeHandle, Props>(function QrCode(
    {
        value,
        size = 200,
        label,
        status = "ready",
        onCopyLink,
        openHref,
        level = "H",
        includeMargin = false,
        fgColor,
        bgColor,
        imageSettings,
        fileName,
        showActions = false,
        className
    },
    ref
) {
    const svgRef = useRef<SVGSVGElement>(null);

    const downloadPng = useCallback(async () => {
        const svg = svgRef.current;
        if (!svg) return;

        const svgData = await serializeSvgWithInlinedImages(svg);
        const img = new Image();

        await new Promise<void>(resolve => {
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                ctx?.drawImage(img, 0, 0);
                triggerDownload(canvas.toDataURL("image/png"), `${fileName}.png`);
                resolve();
            };
            img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
        });
    }, [fileName]);

    const downloadSvg = useCallback(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${fileName}.svg`);
        URL.revokeObjectURL(url);
    }, [fileName]);

    useImperativeHandle(ref, () => ({ downloadPng, downloadSvg }), [downloadPng, downloadSvg]);

    const preset = typeof size === "string";
    const px = preset ? SIZE_PX[size] : size;

    const menu = showActions && (
        <Menu
            trigger={
                <Button variant="secondary" size="sm" leftIcon={<Download size={14} />}>
                    Scarica QR
                </Button>
            }
        >
            <Menu.Item icon={ImageIcon} onSelect={() => void downloadPng()}>
                Scarica PNG
            </Menu.Item>
            <Menu.Item icon={Download} onSelect={downloadSvg}>
                Scarica SVG
            </Menu.Item>
        </Menu>
    );

    // Taglia numerica: il codice nudo com'era, la cornice la mette il chiamante.
    if (!preset) {
        return (
            <>
                <QRCodeSVG
                    ref={svgRef}
                    value={value}
                    size={px}
                    level={level}
                    includeMargin={includeMargin}
                    fgColor={fgColor}
                    bgColor={bgColor}
                    imageSettings={imageSettings}
                    className={className}
                />
                {menu}
            </>
        );
    }

    const hasActions = showActions || onCopyLink || openHref;
    return (
        <div className={`${styles.root} ${styles[size]} ${className ?? ""}`.trim()}>
            <div className={`${styles.frame} ${status === "unavailable" ? styles.unavailable : ""}`.trim()} aria-busy={status === "loading" || undefined}>
                {status === "loading" ? (
                    <Skeleton width={px} height={px} radius="var(--radius-inner)" />
                ) : (
                    <QRCodeSVG
                        ref={svgRef}
                        value={value}
                        size={px}
                        level={level}
                        includeMargin={includeMargin}
                        fgColor={fgColor}
                        bgColor={bgColor}
                        imageSettings={imageSettings}
                        aria-label={status === "unavailable" ? "QR non attivo" : `QR di ${value}`}
                    />
                )}
                {status === "unavailable" && (
                    <Text as="span" variant="caption" weight={500} className={styles.unavailableLabel}>
                        Non attivo
                    </Text>
                )}
            </div>
            {label && (
                <Text as="span" variant="caption" colorVariant="muted" className={styles.label}>
                    {label}
                </Text>
            )}
            {hasActions && size !== "sm" && (
                <div className={styles.actions}>
                    {menu}
                    {onCopyLink && (
                        <Button variant="ghost" size="sm" leftIcon={<Copy size={14} />} onClick={onCopyLink} disabled={status !== "ready"}>
                            Copia link
                        </Button>
                    )}
                    {openHref && (
                        <Button as="a" href={openHref} target="_blank" rel="noreferrer" variant="ghost" size="sm" leftIcon={<ExternalLink size={14} />}>
                            Apri
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
});
