import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Menu } from "@/components/ui/Menu";

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
    size?: number;
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

    return (
        <>
            <QRCodeSVG
                ref={svgRef}
                value={value}
                size={size}
                level={level}
                includeMargin={includeMargin}
                fgColor={fgColor}
                bgColor={bgColor}
                imageSettings={imageSettings}
                className={className}
            />
            {showActions && (
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
            )}
        </>
    );
});
