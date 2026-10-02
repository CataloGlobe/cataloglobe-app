/**
 * Microsoft Clarity sulla landing di campagna e consenso ai cookie che la abilita.
 *
 * Clarity si carica solo in produzione (hostname esatto, niente www, staging,
 * preview Vercel o localhost), solo su `/` e `/b`, e solo dopo «Accetta».
 * Logica in `src/pages/CampaignLanding/cookieConsent.ts`.
 */
export const CLARITY_PROJECT_ID = "yritmuawt0";

export const CLARITY_HOSTNAME = "cataloglobe.com";

export const CLARITY_PATHS: readonly string[] = ["/", "/b"];

/** Alzarla ripropone il banner a chi aveva già scelto (es. nuovo fornitore). */
export const COOKIE_CONSENT_VERSION = 1;

/** Dopo quanti mesi una scelta scade e il banner torna. */
export const COOKIE_CONSENT_MONTHS = 6;

export const COOKIE_CONSENT_STORAGE_KEY = "cg-cookie-consent";
