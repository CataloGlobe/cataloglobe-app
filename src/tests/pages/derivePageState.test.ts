import { describe, expect, it } from "vitest";

import {
    derivePageState,
    resolveRedirect
} from "@/pages/PublicCollectionPage/derivePageState";
import type { PublicBusiness, ResolvedPayloadShape } from "@/types/publicCatalog";

/* ── Fixtures ───────────────────────────────────────────────────────────── */

function makeBusiness(overrides: Partial<PublicBusiness> = {}): PublicBusiness {
    return {
        id: "act-1",
        tenant_id: "ten-1",
        name: "Sede Test",
        slug: "sede-test",
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
        google_review_url: null,
        hours_public: false,
        payment_methods: [],
        services: [],
        fees: [],
        ...overrides
    };
}

function makePayload(overrides: Partial<ResolvedPayloadShape> = {}): ResolvedPayloadShape {
    return {
        business: makeBusiness(),
        tenantLogoUrl: null,
        resolved: {
            catalog: {
                id: "cat-1",
                name: "Menu",
                categories: []
            } as unknown as NonNullable<ResolvedPayloadShape["resolved"]["catalog"]>
        },
        ...overrides
    };
}

/* ── resolveRedirect ────────────────────────────────────────────────────── */

describe("resolveRedirect", () => {
    it("redirige allo slug canonico quando diverso da quello richiesto", () => {
        const payload = makePayload({ canonical_slug: "slug-canonico" });
        expect(
            resolveRedirect(payload, { fromCache: false, slug: "alias-vecchio" })
        ).toBe("/slug-canonico");
    });

    it("non redirige quando canonical_slug coincide con lo slug corrente", () => {
        const payload = makePayload({ canonical_slug: "sede-test" });
        expect(resolveRedirect(payload, { fromCache: false, slug: "sede-test" })).toBeNull();
    });

    it("redirige alla base su lang non supportata", () => {
        const payload = makePayload({ lang_unsupported: true });
        expect(
            resolveRedirect(payload, { fromCache: false, slug: "sede-test", requestedLang: "xx" })
        ).toBe("/sede-test");
    });

    it("strippa la lang quando coincide con la lingua base", () => {
        const payload = makePayload({ base_language_code: "it" });
        expect(
            resolveRedirect(payload, { fromCache: false, slug: "sede-test", requestedLang: "it" })
        ).toBe("/sede-test");
    });

    it("non redirige quando la lang richiesta è diversa dalla base", () => {
        const payload = makePayload({ base_language_code: "it" });
        expect(
            resolveRedirect(payload, { fromCache: false, slug: "sede-test", requestedLang: "en" })
        ).toBeNull();
    });

    it("gate fromCache: mai redirect su payload da cache", () => {
        const payload = makePayload({
            canonical_slug: "slug-canonico",
            lang_unsupported: true,
            base_language_code: "it"
        });
        expect(
            resolveRedirect(payload, { fromCache: true, slug: "alias-vecchio", requestedLang: "it" })
        ).toBeNull();
    });

    it("priorità: canonical_slug vince su lang_unsupported (ordine odierno)", () => {
        const payload = makePayload({ canonical_slug: "slug-canonico", lang_unsupported: true });
        expect(
            resolveRedirect(payload, { fromCache: false, slug: "alias-vecchio", requestedLang: "xx" })
        ).toBe("/slug-canonico");
    });

    it("è pura: non muta il payload", () => {
        const payload = makePayload({ canonical_slug: "slug-canonico" });
        const snapshot = JSON.parse(JSON.stringify(payload));
        resolveRedirect(payload, { fromCache: false, slug: "alias-vecchio" });
        expect(payload).toEqual(snapshot);
    });
});

/* ── derivePageState ────────────────────────────────────────────────────── */

describe("derivePageState", () => {
    it("subscription_inactive ha precedenza su tutto", () => {
        const payload = makePayload({
            subscription_inactive: true,
            business: makeBusiness({ status: "inactive" })
        });
        expect(derivePageState(payload, null)).toEqual({ status: "subscription_inactive" });
    });

    it("business non attivo → inactive, nessun motivo esposto al chiamante", () => {
        const payload = makePayload({
            business: makeBusiness({ status: "inactive" })
        });
        expect(derivePageState(payload, null)).toEqual({ status: "inactive" });
    });

    it("nessun catalogo né featured → empty con business e tenantLogoUrl", () => {
        const payload = makePayload({ resolved: {}, tenantLogoUrl: "https://logo.example/x.png" });
        const state = derivePageState(payload, null);
        expect(state.status).toBe("empty");
        if (state.status === "empty") {
            expect(state.business.id).toBe("act-1");
            expect(state.tenantLogoUrl).toBe("https://logo.example/x.png");
        }
    });

    it("featured-only (niente catalogo) NON è empty", () => {
        const payload = makePayload({
            resolved: {
                featured: {
                    before_catalog: [{ id: "f1" } as never]
                }
            }
        });
        expect(derivePageState(payload, null).status).toBe("ready");
    });

    it("ready: default lingua quando i campi lingua mancano", () => {
        const state = derivePageState(makePayload(), null);
        expect(state.status).toBe("ready");
        if (state.status === "ready") {
            expect(state.baseLanguage).toBe("it");
            expect(state.effectiveLanguage).toBe("it");
            expect(state.availableLanguages).toEqual([
                { code: "it", name_native: "Italiano", flag_emoji: null }
            ]);
        }
    });

    it("ready: lingua effettiva e disponibili dal payload quando presenti", () => {
        const langs = [
            { code: "it", name_native: "Italiano", flag_emoji: null },
            { code: "en", name_native: "English", flag_emoji: null }
        ];
        const state = derivePageState(
            makePayload({
                base_language_code: "it",
                effective_language: "en",
                available_languages: langs
            }),
            null
        );
        if (state.status === "ready") {
            expect(state.effectiveLanguage).toBe("en");
            expect(state.availableLanguages).toEqual(langs);
        } else {
            expect.unreachable("expected ready");
        }
    });

    it("ready: orari nascosti quando hours_public=false anche se presenti nel payload", () => {
        const state = derivePageState(
            makePayload({
                business: makeBusiness({ hours_public: false }),
                opening_hours: [{ day: 1 } as never],
                upcoming_closures: [{ date: "2026-06-15" } as never]
            }),
            null
        );
        if (state.status === "ready") {
            expect(state.openingHours).toBeUndefined();
            expect(state.upcomingClosures).toBeUndefined();
        } else {
            expect.unreachable("expected ready");
        }
    });

    it("ready: orari esposti quando hours_public=true", () => {
        const hours = [{ day: 1 } as never];
        const state = derivePageState(
            makePayload({
                business: makeBusiness({ hours_public: true }),
                opening_hours: hours
            }),
            null
        );
        if (state.status === "ready") {
            expect(state.openingHours).toEqual(hours);
        } else {
            expect.unreachable("expected ready");
        }
    });

    it("ready: allergens passthrough (iniettati dal chiamante)", () => {
        const allergens = [{ id: 1, code: "glutine" } as never];
        const state = derivePageState(makePayload(), allergens);
        if (state.status === "ready") {
            expect(state.allergens).toBe(allergens);
        } else {
            expect.unreachable("expected ready");
        }
        const stateNull = derivePageState(makePayload(), null);
        if (stateNull.status === "ready") {
            expect(stateNull.allergens).toBeNull();
        }
    });

    it("ready: non setta i flag isRefetching/isStale (competenza del chiamante)", () => {
        const state = derivePageState(makePayload(), null);
        if (state.status === "ready") {
            expect("isRefetching" in state).toBe(false);
            expect("isStale" in state).toBe(false);
        } else {
            expect.unreachable("expected ready");
        }
    });

    it("è pura: stesso input → stesso output, payload non mutato", () => {
        const payload = makePayload();
        const snapshot = JSON.parse(JSON.stringify(payload));
        const a = derivePageState(payload, null);
        const b = derivePageState(payload, null);
        expect(a).toEqual(b);
        expect(payload).toEqual(snapshot);
    });
});
