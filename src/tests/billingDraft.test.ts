import { describe, it, expect } from "vitest";
import {
    isBillingDraftComplete,
    billingRecipientRequired,
    billingDraftToPayload,
    type BillingDraft
} from "@/pages/Business/components/billingDraft";

// P.IVA con check-digit valido (12345678903) e CF persona fisica valido.
const VALID_VAT = "12345678903";
const VALID_CF = "RSSMRA80A01H501U";

const baseAddress = {
    address: "Via Test",
    streetNumber: "1",
    postalCode: "20121",
    city: "Milano",
    province: "MI",
    country: "IT"
};

function draft(over: Partial<BillingDraft>): BillingDraft {
    return {
        entityType: "",
        legalName: "",
        vatNumber: "",
        fiscalCode: "",
        firstName: "",
        lastName: "",
        pec: "",
        codiceDestinatario: "",
        ...baseAddress,
        ...over
    };
}

describe("isBillingDraftComplete", () => {
    it("società completa con recapito SDI → true", () => {
        expect(
            isBillingDraftComplete(
                draft({ entityType: "societa", legalName: "Trattoria S.r.l.", vatNumber: VALID_VAT, codiceDestinatario: "ABCDEFG" })
            )
        ).toBe(true);
    });

    it("con P.IVA ma senza SDI né PEC → false (recapito obbligatorio)", () => {
        expect(
            isBillingDraftComplete(draft({ entityType: "societa", legalName: "Trattoria S.r.l.", vatNumber: VALID_VAT }))
        ).toBe(false);
    });

    it("recapito via sola PEC → true", () => {
        expect(
            isBillingDraftComplete(
                draft({ entityType: "societa", legalName: "Trattoria S.r.l.", vatNumber: VALID_VAT, pec: "a@pec.it" })
            )
        ).toBe(true);
    });

    it("P.IVA con check-digit errato → false", () => {
        expect(
            isBillingDraftComplete(
                draft({ entityType: "societa", legalName: "Trattoria S.r.l.", vatNumber: "12345678901", codiceDestinatario: "ABCDEFG" })
            )
        ).toBe(false);
    });

    it("professionista completo → true", () => {
        expect(
            isBillingDraftComplete(
                draft({
                    entityType: "professionista",
                    vatNumber: VALID_VAT,
                    fiscalCode: VALID_CF,
                    firstName: "Mario",
                    lastName: "Rossi",
                    pec: "a@pec.it"
                })
            )
        ).toBe(true);
    });

    it("professionista senza codice fiscale → false", () => {
        expect(
            isBillingDraftComplete(
                draft({ entityType: "professionista", vatNumber: VALID_VAT, firstName: "Mario", lastName: "Rossi", pec: "a@pec.it" })
            )
        ).toBe(false);
    });

    it("associazione senza P.IVA (recapito non richiesto) → true", () => {
        expect(
            isBillingDraftComplete(draft({ entityType: "associazione", legalName: "ASD Test", fiscalCode: "12345678903" }))
        ).toBe(true);
    });

    it("associazione con P.IVA ma senza recapito → false", () => {
        expect(
            isBillingDraftComplete(
                draft({ entityType: "associazione", legalName: "ASD Test", fiscalCode: "12345678903", vatNumber: VALID_VAT })
            )
        ).toBe(false);
    });

    it("tipologia non scelta → false", () => {
        expect(isBillingDraftComplete(draft({ vatNumber: VALID_VAT, codiceDestinatario: "ABCDEFG" }))).toBe(false);
    });

    it("CAP non valido → false", () => {
        expect(
            isBillingDraftComplete(
                draft({ entityType: "societa", legalName: "X", vatNumber: VALID_VAT, codiceDestinatario: "ABCDEFG", postalCode: "123" })
            )
        ).toBe(false);
    });

    it("Codice Destinatario oltre 7 caratteri → false (lunghezza)", () => {
        expect(
            isBillingDraftComplete(
                draft({ entityType: "societa", legalName: "X", vatNumber: VALID_VAT, codiceDestinatario: "ABCDEFGH" })
            )
        ).toBe(false);
    });
});

describe("billingRecipientRequired", () => {
    it("true con P.IVA, false senza", () => {
        expect(billingRecipientRequired(draft({ vatNumber: VALID_VAT }))).toBe(true);
        expect(billingRecipientRequired(draft({}))).toBe(false);
    });
});

describe("billingDraftToPayload", () => {
    it("trim e stringhe vuote → null; country default IT", () => {
        const p = billingDraftToPayload(draft({ entityType: "societa", legalName: "  X  ", country: "" }));
        expect(p.legal_name).toBe("X");
        expect(p.vat_number).toBeNull();
        expect(p.codice_destinatario).toBeNull();
        expect(p.country).toBe("IT");
        expect(p.legal_entity_type).toBe("societa");
    });
});
