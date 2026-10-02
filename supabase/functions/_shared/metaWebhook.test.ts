import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    appSecretProof,
    extractLeadgenEvents,
    graphLeadToRecord,
    verifyMetaSignature
} from "./metaWebhook";
import { mapMetaLeadRecord } from "./metaLeadFields";

const SECRET = "app-secret-di-prova";
const body = new TextEncoder().encode('{"object":"page","entry":[]}');
const sign = (bytes: Uint8Array, secret = SECRET) =>
    `sha256=${createHmac("sha256", secret).update(bytes).digest("hex")}`;

describe("verifyMetaSignature", () => {
    it("firma giusta sul corpo grezzo", async () => {
        expect(await verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
        expect(await verifyMetaSignature(body, sign(body).toUpperCase().replace("SHA256", "sha256"), SECRET)).toBe(
            true
        );
    });

    it("corpo cambiato, altro segreto, header assente o malformato", async () => {
        const other = new TextEncoder().encode('{"object":"page","entry":[{}]}');
        expect(await verifyMetaSignature(other, sign(body), SECRET)).toBe(false);
        expect(await verifyMetaSignature(body, sign(body, "altro"), SECRET)).toBe(false);
        expect(await verifyMetaSignature(body, null, SECRET)).toBe(false);
        expect(await verifyMetaSignature(body, "sha1=abc", SECRET)).toBe(false);
        expect(await verifyMetaSignature(body, sign(body), "")).toBe(false);
    });
});

describe("appSecretProof", () => {
    it("HMAC-SHA256 del token con l'app secret, in esadecimale", async () => {
        expect(await appSecretProof("token", SECRET)).toBe(
            createHmac("sha256", SECRET).update("token").digest("hex")
        );
    });
});

describe("extractLeadgenEvents", () => {
    it("solo i cambi leadgen della Pagina, senza doppioni", () => {
        const payload = {
            object: "page",
            entry: [
                {
                    id: "111",
                    changes: [
                        {
                            field: "leadgen",
                            value: { leadgen_id: "444", form_id: "555", page_id: "111", ad_id: 666, created_time: 1 }
                        },
                        { field: "feed", value: { leadgen_id: "999" } },
                        { field: "leadgen", value: { leadgen_id: "444" } }
                    ]
                },
                { id: "111", changes: [{ field: "leadgen", value: { form_id: "555" } }] }
            ]
        };
        expect(extractLeadgenEvents(payload)).toEqual([
            { leadgenId: "444", formId: "555", pageId: "111", adId: "666" }
        ]);
    });

    it("corpi estranei: niente", () => {
        expect(extractLeadgenEvents(null)).toEqual([]);
        expect(extractLeadgenEvents({ object: "instagram", entry: [] })).toEqual([]);
        expect(extractLeadgenEvents({ object: "page", entry: "x" })).toEqual([]);
        expect(extractLeadgenEvents({ object: "page", entry: [{ changes: [null] }] })).toEqual([]);
    });
});

describe("graphLeadToRecord + mapMetaLeadRecord", () => {
    const graphLead = {
        id: "1234567890",
        created_time: "2026-10-02T10:00:00+0000",
        ad_id: "120",
        ad_name: "Menu digitale",
        campaign_name: "Ristoranti ottobre",
        form_id: "555",
        is_organic: false,
        field_data: [
            { name: "full_name", values: ["Mario Rossi"] },
            { name: "phone_number", values: ["+393331234567"] },
            { name: "email", values: ["mario@example.com"] },
            { name: "Nome del locale", values: ["Trattoria da Mario"] },
            { name: "servizi_che_ti_interessano", values: ["Menu", "Prenotazioni"] }
        ]
    };

    it("stessi campi dell'import CSV, chiave = id del lead", () => {
        const { record, headers } = graphLeadToRecord(graphLead, "Richiesta demo");
        const fields = mapMetaLeadRecord(record, headers);
        expect(fields).toEqual({
            leadId: "1234567890",
            rawCreated: "2026-10-02T10:00:00+0000",
            rawPhone: "+393331234567",
            name: "Mario Rossi",
            venueName: "Trattoria da Mario",
            email: "mario@example.com",
            city: null,
            formAnswers: { email: "mario@example.com", servizi_che_ti_interessano: "Menu, Prenotazioni" },
            adId: "120",
            adName: "Menu digitale",
            campaign: "Ristoranti ottobre",
            consentAt: "2026-10-02T10:00:00.000Z",
            consentText: "Modulo Meta «Richiesta demo»",
            receivedAt: "2026-10-02T10:00:00.000Z"
        });
    });

    it("senza nome del modulo né locale né telefono", () => {
        const { record, headers } = graphLeadToRecord(
            { id: "1", field_data: [{ name: "first_name", values: ["Anna"] }, { name: "last_name", values: ["Bi"] }] },
            null
        );
        const fields = mapMetaLeadRecord(record, headers);
        expect(fields.name).toBe("Anna Bi");
        expect(fields.venueName).toBe("");
        expect(fields.rawPhone).toBe("");
        expect(fields.consentText).toBe("Modulo Meta");
        expect(fields.receivedAt).toBeNull();
    });

    it("un campo del modulo non sovrascrive i campi di sistema", () => {
        const { record } = graphLeadToRecord({ id: "1", field_data: [{ name: "id", values: ["finto"] }] }, null);
        expect(record.get("id")).toBe("1");
    });

    it("lead malformato: record vuoto, nessuna eccezione", () => {
        const { record, headers } = graphLeadToRecord("x", null);
        expect(record.size).toBe(0);
        expect(headers).toEqual([]);
    });
});
