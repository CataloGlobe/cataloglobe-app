// Entry lazy del rendering PDF menu (Stage 2). Va importato SOLO via import()
// dinamico: tiene @react-pdf/renderer fuori dal bundle principale.
import { createElement, type ReactElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { MenuPdfDocument } from "./MenuPdfDocument";
import type { MenuPdfData } from "./menuPdfTypes";

export async function renderMenuPdfBlob(data: MenuPdfData): Promise<Blob> {
    // pdf() pretende ReactElement<DocumentProps>: il cast è il pattern
    // documentato per componenti wrapper che RITORNANO un <Document>.
    const element = createElement(MenuPdfDocument, { data }) as unknown as ReactElement<DocumentProps>;
    return pdf(element).toBlob();
}
