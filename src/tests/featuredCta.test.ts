import { describe, expect, it } from "vitest";
import { hasFeaturedCta, isReservationCta } from "@/components/PublicCollectionView/FeaturedBlock/featuredCta";
import type { V2FeaturedContent } from "@/types/resolvedCollections";

function block(over: Partial<V2FeaturedContent>): V2FeaturedContent {
    return { cta_text: "Ordina", cta_url: "https://example.com", cta_action: "link", ...over } as V2FeaturedContent;
}

describe("hasFeaturedCta", () => {
    it("link: serve testo e URL http(s) sicuro", () => {
        expect(hasFeaturedCta(block({}))).toBe(true);
        expect(hasFeaturedCta(block({ cta_url: "javascript:alert(1)" }))).toBe(false);
        expect(hasFeaturedCta(block({ cta_url: null }))).toBe(false);
        expect(hasFeaturedCta(block({ cta_text: null }))).toBe(false);
    });

    it("link: cta_action assente vale come link (righe senza il campo)", () => {
        expect(hasFeaturedCta(block({ cta_action: undefined }))).toBe(true);
    });

    it("prenota: visibile solo se la sede ha le prenotazioni attive", () => {
        const prenota = block({ cta_action: "reservation", cta_url: null, cta_text: "Prenota" });
        expect(isReservationCta(prenota)).toBe(true);
        expect(hasFeaturedCta(prenota, true)).toBe(true);
        expect(hasFeaturedCta(prenota, false)).toBe(false);
        expect(hasFeaturedCta(prenota)).toBe(false);
    });

    it("prenota: ignora cta_url", () => {
        const prenota = block({ cta_action: "reservation", cta_url: "javascript:alert(1)", cta_text: "Prenota" });
        expect(hasFeaturedCta(prenota, true)).toBe(true);
    });
});
