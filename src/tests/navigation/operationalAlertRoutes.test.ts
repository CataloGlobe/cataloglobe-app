import { describe, expect, it } from "vitest";
import { alertTarget, isAlertViewOpen } from "@/utils/operationalAlertRoutes";

const B = "b1";
const A = "a1";
const base = `/business/${B}/locations/${A}`;

describe("alertTarget", () => {
    it("porta alla vista della sede da cui viene l'avviso", () => {
        expect(alertTarget(B, A, "tables")).toBe(`${base}/comande?tab=tavoli`);
        expect(alertTarget(B, A, "orders")).toBe(`${base}/comande`);
    });

    it("senza sede, la rotta d'azienda che porta all'ultima usata", () => {
        expect(alertTarget(B, null, "tables")).toBe(`/business/${B}/orders?tab=tavoli`);
        expect(alertTarget(B, undefined, "orders")).toBe(`/business/${B}/orders`);
    });
});

describe("isAlertViewOpen", () => {
    it("tace sui tavoli della stessa sede", () => {
        expect(isAlertViewOpen(`${base}/comande`, "?tab=tavoli", B, A, "tables")).toBe(true);
    });

    it("parla sui tavoli di un'altra sede", () => {
        expect(isAlertViewOpen(`/business/${B}/locations/a2/comande`, "?tab=tavoli", B, A, "tables")).toBe(false);
    });

    it("la board senza ?tab= è la vista delle comande, non dei tavoli", () => {
        expect(isAlertViewOpen(`${base}/comande`, "", B, A, "orders")).toBe(true);
        expect(isAlertViewOpen(`${base}/comande`, "", B, A, "tables")).toBe(false);
    });

    it("la vecchia rotta d'azienda non conta: è un redirect", () => {
        expect(isAlertViewOpen(`/business/${B}/orders`, "?tab=tavoli", B, A, "tables")).toBe(false);
    });

    it("senza sede nota non tace mai", () => {
        expect(isAlertViewOpen(`${base}/comande`, "", B, null, "orders")).toBe(false);
    });
});
