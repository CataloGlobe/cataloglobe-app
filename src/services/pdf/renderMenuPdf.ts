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
import { prefetchImageAsDataUrl, prefetchImagesBounded } from "./prefetchPdfImage";
import { generateQrDataUrl } from "./menuPdfQr";
import { buildPublicMenuUrl } from "./menuPublicUrl";
import type { MenuPdfData } from "./menuPdfTypes";

export type RenderMenuPdfOptions = {
    /** QR "Menu online" in copertina. Default true; cuttabile senza toccare altro. */
    includeQr?: boolean;
    /** Foto prodotto come thumbnail (esperimento Stage 5). Default FALSE. */
    includePhotos?: boolean;
    /** Override asset già pronti (test/control render). Salta il pre-fetch. */
    assets?: MenuPdfAssets;
};

/** Pool bounded per le foto prodotto: ~46 fetch+transcodifiche su San Pietro. */
const PHOTO_PREFETCH_CONCURRENCY = 6;

export async function prepareMenuPdfAssets(
    data: MenuPdfData,
    options?: Pick<RenderMenuPdfOptions, "includeQr" | "includePhotos">
): Promise<MenuPdfAssets> {
    const includeQr = options?.includeQr ?? true;
    const includePhotos = options?.includePhotos ?? false;

    const [logoDataUrl, coverDataUrl] = await Promise.all([
        prefetchImageAsDataUrl(data.brand.logoUrl),
        prefetchImageAsDataUrl(data.brand.coverUrl)
    ]);

    // Foto prodotto: solo con il flag attivo e solo per i prodotti che hanno
    // un'immagine — con flag off, zero fetch.
    let productImages: Record<string, string> = {};
    if (includePhotos) {
        const withImage = data.categories
            .flatMap(category => category.products)
            .filter(product => product.imageUrl !== null);
        const dataUrls = await prefetchImagesBounded(
            withImage.map(product => product.imageUrl),
            PHOTO_PREFETCH_CONCURRENCY
        );
        productImages = Object.fromEntries(
            withImage
                .map((product, index) => [product.id, dataUrls[index]] as const)
                .filter((entry): entry is readonly [string, string] => entry[1] !== null)
        );

        // TEMP — diagnostica Stage 5 (rimuovere in Stage 6): al click reale
        // mostra quante foto sono state prefetchate e quante sono fallite
        // (fallimento tipico: image_url esterno senza CORS → fetch bloccato).
        console.log("[prepareMenuPdfAssets] foto prodotto:", {
            includePhotos,
            productsWithImageUrl: withImage.length,
            sampleImageUrl: withImage[0]?.imageUrl ?? null,
            prefetchOk: Object.keys(productImages).length,
            prefetchNull: withImage.length - Object.keys(productImages).length
        });
    }

    let qrDataUrl: string | null = null;
    if (includeQr && data.meta.slug) {
        try {
            qrDataUrl = await generateQrDataUrl(buildPublicMenuUrl(data.meta.slug));
        } catch (error) {
            console.warn("[renderMenuPdf] generazione QR fallita, copertina senza QR:", error);
        }
    }

    return { logoDataUrl, coverDataUrl, qrDataUrl, productImages };
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
