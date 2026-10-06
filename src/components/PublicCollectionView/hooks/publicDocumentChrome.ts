import { contrastText } from "@/features/public/utils/mapStyleTokensToCssVars";

/**
 * Sfondo del documento sulla pagina pubblica.
 *
 * Lo sfondo dello stile del locale vive su `main.page`, ma Safari (barre che
 * si nascondono, rimbalzo dello scroll, area sotto la toolbar) dipinge quello
 * di html/body: senza questo, lì si vede `--bg` dell'admin (`global.scss`),
 * o il suo tema scuro se ThemeProvider ha messo `data-theme="dark"`.
 * Anche `<meta name="theme-color">` (viola fisso in `index.html`) colora la
 * toolbar del browser: va allineato allo stile.
 *
 * Solo stile inline su html/body: il body-lock di PublicSheet
 * (`useSheetBodyLock`) salva e ripristina position/top/width/overflow, mai
 * il colore, quindi i due non si pestano.
 *
 * Puro rispetto al DOM (riceve un `ChromeDocument`) per essere provato in
 * `src/tests/hooks/publicDocumentChrome.test.ts`.
 */

type InlineStyle = Record<string, string>;

type ThemeColorMeta = {
    content: string;
    remove: () => void;
};

export type ChromeDocument = {
    documentElement: { style: InlineStyle };
    body: { style: InlineStyle };
    findThemeColorMeta: () => ThemeColorMeta | null;
    createThemeColorMeta: () => ThemeColorMeta;
};

/** Applica lo sfondo `color` (hex dello stile) e ritorna la funzione di ripristino. */
export function applyPublicDocumentChrome(doc: ChromeDocument, color: string): () => void {
    const html = doc.documentElement.style;
    const body = doc.body.style;
    const prev = {
        htmlBg: html.backgroundColor,
        colorScheme: html.colorScheme,
        bodyBg: body.backgroundColor,
        bodyTransition: body.transition
    };

    const existing = doc.findThemeColorMeta();
    const meta = existing ?? doc.createThemeColorMeta();
    const prevMetaContent = existing ? existing.content : null;

    html.backgroundColor = color;
    // Controlli nativi e UI del browser seguono lo stile, non il tema admin.
    html.colorScheme = contrastText(color) === "#1a1a1a" ? "light" : "dark";
    body.backgroundColor = color;
    // global.scss anima `background` sul body: niente dissolvenza dal colore admin.
    body.transition = "none";
    meta.content = color;

    return () => {
        html.backgroundColor = prev.htmlBg;
        html.colorScheme = prev.colorScheme;
        body.backgroundColor = prev.bodyBg;
        body.transition = prev.bodyTransition;
        if (prevMetaContent === null) meta.remove();
        else meta.content = prevMetaContent;
    };
}

/** Adattatore sul `document` reale. */
export function browserChromeDocument(): ChromeDocument {
    return {
        documentElement: { style: document.documentElement.style as unknown as InlineStyle },
        body: { style: document.body.style as unknown as InlineStyle },
        findThemeColorMeta: () =>
            document.querySelector<HTMLMetaElement>('meta[name="theme-color"]'),
        createThemeColorMeta: () => {
            const meta = document.createElement("meta");
            meta.name = "theme-color";
            document.head.appendChild(meta);
            return meta;
        }
    };
}
