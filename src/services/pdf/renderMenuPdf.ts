// Entry lazy del rendering PDF menu (Stage 2 + 3b). Va importato SOLO via
// import() dinamico: tiene @react-pdf/renderer fuori dal bundle principale.
//
// Pipeline immagini: tutto il fetch avviene QUI (prefetchImageAsDataUrl / QR),
// prima di costruire il documento — MenuPdfDocument riceve solo data-URL o
// null e non fa mai fetch a runtime. Ogni asset fallito degrada a null.
import { createElement, type ReactElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { MenuPdfDocument, type MenuPdfAssets } from "./MenuPdfDocument";
import { registerPdfFonts } from "./pdfFonts";
import { prefetchImageAsDataUrl } from "./prefetchPdfImage";
import { generateQrDataUrl } from "./menuPdfQr";
import { buildPublicMenuUrl } from "./menuPublicUrl";
import type { MenuPdfData } from "./menuPdfTypes";

export type RenderMenuPdfOptions = {
    /** QR "Menu online" in copertina. Default true; cuttabile senza toccare altro. */
    includeQr?: boolean;
    /** Override asset già pronti (test/control render). Salta il pre-fetch. */
    assets?: MenuPdfAssets;
};

export async function prepareMenuPdfAssets(
    data: MenuPdfData,
    options?: Pick<RenderMenuPdfOptions, "includeQr">
): Promise<MenuPdfAssets> {
    const includeQr = options?.includeQr ?? true;

    const [logoDataUrl, coverDataUrl] = await Promise.all([
        prefetchImageAsDataUrl(data.brand.logoUrl),
        prefetchImageAsDataUrl(data.brand.coverUrl)
    ]);

    let qrDataUrl: string | null = null;
    if (includeQr && data.meta.slug) {
        try {
            qrDataUrl = await generateQrDataUrl(buildPublicMenuUrl(data.meta.slug));
        } catch (error) {
            console.warn("[renderMenuPdf] generazione QR fallita, copertina senza QR:", error);
        }
    }

    return { logoDataUrl, coverDataUrl, qrDataUrl };
}

export async function renderMenuPdfBlob(
    data: MenuPdfData,
    options?: RenderMenuPdfOptions
): Promise<Blob> {
    registerPdfFonts();
    const assets = options?.assets ?? (await prepareMenuPdfAssets(data, options));

    // pdf() pretende ReactElement<DocumentProps>: il cast è il pattern
    // documentato per componenti wrapper che RITORNANO un <Document>.
    const element = createElement(
        MenuPdfDocument,
        { data, assets }
    ) as unknown as ReactElement<DocumentProps>;
    return pdf(element).toBlob();
}
