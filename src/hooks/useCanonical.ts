import { useEffect } from 'react';

type HeadDocument = Pick<Document, 'head' | 'createElement'>;

/**
 * Mette `<link rel="canonical">` nell'head e restituisce la funzione che lo
 * riporta com'era. Separata dall'hook per provarla senza React.
 */
export function applyCanonical(doc: HeadDocument, href: string): () => void {
    const existing = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (existing) {
        const previous = existing.getAttribute('href');
        existing.setAttribute('href', href);
        return () => {
            if (previous === null) existing.removeAttribute('href');
            else existing.setAttribute('href', previous);
        };
    }
    const link = doc.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', href);
    doc.head.appendChild(link);
    return () => link.remove();
}

/**
 * Canonical per le pagine della SPA che Google deve indicizzare (es.
 * /legal/*): `app.html` non ne ha, perché toglie la SEO della landing.
 */
export function useCanonical(href: string): void {
    useEffect(() => applyCanonical(document, href), [href]);
}
