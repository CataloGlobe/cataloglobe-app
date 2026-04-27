const PUBLIC_FONTS_LINK_ID = "public-fonts-stylesheet";

const PUBLIC_FONTS_URL =
    "https://fonts.googleapis.com/css2?" +
    "family=Caveat:wght@400;500;700" +
    "&family=Cormorant+Garamond:wght@400;500;600" +
    "&family=Josefin+Sans:wght@400;500;600" +
    "&family=Lora:wght@400;500;600" +
    "&family=Montserrat:wght@400;500;600" +
    "&family=Raleway:wght@400;500;600" +
    "&family=Playfair+Display:ital,wght@0,400..900;1,400..900" +
    "&family=Poppins:wght@400;500;600;700" +
    "&display=swap";

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
