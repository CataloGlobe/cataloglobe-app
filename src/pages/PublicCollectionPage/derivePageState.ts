import type { Allergen } from "@/services/supabase/allergens";
import type { AvailableLanguage } from "@/context/Language/LanguageContext";
import type { PublicBusiness, ResolvedPayloadShape } from "@/types/publicCatalog";
import type { ResolvedCollections } from "@/types/resolvedCollections";
import type { OpeningHoursEntry, UpcomingClosure } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";

/**
 * Derivazione PURA dello stato della pagina pubblica (SSR stage 3, step 1).
 *
 * Estratta da `processPayload` di PublicCollectionPage: niente fetch, niente
 * navigate, niente setState — solo payload in ingresso → valori in uscita.
 * L'orchestrazione (fetch catalogo, fetch allergeni, redirect via navigate,
 * flag isRefetching/isStale, cache write) resta nel chiamante.
 *
 * Due funzioni:
 *   - `resolveRedirect`: i redirect post-fetch come INTENTO ritornato
 *     (URL o null), che il chiamante esegue con navigate(replace).
 *   - `derivePageState`: payload di successo → stato pagina
 *     (ready | inactive | subscription_inactive | empty). Gli stati
 *     loading/error/domain_error appartengono alla discriminazione del
 *     risultato fetch nel chiamante, non a questa funzione.
 */

export type PageState =
    | { status: "loading" }
    | { status: "error"; messageKey: string }
    | { status: "domain_error"; code: string }
    | { status: "inactive"; inactiveReason: string | null }
    | { status: "subscription_inactive" }
    | {
          status: "ready";
          business: PublicBusiness;
          resolved: ResolvedCollections;
          tenantLogoUrl: string | null;
          openingHours?: OpeningHoursEntry[];
          upcomingClosures?: UpcomingClosure[];
          allergens: Allergen[] | null;
          effectiveLanguage: string;
          baseLanguage: string;
          availableLanguages: AvailableLanguage[];
          isRefetching?: boolean;
          /** True quando il payload corrente è "stale":
              - proviene dalla cache localStorage (fallback offline), OPPURE
              - proviene da snapshot Redis lato server (header
                `x-cataloglobe-source: stale`).
              In entrambi i casi il banner ambra è mostrato. */
          isStale?: boolean;
      }
    | {
          status: "empty";
          business: PublicBusiness;
          tenantLogoUrl: string | null;
      };

/** Sottoinsieme di PageState producibile da un payload di successo. */
export type DerivedPageState = Extract<
    PageState,
    { status: "ready" | "inactive" | "subscription_inactive" | "empty" }
>;

/** Stato "ready" completo — prop `data` di PublicCatalogReady. */
export type ReadyPageData = Extract<PageState, { status: "ready" }>;

export type ResolveRedirectOpts = {
    /** Payload da cache localStorage: i redirect sono già stati risolti
        quando il payload fu salvato → mai redirect su cache. */
    fromCache: boolean;
    /** Slug corrente dalla URL. */
    slug: string;
    /** Lingua richiesta dalla URL, già validata/lowercased (validatedLang). */
    requestedLang?: string;
};

/**
 * Redirect post-fetch (solo payload fresco): alias slug → canonical,
 * lingua non supportata → base, lingua == base → strip dal path.
 * Ritorna la URL di destinazione per `navigate(url, { replace: true })`
 * o null se nessun redirect.
 */
export function resolveRedirect(
    payload: ResolvedPayloadShape,
    opts: ResolveRedirectOpts
): string | null {
    if (opts.fromCache) return null;

    const { canonical_slug, lang_unsupported, base_language_code } = payload;

    if (canonical_slug && canonical_slug !== opts.slug) {
        return `/${canonical_slug}`;
    }
    if (lang_unsupported) {
        return `/${opts.slug}`;
    }
    if (opts.requestedLang && base_language_code && opts.requestedLang === base_language_code) {
        return `/${opts.slug}`;
    }
    return null;
}

/**
 * Payload di successo → stato pagina. Gli allergeni arrivano dall'esterno
 * (l'orchestrazione li fetcha solo quando il payload arriva a "ready" e il
 * vertical li prevede). I flag isRefetching/isStale li applica il chiamante.
 */
export function derivePageState(
    payload: ResolvedPayloadShape,
    allergens: Allergen[] | null
): DerivedPageState {
    const {
        business,
        tenantLogoUrl,
        resolved,
        subscription_inactive,
        base_language_code,
        effective_language,
        available_languages,
        opening_hours,
        upcoming_closures
    } = payload;

    if (subscription_inactive) {
        return { status: "subscription_inactive" };
    }

    if (business.status !== "active") {
        return {
            status: "inactive",
            inactiveReason: business.inactive_reason ?? null
        };
    }

    if (
        !resolved.catalog &&
        (!resolved.featured?.before_catalog || resolved.featured.before_catalog.length === 0) &&
        (!resolved.featured?.after_catalog || resolved.featured.after_catalog.length === 0)
    ) {
        return { status: "empty", business, tenantLogoUrl };
    }

    const baseLang = base_language_code ?? "it";
    const effectiveLang = effective_language ?? baseLang;
    const availLangs: AvailableLanguage[] =
        available_languages && available_languages.length > 0
            ? available_languages
            : [{ code: baseLang, name_native: "Italiano", flag_emoji: null }];

    // Honor business.hours_public for the menu page rendering. The
    // resolve-public-catalog edge function ships opening_hours +
    // upcoming_closures whenever (hours_public || enable_reservations)
    // is true so the public reservation form can validate against the
    // schedule. The menu, however, must NOT surface those when the
    // venue opted to hide them via hours_public=false.
    const menuHoursVisible = business.hours_public === true;

    return {
        status: "ready",
        business,
        resolved,
        tenantLogoUrl,
        openingHours: menuHoursVisible ? opening_hours : undefined,
        upcomingClosures: menuHoursVisible ? upcoming_closures : undefined,
        allergens,
        effectiveLanguage: effectiveLang,
        baseLanguage: baseLang,
        availableLanguages: availLangs
    };
}
