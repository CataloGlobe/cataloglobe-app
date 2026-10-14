import { afterEach, describe, expect, it } from "vitest";
import {
    availablePreferences,
    clearPreferences,
    getPreferences,
    keepPreferencesFor,
    matchesPreferences,
    togglePreference
} from "@/components/PublicCollectionView/redesign/search/preferences";

type Code = { code: string; category: "diet" | "spicy" | "origin" | "preparation" | "warning" | "status" };

const vegetarian: Code = { code: "vegetarian", category: "diet" };
const vegan: Code = { code: "vegan", category: "diet" };
const glutenFree: Code = { code: "gluten_free", category: "diet" };
const hot: Code = { code: "spicy_hot", category: "spicy" };
const mild: Code = { code: "spicy_mild", category: "spicy" };

const dish = (...characteristics: Code[]) => ({ characteristics });

afterEach(() => clearPreferences());

describe("matchesPreferences", () => {
    it("nessuna preferenza: passa tutto, anche senza caratteristiche", () => {
        expect(matchesPreferences({}, [])).toBe(true);
        expect(matchesPreferences(dish(), [])).toBe(true);
    });

    it("un piatto vegano è anche vegetariano, non il contrario", () => {
        expect(matchesPreferences(dish(vegan), ["vegetarian"])).toBe(true);
        expect(matchesPreferences(dish(vegetarian), ["vegan"])).toBe(false);
    });

    it("piccante vale per ogni grado", () => {
        expect(matchesPreferences(dish(mild), ["spicy"])).toBe(true);
        expect(matchesPreferences(dish(hot), ["spicy"])).toBe(true);
        expect(matchesPreferences(dish(glutenFree), ["spicy"])).toBe(false);
    });

    it("più preferenze valgono insieme", () => {
        expect(matchesPreferences(dish(vegan, hot), ["vegan", "spicy"])).toBe(true);
        expect(matchesPreferences(dish(vegan), ["vegan", "spicy"])).toBe(false);
    });

    it("un piatto senza caratteristiche non passa una preferenza", () => {
        expect(matchesPreferences({}, ["vegetarian"])).toBe(false);
    });
});

describe("availablePreferences", () => {
    it("solo quelle con almeno un piatto, nell'ordine fisso", () => {
        expect(availablePreferences([dish(hot), dish(vegan)])).toEqual(["vegetarian", "vegan", "spicy"]);
        expect(availablePreferences([dish(vegetarian)])).toEqual(["vegetarian"]);
        expect(availablePreferences([dish(glutenFree), {}])).toEqual([]);
    });
});

describe("stato della visita", () => {
    it("acceso e spento, in ordine fisso; azzera torna vuoto", () => {
        togglePreference("spicy");
        togglePreference("vegetarian");
        expect(getPreferences()).toEqual(["vegetarian", "spicy"]);
        togglePreference("spicy");
        expect(getPreferences()).toEqual(["vegetarian"]);
        clearPreferences();
        expect(getPreferences()).toEqual([]);
    });
});

describe("keepPreferencesFor", () => {
    it("stessa sede: restano; un'altra sede: ripartono vuote", () => {
        keepPreferencesFor("sede-a");
        togglePreference("vegan");
        keepPreferencesFor("sede-a");
        expect(getPreferences()).toEqual(["vegan"]);
        keepPreferencesFor("sede-b");
        expect(getPreferences()).toEqual([]);
    });
});
