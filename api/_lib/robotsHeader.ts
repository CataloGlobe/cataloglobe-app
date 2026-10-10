/**
 * Seconda linea di difesa contro l'indicizzazione degli ambienti non di
 * produzione (staging e preview). Oggi li copre la Deployment Protection di
 * Vercel; se viene spenta anche solo per una demo, le pagine pubbliche SSR
 * restano comunque fuori da Google.
 *
 * `VERCEL_ENV` assente (sviluppo locale) conta come non produzione.
 *
 * Anche in produzione resta fuori la sede di test del monitor di stato
 * (`canarySlug`, vedi `statusCanarySlug()`): è una pagina vera ma finta.
 */
export function robotsHeaderValue(
    vercelEnv: string | undefined,
    slug?: string,
    canarySlug?: string
): string | null {
    if (slug && canarySlug && slug === canarySlug) return "noindex, nofollow";
    return vercelEnv === "production" ? null : "noindex, nofollow";
}
