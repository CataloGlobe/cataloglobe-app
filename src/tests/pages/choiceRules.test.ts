import { describe, expect, it } from "vitest";
import {
    choiceRulesFromMax,
    describeChoiceRules,
    MAX_SELECTABLE_ERROR,
    parseMaxSelectable
} from "@/pages/Dashboard/Products/components/choiceRules";

describe("parseMaxSelectable (r.8)", () => {
    it("«una sola» è 1", () => {
        expect(parseMaxSelectable("one", "")).toEqual({ ok: true, value: 1 });
        expect(parseMaxSelectable("one", "7")).toEqual({ ok: true, value: 1 });
    });

    it("«più d'una» con N vuoto è senza limite (null)", () => {
        expect(parseMaxSelectable("many", "")).toEqual({ ok: true, value: null });
        expect(parseMaxSelectable("many", "  ")).toEqual({ ok: true, value: null });
    });

    it("«più d'una» con N intero da 2 in su", () => {
        expect(parseMaxSelectable("many", "2")).toEqual({ ok: true, value: 2 });
        expect(parseMaxSelectable("many", " 5 ")).toEqual({ ok: true, value: 5 });
    });

    it("N = 1, 0, negativo o non intero è un errore", () => {
        for (const n of ["1", "0", "-3", "2.5", "2,5", "tre"]) {
            expect(parseMaxSelectable("many", n)).toEqual({ ok: false, error: MAX_SELECTABLE_ERROR });
        }
    });
});

describe("choiceRulesFromMax", () => {
    it("null si apre «più d'una», senza limite", () => {
        expect(choiceRulesFromMax(null)).toEqual({ mode: "many", n: "" });
    });

    it("un limite resta il suo numero, 1 resta «una sola»", () => {
        expect(choiceRulesFromMax(3)).toEqual({ mode: "many", n: "3" });
        expect(choiceRulesFromMax(1)).toEqual({ mode: "one", n: "2" });
    });

    it("aprire e rileggere non cambia il valore", () => {
        for (const max of [null, 1, 2, 4]) {
            const { mode, n } = choiceRulesFromMax(max);
            expect(parseMaxSelectable(mode, n)).toEqual({ ok: true, value: max });
        }
    });
});

describe("describeChoiceRules", () => {
    it("dice «senza limite» per null", () => {
        expect(describeChoiceRules("many", "", false)).toBe(
            "Il cliente sceglie più opzioni, senza limite, e può anche non sceglierla."
        );
        expect(describeChoiceRules("many", "3", true)).toBe(
            "Il cliente sceglie fino a 3 opzioni, e deve sceglierla per ordinare."
        );
    });
});
