import { describe, expect, it } from "vitest";
import { geaPageCaption, geaPageOf, geaSuggestions, isCrmPath } from "@/utils/crm/gea";

describe("Gea dal computer: pagina aperta", () => {
    it("riconosce le pagine del CRM e la scheda di un lead", () => {
        expect(geaPageOf("/admin")).toEqual({ kind: "page", name: "Home" });
        expect(geaPageOf("/admin/")).toEqual({ kind: "page", name: "Home" });
        expect(geaPageOf("/admin/agenda")).toEqual({ kind: "page", name: "Agenda" });
        expect(geaPageOf("/admin/lead")).toEqual({ kind: "page", name: "Lead" });
        expect(geaPageOf("/admin/lead/abc")).toEqual({ kind: "lead", venueId: "abc" });
        expect(geaPageOf("/admin/support")).toBeNull();
        expect(isCrmPath("/admin/incidents")).toBe(false);
        expect(isCrmPath("/admin/costi")).toBe(true);
    });

    it("propone domande che parlano della pagina", () => {
        expect(geaSuggestions({ kind: "lead", venueId: "abc" })[0]).toBe("Riassumi questo lead");
        expect(geaSuggestions(null)).toContain("Riassumi la giornata");
        expect(geaPageCaption({ kind: "page", name: "Home" })).toBe("vede la pagina che hai aperto");
    });
});

describe("Gea dal computer: errori", () => {
    it("dice se la funzione non c'è ancora, se manchi nel team, o di riprovare", async () => {
        const { geaErrorMessage } = await import("@/utils/crm/gea");
        expect(geaErrorMessage({ name: "FunctionsHttpError", context: { status: 404 } })).toContain("non è ancora attiva");
        expect(geaErrorMessage({ name: "FunctionsFetchError" })).toBe("Gea non ha risposto. Riprova tra poco.");
        expect(geaErrorMessage({ name: "FunctionsHttpError", context: { status: 403 } })).toContain("team");
        expect(geaErrorMessage(new Error("x"))).toBe("Gea non ha risposto. Riprova tra poco.");
    });
});
