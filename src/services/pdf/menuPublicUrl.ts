// URL pubblico del menù live dallo slug sede (per il QR in copertina).
// Stesso pattern del link/QR pubblico in ActivitySettingsTab (riga ~304):
// VITE_PUBLIC_DOMAIN se configurato, altrimenti l'host corrente.
export function buildPublicMenuUrl(slug: string): string {
    const domain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.host;
    const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
    return `${protocol}//${domain}/${slug}`;
}
