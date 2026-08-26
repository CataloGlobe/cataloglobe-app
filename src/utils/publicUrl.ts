/**
 * URL pubblico di una sede a partire dal suo slug.
 *
 * Il dominio viene da `VITE_PUBLIC_DOMAIN` quando configurato, con fallback su
 * `window.location.host`: in produzione il backoffice e la pagina pubblica
 * possono stare su domini diversi, quindi comporre l'URL da
 * `window.location.origin` produrrebbe un link sbagliato (in dev: localhost).
 *
 * ⚠️ `VITE_PUBLIC_DOMAIN` non è definita in nessun `.env` del repo: finché non
 * viene configurata (anche solo nell'ambiente di deploy) il fallback rende
 * questo helper equivalente a `window.location.origin`, quindi in locale non si
 * vede alcuna differenza. È atteso, non un difetto.
 *
 * Da usare ovunque il backoffice mostri, apra o copi l'indirizzo pubblico di
 * una sede. Unica eccezione la pagina pubblica stessa (`CollectionView`), dove
 * `window.location.origin` È già il dominio pubblico.
 */
export function buildPublicUrl(slug: string): string {
    const domain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.host;
    const protocol = window.location.protocol;
    return `${protocol}//${domain}/${slug}`;
}
