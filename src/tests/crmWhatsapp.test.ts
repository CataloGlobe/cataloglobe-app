import { describe, expect, it } from "vitest";
import { fillWhatsappTemplate } from "@shared/crmWhatsapp";

describe("fillWhatsappTemplate", () => {
    it("mette primo nome e locale", () => {
        expect(
            fillWhatsappTemplate("Ciao {nome}, sono Alessandro di {locale}?", {
                contactName: "Mario Rossi",
                venueName: " Trattoria da Mario "
            })
        ).toBe("Ciao Mario, sono Alessandro di Trattoria da Mario?");
    });

    it("senza nome toglie lo spazio prima della virgola", () => {
        expect(fillWhatsappTemplate("Ciao {nome}, ciao", { contactName: null, venueName: "X" })).toBe("Ciao, ciao");
    });

    it("i $ nei nomi restano testo", () => {
        expect(fillWhatsappTemplate("{nome} da {locale}", { contactName: "$&", venueName: "Bar $'" })).toBe(
            "$& da Bar $'"
        );
    });
});
