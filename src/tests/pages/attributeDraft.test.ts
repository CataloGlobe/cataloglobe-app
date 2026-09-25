import { describe, expect, it } from "vitest";
import { attributeDraftFromRow, attributePayloadFromDraft, requiredError } from "@/pages/Dashboard/Products/attributeDraft";

const row = (r: Partial<{ value_text: string | null; value_number: number | null; value_boolean: boolean | null; value_json: unknown }> = {}) => ({
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_json: null,
    ...r
});

describe("attributeDraftFromRow", () => {
    it("porta ogni tipo a stringa", () => {
        expect(attributeDraftFromRow({ type: "text" }, row({ value_text: "M" }))).toBe("M");
        expect(attributeDraftFromRow({ type: "number" }, row({ value_number: 3.5 }))).toBe("3.5");
        expect(attributeDraftFromRow({ type: "boolean" }, row({ value_boolean: true }))).toBe("true");
        expect(attributeDraftFromRow({ type: "multi_select" }, row({ value_json: ["Rosso", "Blu"] }))).toBe("Rosso, Blu");
    });

    it("senza valore: vuoto, e «false» per un sì/no", () => {
        expect(attributeDraftFromRow({ type: "text" }, undefined)).toBe("");
        expect(attributeDraftFromRow({ type: "boolean" }, undefined)).toBe("false");
    });
});

describe("attributePayloadFromDraft", () => {
    it("torna al campo tipato", () => {
        expect(attributePayloadFromDraft({ type: "text" }, "  M ")).toEqual({ value_text: "M" });
        expect(attributePayloadFromDraft({ type: "text" }, "   ")).toEqual({ value_text: null });
        expect(attributePayloadFromDraft({ type: "number" }, "3,5")).toEqual({ value_number: 3.5 });
        expect(attributePayloadFromDraft({ type: "number" }, "")).toEqual({ value_number: null });
        expect(attributePayloadFromDraft({ type: "boolean" }, "true")).toEqual({ value_boolean: true });
        expect(attributePayloadFromDraft({ type: "multi_select" }, "Rosso, , Blu")).toEqual({ value_json: ["Rosso", "Blu"] });
        expect(attributePayloadFromDraft({ type: "multi_select" }, "")).toEqual({ value_json: null });
    });
});

describe("requiredError", () => {
    it("solo per i richiesti vuoti, mai per un sì/no", () => {
        expect(requiredError({ type: "text", is_required: true }, { value_text: null })).toBe("Campo obbligatorio");
        expect(requiredError({ type: "text", is_required: true }, { value_text: "M" })).toBeNull();
        expect(requiredError({ type: "text", is_required: false }, { value_text: null })).toBeNull();
        expect(requiredError({ type: "number", is_required: true }, { value_number: 0 })).toBeNull();
        expect(requiredError({ type: "boolean", is_required: true }, { value_boolean: false })).toBeNull();
    });
});
