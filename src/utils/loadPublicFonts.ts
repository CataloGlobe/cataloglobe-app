const PUBLIC_FONTS_LINK_ID = "public-fonts-stylesheet";

// Self-hosted, 8 famiglie (esclusa Inter, gia' caricata dallo shell via
// index.html). Nessuna richiesta a fonts.googleapis.com/fonts.gstatic.com.
const PUBLIC_FONTS_URL = "/fonts/public-css/public-all.css";

/**
 * Monta un <link rel="stylesheet"> per le 8 famiglie usate
 * dal rendering dinamico della pagina pubblica e dallo style editor.
 * Idempotente: se già presente, no-op. Ritorna una funzione di cleanup
 * che rimuove il link SOLO se non c'è ancora un altro consumer attivo.
 */
export function loadPublicFonts(): () => void {
    if (typeof document === "undefined") return () => {};

    const existing = document.getElementById(PUBLIC_FONTS_LINK_ID) as HTMLLinkElement | null;
    if (existing) {
        const count = Number(existing.dataset.refcount ?? "0") + 1;
        existing.dataset.refcount = String(count);
        return () => {
            const c = Number(existing.dataset.refcount ?? "1") - 1;
            if (c <= 0) {
                existing.remove();
            } else {
                existing.dataset.refcount = String(c);
            }
        };
    }

    const link = document.createElement("link");
    link.id = PUBLIC_FONTS_LINK_ID;
    link.rel = "stylesheet";
    link.href = PUBLIC_FONTS_URL;
    link.dataset.refcount = "1";
    document.head.appendChild(link);

    return () => {
        const c = Number(link.dataset.refcount ?? "1") - 1;
        if (c <= 0) {
            link.remove();
        } else {
            link.dataset.refcount = String(c);
        }
    };
}
