import { describe, it, expect } from "vitest";
import { ALLERGIES_MAX_LENGTH, parseAllergies } from "./reservationAllergies";

describe("parseAllergies", () => {
    it("senza allergie non salva nulla", () => {
        expect(parseAllergies({})).toEqual({ ok: true, value: null });
        expect(parseAllergies({ allergies: null })).toEqual({ ok: true, value: null });
        expect(parseAllergies({ allergies: "   ", allergies_consent_version: "2026-10-05" }))
            .toEqual({ ok: true, value: null });
    });

    it("con consenso valido salva testo ripulito e versione", () => {
        expect(parseAllergies({ allergies: "  arachidi ", allergies_consent_version: "2026-10-05" }))
            .toEqual({ ok: true, value: { allergies: "arachidi", consentVersion: "2026-10-05" } });
    });

    it("rifiuta allergie senza consenso", () => {
        const r = parseAllergies({ allergies: "glutine" });
        expect(r).toMatchObject({ ok: false, details: { field: "allergies_consent_version", reason: "missing_consent" } });
    });

    it("rifiuta una versione del consenso sconosciuta", () => {
        const r = parseAllergies({ allergies: "glutine", allergies_consent_version: "2020-01-01" });
        expect(r).toMatchObject({ ok: false, details: { reason: "missing_consent" } });
    });

    it("rifiuta tipo sbagliato e testo troppo lungo", () => {
        expect(parseAllergies({ allergies: 42 })).toMatchObject({ ok: false, details: { reason: "type" } });
        expect(parseAllergies({
            allergies: "a".repeat(ALLERGIES_MAX_LENGTH + 1),
            allergies_consent_version: "2026-10-05"
        })).toMatchObject({ ok: false, details: { reason: "too_long" } });
    });
});
