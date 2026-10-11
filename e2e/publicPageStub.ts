import type { Page } from "@playwright/test";
import type { PublicBusiness, ResolvedPayloadShape } from "../src/types/publicCatalog";
import type { ResolvedCategory, ResolvedCharacteristic, ResolvedProduct, V2FeaturedContent } from "../src/types/resolvedCollections";

/**
 * Pagina pubblica (`/:slug`) servita tutta da stub, senza `/api` né edge:
 * `GET /api/public-catalog` dà il payload, l'analytics risponde 204, lo
 * storico ordini è vuoto. L'ordinazione attiva si ottiene mettendo in
 * sessionStorage la sessione cliente che darebbe `resolve-table`.
 * Il websocket realtime non viene servito: fallisce e la pagina lo tollera.
 */

export const SLUG = "sede-e2e-barra";
export const ACTIVITY_ID = "00000000-0000-4000-8000-0000000000a1";
const TENANT_ID = "00000000-0000-4000-8000-0000000000b1";

function business(venueInfo = false, cover: string | null = null): PublicBusiness {
    const base: PublicBusiness = {
        id: ACTIVITY_ID,
        tenant_id: TENANT_ID,
        name: "Sede e2e barra",
        slug: SLUG,
        cover_image: cover,
        status: "active",
        ordering_enabled: true,
        enable_reservations: false,
        address: null,
        street_number: null,
        postal_code: null,
        city: null,
        province: null,
        instagram: null,
        instagram_public: false,
        facebook: null,
        facebook_public: false,
        whatsapp: null,
        whatsapp_public: false,
        website: null,
        website_public: false,
        phone: null,
        phone_public: false,
        email_public: null,
        email_public_visible: false,
        google_review_url: "https://example.com/recensioni",
        hours_public: false,
        payment_methods: [],
        services: [],
        fees: [],
    };
    if (!venueInfo) return base;
    // Sede con orari pubblici e qualche informazione: per i fogli Informazioni e Orari.
    return {
        ...base,
        address: "Via Roma",
        street_number: "1",
        city: "Milano",
        phone: "+39 02 1234567",
        phone_public: true,
        hours_public: true,
        payment_methods: ["Contanti", "Carta"],
        services: ["Wi-Fi"],
    };
}

/** Tutti i giorni 12:00–23:00: con l'orologio fisso a mezzogiorno e mezzo la sede è aperta. */
const OPENING_HOURS = Array.from({ length: 7 }, (_, day) => ({
    day_of_week: day,
    slot_index: 0,
    opens_at: "12:00",
    closes_at: "23:00",
    is_closed: false,
}));

export const CATEGORIES = ["Antipasti", "Primi", "Secondi", "Dolci"];

const GLUTEN = { id: 1, code: "gluten", label: "Glutine" };
const MILK = { id: 7, code: "milk", label: "Latte" };
const SYSTEM_ALLERGENS = [
    { id: 1, code: "gluten", label_it: "Glutine", label_en: "Gluten", sort_order: 1 },
    { id: 3, code: "eggs", label_it: "Uova", label_en: "Eggs", sort_order: 3 },
    { id: 7, code: "milk", label_it: "Latte", label_en: "Milk", sort_order: 7 }
];

/**
 * «Primi 1» con la scheda piena (`details`): formati, un gruppo di aggiunte da
 * 7 voci, 7 ingredienti, dettagli, una caratteristica e un abbinamento a «Dolci 2».
 */
const DETAILED_PRODUCT: Partial<ResolvedProduct> = {
    optionGroups: [
        {
            id: "og-size",
            name: "Formato",
            group_kind: "PRIMARY_PRICE",
            pricing_mode: "ABSOLUTE",
            is_required: true,
            max_selectable: 1,
            values: [
                { id: "ov-s", name: "Normale", absolute_price: 12, price_modifier: null },
                { id: "ov-l", name: "Grande", absolute_price: 16, price_modifier: null }
            ]
        },
        {
            id: "og-add",
            name: "Aggiunte",
            group_kind: "ADDON",
            pricing_mode: "DELTA",
            is_required: false,
            max_selectable: 3,
            values: Array.from({ length: 7 }, (_, i) => ({
                id: `ov-a${i}`,
                name: `Aggiunta ${i + 1}`,
                absolute_price: null,
                price_modifier: i === 0 ? 0 : 1.5
            }))
        }
    ],
    ingredients: Array.from({ length: 7 }, (_, i) => ({ id: `ing-${i}`, name: `Ingrediente ${i + 1}` })),
    notes: [{ label: "Provenienza", value: "Salumi italiani" }],
    characteristics: [{ id: "ch-veg", code: "vegetarian", category: "diet", label: "Vegetariano", icon: "lucide:leaf", sort_order: 0, mutex_group: null, dietary_claim: true }],
    pairings: [{ paired_product_id: "prod-3-1", note: "Per chiudere", sort_order: 0 }]
};

/**
 * Con `preferences`, per categoria: i piatti pari vegetariani (il 5 vegano invece
 * che vegetariano), l'8 molto piccante. Codici e icone delle caratteristiche di sistema.
 */
function preferenceCharacteristics(p: number): ResolvedCharacteristic[] {
    if (p === 4) return [{ id: "ch-vegan", code: "vegan", category: "diet", label: "Vegano", icon: "custom:sprout", sort_order: 1, mutex_group: null, dietary_claim: true }];
    if (p % 2 === 0) return [{ id: "ch-veg", code: "vegetarian", category: "diet", label: "Vegetariano", icon: "custom:leaf", sort_order: 0, mutex_group: null, dietary_claim: true }];
    if (p === 7) return [{ id: "ch-hot", code: "spicy_hot", category: "spicy", label: "Molto piccante", icon: "custom:pepper-3", sort_order: 12, mutex_group: "spicy", dietary_claim: false }];
    return [];
}

/** Con `allergens`: un piatto su tre col glutine, uno su quattro col latte. */
function categories(allergens = false, details = false, preferences = false): ResolvedCategory[] {
    return CATEGORIES.map((name, c) => ({
        id: `cat-${c}`,
        name,
        level: 1,
        sort_order: c,
        parent_category_id: null,
        products: Array.from({ length: 8 }, (_, p) => ({
            id: `prod-${c}-${p}`,
            name: `${name} ${p + 1}`,
            description: "Descrizione del piatto, abbastanza lunga da occupare due righe nella card.",
            price: 9 + p,
            is_visible: true,
            parentSelected: true,
            ...(allergens ? { allergens: [...(p % 3 === 0 ? [GLUTEN] : []), ...(p % 4 === 0 ? [MILK] : [])] } : {}),
            ...(preferences ? { characteristics: preferenceCharacteristics(p) } : {}),
            ...(details && c === 1 && p === 0 ? DETAILED_PRODUCT : {}),
        })),
    }));
}

/** Un contenuto in evidenza pubblicato; `overrides` per id, titolo, CTA… */
export function featured(overrides: Partial<V2FeaturedContent> = {}): V2FeaturedContent {
    return {
        id: "feat-1",
        internal_name: "Serata e2e",
        title: "Serata jazz",
        subtitle: "Ogni giovedì",
        description: "Musica dal vivo.",
        media_id: null,
        media_focal_x: 0.5,
        media_focal_y: 0.5,
        media_zoom: 1,
        media_fill_mode: "none",
        media_fill_color: null,
        media_aspect_ratio: null,
        cta_text: null,
        cta_url: null,
        status: "published",
        layout_style: null,
        pricing_mode: "none",
        content_type: "event",
        bundle_price: null,
        show_original_total: false,
        products: [],
        created_at: "2026-09-01T10:00:00Z",
        updated_at: "2026-09-01T10:00:00Z",
        ...overrides,
    };
}

export type FeaturedSlots = {
    before_catalog?: V2FeaturedContent[];
    after_catalog?: V2FeaturedContent[];
};

/** Config dello stile risolto (`resolved.style.config`, formato di `parseTokens`). Assente = default. */
export type StyleConfig = Record<string, unknown>;

function payload(
    featuredSlots: FeaturedSlots,
    styleConfig?: StyleConfig,
    venueInfo = false,
    story = false,
    allergens = false,
    details = false,
    cover: string | null = null,
    reservations = false,
    preferences = false
): ResolvedPayloadShape {
    // Con `reservations` la sede prenota online: orari e passo della griglia come la pagina /prenota.
    const base = business(venueInfo, cover);
    return {
        business: reservations ? { ...base, enable_reservations: true, reservation_pacing_slot_minutes: 30 } : base,
        ...(reservations && !venueInfo ? { opening_hours: OPENING_HOURS, upcoming_closures: [] } : {}),
        ...(story ? { has_story: true } : {}),
        ...(venueInfo
            ? {
                  opening_hours: OPENING_HOURS,
                  upcoming_closures: [],
                  available_languages: [
                      { code: "it", name_native: "Italiano", flag_emoji: "🇮🇹" },
                      { code: "en", name_native: "English", flag_emoji: "🇬🇧" },
                  ],
              }
            : {}),
        tenantLogoUrl: null,
        base_language_code: "it",
        effective_language: "it",
        // Con `allergens` anche l'elenco di legge (qui tre): il fondo lo apre da «Allergeni».
        public_allergens: allergens ? SYSTEM_ALLERGENS : [],
        resolved: {
            catalog: { id: "catalog-1", name: "Menu", categories: categories(allergens, details, preferences) },
            featured: featuredSlots,
            hasRenderableItems: true,
            ...(styleConfig ? { style: { id: "style-1", name: "Stile e2e", config: styleConfig } } : {}),
        } as ResolvedPayloadShape["resolved"],
    };
}

export async function stubPublicPage(
    page: Page,
    opts: { ordering: boolean; featured?: FeaturedSlots; styleConfig?: StyleConfig; venueInfo?: boolean; story?: boolean; allergens?: boolean; details?: boolean; cover?: string; reservations?: boolean; preferences?: boolean }
): Promise<void> {
    const featuredSlots = opts.featured ?? { before_catalog: [featured()] };
    await page.route("**/api/public-catalog**", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload(featuredSlots, opts.styleConfig, opts.venueInfo, opts.story, opts.allergens, opts.details, opts.cover ?? null, opts.reservations, opts.preferences)) })
    );
    await page.route("**/functions/v1/log-analytics-event**", route => route.fulfill({ status: 204 }));
    await page.route("**/functions/v1/get-orders-for-session**", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [] }) })
    );
    // Qualunque altra chiamata a Supabase: nessun backend reale nel test.
    await page.route("**/rest/v1/**", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    if (opts.ordering) {
        await page.addInitScript(
            ([activityId, tenantId]) => {
                sessionStorage.setItem(
                    `cataloglobe-customer-${activityId}`,
                    JSON.stringify({
                        jwt: "e2e.jwt.token",
                        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                        sessionId: "00000000-0000-4000-8000-0000000000c1",
                        tableId: "00000000-0000-4000-8000-0000000000d1",
                        tableLabel: "Tavolo 4",
                        tableZone: null,
                        activityId,
                        tenantId,
                        customerName: null,
                    })
                );
            },
            [ACTIVITY_ID, TENANT_ID]
        );
    }
}
