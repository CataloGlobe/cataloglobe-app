import type { Page } from "@playwright/test";
import type { PublicBusiness, ResolvedPayloadShape } from "../src/types/publicCatalog";
import type { ResolvedCategory, V2FeaturedContent } from "../src/types/resolvedCollections";

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

function business(): PublicBusiness {
    return {
        id: ACTIVITY_ID,
        tenant_id: TENANT_ID,
        name: "Sede e2e barra",
        slug: SLUG,
        cover_image: null,
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
}

export const CATEGORIES = ["Antipasti", "Primi", "Secondi", "Dolci"];

function categories(): ResolvedCategory[] {
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

function payload(featuredSlots: FeaturedSlots, styleConfig?: StyleConfig): ResolvedPayloadShape {
    return {
        business: business(),
        tenantLogoUrl: null,
        base_language_code: "it",
        effective_language: "it",
        public_allergens: [],
        resolved: {
            catalog: { id: "catalog-1", name: "Menu", categories: categories() },
            featured: featuredSlots,
            hasRenderableItems: true,
            ...(styleConfig ? { style: { id: "style-1", name: "Stile e2e", config: styleConfig } } : {}),
        } as ResolvedPayloadShape["resolved"],
    };
}

export async function stubPublicPage(
    page: Page,
    opts: { ordering: boolean; featured?: FeaturedSlots; styleConfig?: StyleConfig }
): Promise<void> {
    const featuredSlots = opts.featured ?? { before_catalog: [featured()] };
    await page.route("**/api/public-catalog**", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload(featuredSlots, opts.styleConfig)) })
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
