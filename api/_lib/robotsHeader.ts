/**
 * Seconda linea di difesa contro l'indicizzazione degli ambienti non di
 * produzione (staging e preview). Oggi li copre la Deployment Protection di
 * Vercel; se viene spenta anche solo per una demo, le pagine pubbliche SSR
 * restano comunque fuori da Google.
 *
 * `VERCEL_ENV` assente (sviluppo locale) conta come non produzione.
 */
export function robotsHeaderValue(vercelEnv: string | undefined): string | null {
    return vercelEnv === "production" ? null : "noindex, nofollow";
}
