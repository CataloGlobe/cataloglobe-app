import { describe, it, expect } from "vitest";
import { sharedRuleNotice } from "@/pages/Dashboard/Programming/sharedRuleNotice";

// La barra di una regola aperta dalla sede (T9b, PG7): dice se cambiandola
// cambia anche altrove.
const sedi = [
    { id: "g", name: "Garbagnate" },
    { id: "c", name: "Comasina" },
    { id: "b", name: "Baranzate" },
    { id: "m", name: "Milano" }
];
const groups = new Map([["grp", ["g", "c", "b"]]]);
const rule = (o: { applyToAll?: boolean; activityIds?: string[]; groupIds?: string[] }) => ({
    applyToAll: o.applyToAll ?? false,
    activityIds: o.activityIds ?? [],
    groupIds: o.groupIds ?? []
});

describe("sharedRuleNotice", () => {
    it("solo questa sede: niente barra", () => {
        expect(sharedRuleNotice(rule({ activityIds: ["g"] }), "g", sedi, groups)).toBeNull();
    });

    it("due sedi: le nomina entrambe", () => {
        expect(sharedRuleNotice(rule({ activityIds: ["g", "c"] }), "g", sedi, groups)).toBe(
            "Vale per Garbagnate e anche per Comasina: se la cambi, cambia in entrambe."
        );
    });

    it("tre o più sedi, anche da un gruppo: conta le altre", () => {
        expect(sharedRuleNotice(rule({ groupIds: ["grp"] }), "g", sedi, groups)).toBe(
            "Vale per Garbagnate e anche per altre 2 sedi: se la cambi, cambia in tutte."
        );
    });

    it("una sede che chi guarda non vede conta lo stesso, senza nome", () => {
        expect(sharedRuleNotice(rule({ activityIds: ["g", "x"] }), "g", sedi, groups)).toBe(
            "Vale per Garbagnate e anche per un'altra sede: se la cambi, cambia in entrambe."
        );
    });

    it("tutte le sedi", () => {
        expect(sharedRuleNotice(rule({ applyToAll: true }), "c", sedi, groups)).toBe(
            "Vale per tutte le sedi: se la cambi, cambia anche fuori da Comasina."
        );
    });
});
