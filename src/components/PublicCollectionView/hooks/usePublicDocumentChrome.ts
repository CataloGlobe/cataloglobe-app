import { useLayoutEffect } from "react";
import { applyPublicDocumentChrome, browserChromeDocument } from "./publicDocumentChrome";

/**
 * Porta lo sfondo dello stile su html/body e su `meta[name="theme-color"]`
 * finché la pagina pubblica è montata; ripristina all'unmount. Logica in
 * `publicDocumentChrome.ts`. Layout effect: il colore è già giusto al primo
 * paint dopo il mount, niente lampo del colore admin.
 */
export function usePublicDocumentChrome(color: string | null | undefined, enabled: boolean): void {
    useLayoutEffect(() => {
        if (!enabled || !color) return;
        return applyPublicDocumentChrome(browserChromeDocument(), color);
    }, [color, enabled]);
}
