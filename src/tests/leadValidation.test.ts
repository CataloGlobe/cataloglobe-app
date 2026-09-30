import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanLeadMeta, validateLead } from "@/utils/leadValidation";
import { normalizePhoneToE164 } from "@/utils/phoneNormalize";

const phone = (raw: string) => normalizePhoneToE164(raw);
const valid = { name: "Mario Rossi", venueName: "Trattoria da Mario", phone: "345 155 9558", consent: true };

describe("validateLead", () => {
    it("contatto valido: telefono in E.164, email assente → null, interessi in ordine fisso", () => {
        const r = validateLead({ ...valid, interests: ["ordini", "menu", "menu"] }, phone);
        expect(r).toEqual({
            ok: true,
            value: { name: "Mario Rossi", venueName: "Trattoria da Mario", phone: "+393451559558", email: null, interests: ["menu", "ordini"] }
        });
    });

    it("spazi ripuliti, email in minuscolo", () => {
        const r = validateLead({ ...valid, name: "  Mario   Rossi ", email: " Mario@Esempio.IT " }, phone);
        expect(r.ok && r.value).toMatchObject({ name: "Mario Rossi", email: "mario@esempio.it" });
    });

    it("campi obbligatori e consenso", () => {
        const r = validateLead({ name: " ", venueName: "", phone: "", consent: false }, phone);
        expect(r).toEqual({ ok: false, errors: { name: "required", venueName: "required", phone: "required", consent: "required" } });
    });

    it("consenso: vale solo true, non una stringa", () => {
        const r = validateLead({ ...valid, consent: "true" }, phone);
        expect(r.ok).toBe(false);
    });

    it("telefono non valido, email non valida, testi troppo lunghi", () => {
        const r = validateLead({ ...valid, phone: "12", email: "mario@", name: "x".repeat(121), venueName: "y".repeat(161) }, phone);
        expect(r).toEqual({ ok: false, errors: { phone: "invalid", email: "invalid", name: "too_long", venueName: "too_long" } });
    });

    it("telefono con prefisso internazionale e fisso italiano", () => {
        const a = validateLead({ ...valid, phone: "+39 02 1234 5678" }, phone);
        expect(a.ok && a.value.phone).toBe("+390212345678");
    });

    it("interessi fuori elenco o non array → invalid", () => {
        expect(validateLead({ ...valid, interests: ["menu", "hacker"] }, phone)).toMatchObject({ ok: false, errors: { interests: "invalid" } });
        expect(validateLead({ ...valid, interests: "menu" }, phone)).toMatchObject({ ok: false, errors: { interests: "invalid" } });
    });

    it("cleanLeadMeta accorcia e scarta i valori vuoti o non stringa", () => {
        expect(cleanLeadMeta("  facebook ")).toBe("facebook");
        expect(cleanLeadMeta("")).toBeNull();
        expect(cleanLeadMeta(42)).toBeNull();
        expect(cleanLeadMeta("a".repeat(300))).toHaveLength(200);
    });
});

describe("leadValidation ⚠️ SYNC", () => {
    it("copia FE e copia Edge identiche sotto l'intestazione", () => {
        const body = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8").split("\n").slice(4).join("\n");
        expect(body("src/utils/leadValidation.ts")).toBe(body("supabase/functions/_shared/leadValidation.ts"));
    });
});

describe("readUtm", () => {
    it("legge solo le cinque chiavi utm, scarta le vuote", async () => {
        const { readUtm } = await import("@/pages/CampaignLanding/attribution");
        expect(readUtm("?utm_source=facebook&utm_medium=&utm_campaign=autunno&fbclid=x")).toEqual({ utm_source: "facebook", utm_campaign: "autunno" });
        expect(readUtm("")).toEqual({});
    });
});
