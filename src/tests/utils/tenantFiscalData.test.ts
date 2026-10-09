import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { tenantHasFiscalData } from "@/utils/tenantFiscalData";
import { BILLING_FIELD_MAX } from "@/components/Businesses/CreateBusinessWizard/steps/billingLimits";
import type { TenantFiscalProfile } from "@/services/supabase/tenants";

const address = {
    address: "Via Roma",
    street_number: "1",
    postal_code: "20100",
    city: "Milano",
    province: "MI",
    country: "IT"
};

const societa: TenantFiscalProfile = {
    legal_entity_type: "societa",
    legal_name: "Trattoria Srl",
    vat_number: "12345678901",
    fiscal_code: null,
    first_name: null,
    last_name: null,
    codice_destinatario: "ABC1234",
    pec: null,
    ...address
};

describe("tenantHasFiscalData", () => {
    it("società completa: ok", () => {
        expect(tenantHasFiscalData(societa)).toBe(true);
    });

    it("senza tipo di soggetto: mancante", () => {
        expect(tenantHasFiscalData({ ...societa, legal_entity_type: null })).toBe(false);
    });

    it("ragione sociale oltre il limite conta come mancante", () => {
        expect(tenantHasFiscalData({ ...societa, legal_name: "x".repeat(BILLING_FIELD_MAX.legalName + 1) })).toBe(false);
    });

    it("città oltre il limite o indirizzo vuoto: mancante", () => {
        expect(tenantHasFiscalData({ ...societa, city: "x".repeat(BILLING_FIELD_MAX.city + 1) })).toBe(false);
        expect(tenantHasFiscalData({ ...societa, address: "  " })).toBe(false);
    });

    it("PEC facoltativa ma oltre il limite: mancante", () => {
        expect(tenantHasFiscalData({ ...societa, pec: "x".repeat(BILLING_FIELD_MAX.pec + 1) })).toBe(false);
    });

    it("con P.IVA serve SDI o PEC", () => {
        expect(tenantHasFiscalData({ ...societa, codice_destinatario: null, pec: null })).toBe(false);
        expect(tenantHasFiscalData({ ...societa, codice_destinatario: null, pec: "a@pec.it" })).toBe(true);
    });

    it("professionista: servono nome, cognome e codice fiscale", () => {
        const pro: TenantFiscalProfile = {
            ...societa,
            legal_entity_type: "professionista",
            legal_name: null,
            fiscal_code: "RSSMRA80A01F205X",
            first_name: "Mario",
            last_name: "Rossi"
        };
        expect(tenantHasFiscalData(pro)).toBe(true);
        expect(tenantHasFiscalData({ ...pro, last_name: "" })).toBe(false);
    });

    it("associazione: codice fiscale e denominazione", () => {
        const asso: TenantFiscalProfile = {
            ...societa,
            legal_entity_type: "associazione",
            vat_number: null,
            fiscal_code: "97000000000",
            codice_destinatario: null
        };
        expect(tenantHasFiscalData(asso)).toBe(true);
        expect(tenantHasFiscalData({ ...asso, fiscal_code: null })).toBe(false);
    });
});

describe("gate fiscale prima del checkout", () => {
    const read = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

    it("SubscriptionPage controlla i dati fiscali prima di createCheckoutSession", () => {
        const src = read("pages/Business/SubscriptionPage.tsx");
        const handler = src.slice(src.indexOf("const handleCheckout = async"));
        const gate = handler.indexOf("tenantHasFiscalData(fiscal)");
        expect(gate).toBeGreaterThan(-1);
        expect(gate).toBeLessThan(handler.indexOf("createCheckoutSession("));
    });

    it("il wizard usa la stessa regola", () => {
        const src = read("components/Businesses/CreateBusinessWizard/CreateBusinessWizard.tsx");
        expect(src).toContain('import { tenantHasFiscalData } from "@/utils/tenantFiscalData"');
        expect(src).not.toMatch(/function tenantHasFiscalData/);
    });
});
