import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_WHATSAPP_TEMPLATE, fillWhatsappTemplate } from "@shared/crmWhatsapp";

describe("fillWhatsappTemplate", () => {
    it("mette primo nome e locale", () => {
        expect(
            fillWhatsappTemplate("Ciao {nome}, sono Alessandro di {locale}?", {
                contactName: "Mario Rossi",
                venueName: " Trattoria da Mario ",
                senderName: null
            })
        ).toBe("Ciao Mario, sono Alessandro di Trattoria da Mario?");
    });

    it("senza nome toglie lo spazio prima della virgola", () => {
        expect(fillWhatsappTemplate("Ciao {nome}, ciao", { contactName: null, venueName: "X", senderName: null })).toBe("Ciao, ciao");
    });

    it("i $ nei nomi restano testo", () => {
        expect(fillWhatsappTemplate("{nome} da {locale} per {mittente}", { contactName: "$&", venueName: "Bar $'", senderName: "$1" })).toBe(
            "$& da Bar $' per $1"
        );
    });

    it("{locale} vuoto (locale da completare) diventa «il tuo locale»", () => {
        expect(fillWhatsappTemplate("per {locale}", { contactName: null, venueName: null, senderName: null })).toBe(
            "per il tuo locale"
        );
    });
});

describe("DEFAULT_WHATSAPP_TEMPLATE", () => {
    // ⚠️ SYNC: la migration scrive lo stesso testo in crm_settings.
    it("è lo stesso testo della migration 20261001170000", () => {
        const sql = readFileSync("supabase/migrations/20261001170000_crm_venue_name_pending.sql", "utf8");
        expect(sql).toContain(`SET whatsapp_template = '${DEFAULT_WHATSAPP_TEMPLATE.replace(/'/g, "''")}'`);
    });
});
