/**
 * URL pubblico di una sede a partire dal suo slug.
 *
 * Il dominio viene da `VITE_PUBLIC_DOMAIN` quando configurato, con fallback su
 * `window.location.host`: in produzione il backoffice e la pagina pubblica
 * possono stare su domini diversi, quindi comporre l'URL da
 * `window.location.origin` produrrebbe un link sbagliato (in dev: localhost).
 *
 * NOTA: `Businesses.tsx` / `BusinessCreateCard.tsx` usano ancora
 * `window.location.origin` per il preview dello slug in fase di creazione.
 * Migrarli a questo helper è un cambiamento a sé, non incluso qui.
 */
export function buildPublicUrl(slug: string): string {
    const domain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.host;
    const protocol = window.location.protocol;
    return `${protocol}//${domain}/${slug}`;
}
