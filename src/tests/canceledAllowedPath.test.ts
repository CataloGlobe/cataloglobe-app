import { describe, expect, it } from "vitest";
import { isCanceledAllowedPath } from "@/layouts/MainLayout/canceledAllowedPath";

const T = "t1";

describe("isCanceledAllowedPath", () => {
    it("lascia Abbonamento e il vecchio /subscription", () => {
        expect(isCanceledAllowedPath(`/business/${T}/settings/abbonamento`, T)).toBe(true);
        expect(isCanceledAllowedPath(`/business/${T}/subscription`, T)).toBe(true);
    });

    it("lascia i dati di fatturazione (/settings esatto, anche con la barra finale)", () => {
        expect(isCanceledAllowedPath(`/business/${T}/settings`, T)).toBe(true);
        expect(isCanceledAllowedPath(`/business/${T}/settings/`, T)).toBe(true);
    });

    it("rimanda tutto il resto, anche le altre impostazioni e le altre aziende", () => {
        expect(isCanceledAllowedPath(`/business/${T}/products`, T)).toBe(false);
        expect(isCanceledAllowedPath(`/business/${T}/settings/team`, T)).toBe(false);
        expect(isCanceledAllowedPath(`/business/altro/settings`, T)).toBe(false);
        expect(isCanceledAllowedPath(`/business/${T}/locations/x/settings`, T)).toBe(false);
    });
});
