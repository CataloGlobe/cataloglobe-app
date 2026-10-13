import { describe, expect, it } from "vitest";
import { targetChoice } from "@/pages/Dashboard/Programming/components/targetChoice";

// Dove si applica una regola: dalle sedi spuntate a tutte / gruppi / sedi (D151, review #360.8).
const sedi = ["a", "b", "c", "d", "e"].map(id => ({ id }));
const gruppi = [
    { id: "nord", sedeIds: ["a", "b"] },
    { id: "sud", sedeIds: ["c", "d"] }
];
const free = { allowAllSites: true, groupIds: [] };

describe("targetChoice", () => {
    it("tutte prese = tutte; un gruppo intero = il gruppo; il resto sedi specifiche", () => {
        expect(targetChoice(["a", "b", "c", "d", "e"], sedi, gruppi, free)).toEqual({ targetMode: "all", activityIds: [], groupIds: [] });
        expect(targetChoice(["b", "a"], sedi, gruppi, free)).toEqual({ targetMode: "groups", activityIds: [], groupIds: ["nord"] });
        expect(targetChoice(["a", "c"], sedi, gruppi, free)).toEqual({ targetMode: "activities", activityIds: ["a", "c"], groupIds: [] });
        expect(targetChoice(["a", "b", "c", "d", "e"], sedi, gruppi, { ...free, allowAllSites: false }).targetMode).toBe("activities");
    });

    it("una regola su due gruppi resta sui due gruppi finché le sedi sono le loro (#360.8)", () => {
        const onTwo = { allowAllSites: true, groupIds: ["nord", "sud"] };
        expect(targetChoice(["a", "b", "c", "d"], sedi, gruppi, onTwo)).toEqual({ targetMode: "groups", activityIds: [], groupIds: ["nord", "sud"] });
        // tolta una sede di un gruppo: resta l'altro gruppo più una sede → sedi specifiche
        expect(targetChoice(["a", "b", "c"], sedi, gruppi, onTwo)).toEqual({ targetMode: "activities", activityIds: ["a", "b", "c"], groupIds: [] });
        // aggiunta una sede fuori dai gruppi
        expect(targetChoice(["a", "b", "c", "d", "e"], sedi, gruppi, { ...onTwo, allowAllSites: false }).targetMode).toBe("activities");
        // chi non era sui gruppi non ci finisce per caso
        expect(targetChoice(["a", "b", "c", "d"], sedi, gruppi, free).targetMode).toBe("activities");
    });
});
