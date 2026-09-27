import { describe, expect, it } from "vitest";
import { ACTIVITY_SEARCH_THRESHOLD, filterActivityOptions } from "@/components/ui/ActivityMultiSelect/activityFilter";

const SEDI = [{ name: "Garbagnate" }, { name: "Comasina" }, { name: "Città Studi" }, { name: "Varedo" }];

describe("filterActivityOptions", () => {
    it("senza ricerca, tutte", () => {
        expect(filterActivityOptions(SEDI, "  ")).toEqual(SEDI);
    });

    it("contiene, senza badare a maiuscole e accenti", () => {
        expect(filterActivityOptions(SEDI, "CITTA").map(s => s.name)).toEqual(["Città Studi"]);
        expect(filterActivityOptions(SEDI, "as").map(s => s.name)).toEqual(["Comasina"]);
        expect(filterActivityOptions(SEDI, "zzz")).toEqual([]);
    });

    it("la ricerca compare sopra le 8 sedi", () => {
        expect(ACTIVITY_SEARCH_THRESHOLD).toBe(8);
    });
});
