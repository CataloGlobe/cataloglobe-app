import { describe, expect, it } from "vitest";
import {
    DEFAULT_WHATSAPP_TEMPLATE,
    fillWhatsappTemplate,
    signWaLink,
    verifyWaLink,
    whatsappUrl,
    WA_LINK_TTL_SECONDS
} from "./crmWhatsapp";

describe("fillWhatsappTemplate", () => {
    it("testo predefinito: nome di battesimo del lead e di chi invia", () => {
        expect(
            fillWhatsappTemplate(DEFAULT_WHATSAPP_TEMPLATE, {
                contactName: "Mario Rossi",
                venueName: null,
                senderName: "Alessandro D'Elia"
            })
        ).toBe(
            "Ciao Mario, sono Alessandro di CataloGlobe. Ho visto che hai lasciato i contatti per il tuo locale. Quando hai 10 minuti per sentirci al telefono?"
        );
        expect(
            fillWhatsappTemplate(DEFAULT_WHATSAPP_TEMPLATE, { contactName: "Mario", venueName: null, senderName: "Lorenzo" })
        ).toMatch(/^Ciao Mario, sono Lorenzo di CataloGlobe\./);
    });

    it("{mittente} senza nome nel team diventa «il team»", () => {
        expect(
            fillWhatsappTemplate(DEFAULT_WHATSAPP_TEMPLATE, { contactName: "Mario", venueName: null, senderName: " " })
        ).toMatch(/^Ciao Mario, sono il team di CataloGlobe\./);
    });

    it("senza nome non lascia «Ciao ,»", () => {
        expect(fillWhatsappTemplate(DEFAULT_WHATSAPP_TEMPLATE, { contactName: null, venueName: "Bar", senderName: "Lorenzo" })).toMatch(
            /^Ciao, sono/
        );
    });

    it("{locale} col nome del locale, o «il tuo locale» se è da completare", () => {
        const template = "Ciao {nome}, ho visto la richiesta per {locale}.";
        expect(fillWhatsappTemplate(template, { contactName: "Anna", venueName: " Trattoria da Mario ", senderName: null })).toBe(
            "Ciao Anna, ho visto la richiesta per Trattoria da Mario."
        );
        expect(fillWhatsappTemplate(template, { contactName: "Anna", venueName: null, senderName: null })).toBe(
            "Ciao Anna, ho visto la richiesta per il tuo locale."
        );
    });
});

describe("whatsappUrl", () => {
    it("solo cifre nel numero e testo codificato", () => {
        expect(whatsappUrl("+393331234567", "Ciao & grazie\n!")).toBe(
            "https://wa.me/393331234567?text=Ciao%20%26%20grazie%0A!"
        );
        expect(whatsappUrl("+393331234567", null)).toBe("https://wa.me/393331234567");
    });
});

describe("link firmato", () => {
    const SECRET = "segreto-di-prova";
    const LEAD = "6f1c2e8a-3b4d-4c5e-9f60-7a8b9c0d1e2f";
    const USER = "11111111-2222-4333-8444-555555555555";
    const NOW = 1_790_000_000;

    it("verifica il link appena firmato", async () => {
        const params = await signWaLink(SECRET, LEAD, USER, NOW);
        expect(await verifyWaLink(SECRET, params, NOW + 60)).toBe("valid");
    });

    it("vale 7 giorni, poi è scaduto (non invalido)", async () => {
        const params = await signWaLink(SECRET, LEAD, USER, NOW);
        expect(WA_LINK_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
        expect(await verifyWaLink(SECRET, params, NOW + WA_LINK_TTL_SECONDS)).toBe("valid");
        expect(await verifyWaLink(SECRET, params, NOW + WA_LINK_TTL_SECONDS + 1)).toBe("expired");
    });

    it("una scadenza allungata a mano è invalida, non scaduta né valida", async () => {
        const params = await signWaLink(SECRET, LEAD, USER, NOW);
        expect(await verifyWaLink(SECRET, { ...params, e: String(NOW - 10) }, NOW)).toBe("invalid");
    });

    it("rifiuta un lead, un utente o una scadenza cambiati", async () => {
        const params = await signWaLink(SECRET, LEAD, USER, NOW);
        expect(await verifyWaLink(SECRET, { ...params, l: USER }, NOW)).toBe("invalid");
        expect(await verifyWaLink(SECRET, { ...params, u: LEAD }, NOW)).toBe("invalid");
        expect(await verifyWaLink(SECRET, { ...params, e: String(NOW + 10 ** 9) }, NOW)).toBe("invalid");
    });

    it("rifiuta un altro segreto e i parametri mancanti", async () => {
        const params = await signWaLink(SECRET, LEAD, USER, NOW);
        expect(await verifyWaLink("altro", params, NOW)).toBe("invalid");
        expect(await verifyWaLink(SECRET, { l: LEAD, u: USER }, NOW)).toBe("invalid");
    });
});
