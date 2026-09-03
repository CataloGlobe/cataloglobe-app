import type { Allergen } from "@/services/supabase/allergens";
import type { AvailableLanguage } from "@/context/Language/LanguageContext";
import type { PublicBusiness, ResolvedPayloadShape } from "@/types/publicCatalog";
import type { ResolvedCollections } from "@/types/resolvedCollections";
import type { OpeningHoursEntry, UpcomingClosure } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
// `@/pages/...` e non `@pages/...`: vitest.config risolve solo l'alias `@`,
// e questo modulo è sotto test (src/tests/pages/derivePageState.test.ts).
import { hasBookableDays } from "@/pages/ReservationPage/utils/reservationSlots";

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
 *     (ready | inactive | subscription_inactive | empty | catalog_empty).
 *     Gli stati loading/error/domain_error appartengono alla discriminazione
 *     del risultato fetch nel chiamante, non a questa funzione.
 */

/**
 * Dati minimi di branding per lo stato `catalog_empty`: la sede e il suo
 * logo, niente altro — chrome-less (niente header, niente CollectionView),
 * renderizzato da `PublicCatalogUnavailable`. Non è un errore: una regola di
 * programmazione ha agganciato un catalogo ma questo non ha prodotti
 * visibili ORA.
 */
type BrandingPageData = {
    business: PublicBusiness;
    tenantLogoUrl: string | null;
};

/** Dati di pagina condivisi da `ready` ed `empty` (comportamento storico,
 *  invariato: nessun catalogo risolto — nessuna regola vinta, o filtrata
 *  altrove — e nessun featured. Sede pubblicata ma senza nulla da mostrare,
 *  chrome completa + messaggio sobrio via `PublicCatalogReady`). */
type CatalogPageData = {
    business: PublicBusiness;
    resolved: ResolvedCollections;
    tenantLogoUrl: string | null;
    openingHours?: OpeningHoursEntry[];
    upcomingClosures?: UpcomingClosure[];
    /** True se la sede ha almeno una fascia prenotabile nell'orizzonte.
     *  Gate della voce "Prenota" nel MoreSheet, insieme a
     *  `business.enable_reservations`. Vedi `derivePageState`. */
    hasReservationHours: boolean;
    allergens: Allergen[] | null;
    effectiveLanguage: string;
    baseLanguage: string;
    availableLanguages: AvailableLanguage[];
    /** Gate del tab "storia" (has_story dal catalogo). */
    hasStory: boolean;
    isRefetching?: boolean;
    /** True quando il payload corrente è "stale":
        - proviene dalla cache localStorage (fallback offline), OPPURE
        - proviene da snapshot Redis lato server (header
          `x-cataloglobe-source: stale`).
        In entrambi i casi il banner ambra è mostrato. */
    isStale?: boolean;
    /** Codice lingua richiesto da un cambio-lingua fallito (Supabase down
        + nessuna cache localStorage per quella lingua). Quando valorizzato
        la pagina RESTA sul contenuto già visibile (questo stato `ready`,
        non toccato) e mostra `LanguageFallbackBanner`. Null/undefined =
        nessun degrado attivo. Distinto da `isStale`: qui il contenuto è
        fresco, solo il *cambio* verso un'altra lingua non è riuscito.
        Vedi PublicCollectionPage ramo `network_error`. */
    langSwitchFailed?: string | null;
};

export type PageState =
    | { status: "loading" }
    | { status: "error"; messageKey: string }
    | { status: "domain_error"; code: string }
    | { status: "inactive" }
    | { status: "subscription_inactive" }
    | ({ status: "ready" } & CatalogPageData)
    | ({ status: "empty" } & CatalogPageData)
    | ({ status: "catalog_empty" } & BrandingPageData);

/** Sottoinsieme di PageState producibile da un payload di successo. */
export type DerivedPageState = Extract<
    PageState,
    { status: "ready" | "inactive" | "subscription_inactive" | "empty" | "catalog_empty" }
>;

/** Stato "ready" completo — prop `data` di PublicCatalogReady. */
export type ReadyPageData = Extract<PageState, { status: "ready" }>;

/** Sede pubblicata senza contenuti da mostrare (comportamento storico,
 *  invariato) — stessa prop `data` di PublicCatalogReady. */
export type EmptyPageData = Extract<PageState, { status: "empty" }>;

/** Unione renderizzabile da PublicCatalogReady (catalogo pieno o vuoto). */
export type CatalogRenderData = ReadyPageData | EmptyPageData;

/** Regola di programmazione vinta ma catalogo senza prodotti visibili ORA —
 *  prop `data` di PublicCatalogUnavailable. */
export type CatalogEmptyPageData = Extract<PageState, { status: "catalog_empty" }>;

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
        upcoming_closures,
        has_story
    } = payload;

    if (subscription_inactive) {
        return { status: "subscription_inactive" };
    }

    // Nessun dettaglio del motivo (manutenzione/chiusura/sospensione) esposto
    // al visitatore anonimo: messaggio generico, vedi NotFound "business-inactive".
    if (business.status !== "active") {
        return { status: "inactive" };
    }

    // Featured risolto (before/after_catalog) → la pagina ha comunque
    // contenuto da mostrare: resta sempre `ready`, anche a catalogo vuoto o
    // nessuna regola vinta. Non declassare mai questo caso.
    const hasFeatured =
        (!!resolved.featured?.before_catalog && resolved.featured.before_catalog.length > 0) ||
        (!!resolved.featured?.after_catalog && resolved.featured.after_catalog.length > 0);

    // Regola di programmazione vinta (il resolver popola `hasRenderableItems`
    // SOLO quando una regola "layout" ha effettivamente agganciato un
    // catalogo — vedi resolveActivityCatalogs) ma zero prodotti visibili ORA:
    // schermata dedicata chrome-less. Non è un errore.
    //
    // Distinto dal caso "nessuna regola vinta" gestito più sotto (`isEmpty`,
    // comportamento storico INVARIATO da prima di questo lavoro): quel caso
    // resta fuori scope qui — TODO separato: la risoluzione scheduling a
    // volte segnala "nessuna regola vinta" anche in orario di apertura
    // configurato (bug distinto, non nella state machine).
    if (!hasFeatured && resolved.hasRenderableItems === false) {
        return { status: "catalog_empty", business, tenantLogoUrl };
    }

    // Nessuna regola layout mai configurata/pubblicata per la sede (setup mai
    // completato) — distinto dal caso sotto (`isEmpty`, INVARIATO): lì le
    // regole esistono ma nessuna vince ora per dayparting. Confronto esplicito
    // `=== false`: `undefined` (payload servito da un'edge non ancora
    // aggiornata durante il rollout) deve cadere nel ramo `isEmpty` legacy,
    // mai qui.
    if (!hasFeatured && !resolved.catalog && resolved.hasConfiguredCatalogRule === false) {
        return { status: "catalog_empty", business, tenantLogoUrl };
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

    // ATTENZIONE: si legge il payload GREZZO (`opening_hours` /
    // `upcoming_closures`), non i due campi mascherati qui sotto. Non
    // "semplificare" riusando `openingHours`: `hours_public` governa se gli
    // orari si MOSTRANO nel menù, non se la sede accetta prenotazioni. Una
    // sede può avere orari configurati e scegliere di tenerli nascosti — con
    // il campo mascherato spegneremmo la prenotazione a sedi perfettamente
    // funzionanti. Esposto come solo booleano: nessun dettaglio della
    // configurazione interna raggiunge il menù.
    const hasReservationHours = hasBookableDays(
        opening_hours ?? [],
        upcoming_closures ?? []
    );

    // Comportamento storico, INVARIATO da prima di questo lavoro: nessun
    // catalogo risolto (nessuna regola vinta ora, o filtrata altrove) e
    // nessun featured → "empty", stessa shape di "ready" (chrome completa +
    // messaggio sobrio via PublicCatalogReady). Non toccare: il bug di
    // risoluzione scheduling dietro "nessuna regola vinta" è fuori scope qui.
    const isEmpty = !resolved.catalog && !hasFeatured;

    return {
        status: isEmpty ? "empty" : "ready",
        business,
        resolved,
        tenantLogoUrl,
        openingHours: menuHoursVisible ? opening_hours : undefined,
        upcomingClosures: menuHoursVisible ? upcoming_closures : undefined,
        hasReservationHours,
        allergens,
        effectiveLanguage: effectiveLang,
        baseLanguage: baseLang,
        availableLanguages: availLangs,
        hasStory: has_story === true
    };
}
