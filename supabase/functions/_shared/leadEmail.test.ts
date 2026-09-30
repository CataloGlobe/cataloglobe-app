import { describe, expect, it } from "vitest";
import { buildLeadNotificationEmail, formatRomeDateTime } from "./leadEmail.ts";

const meta = {
    variant: "form",
    utm_source: "facebook",
    utm_medium: null,
    utm_campaign: "autunno",
    utm_content: null,
    utm_term: null,
    referrer: null,
    landing_path: "/landing-dev"
};

describe("buildLeadNotificationEmail", () => {
    const lead = { name: "Mario <b>Rossi</b>", venueName: "Da Mario & figli", phone: "+393451559558", email: null, interests: ["menu", "ordini"] as ("menu" | "ordini")[] };
    const mail = buildLeadNotificationEmail(lead, meta, new Date("2026-09-25T12:05:00Z"));

    it("oggetto col nome del locale", () => {
        expect(mail.subject).toBe("Nuova richiesta demo — Da Mario & figli");
    });

    it("escapa i valori del form nell'HTML", () => {
        expect(mail.html).toContain("Mario &lt;b&gt;Rossi&lt;/b&gt;");
        expect(mail.html).not.toContain("<b>Rossi</b>");
        expect(mail.html).toContain("Da Mario &amp; figli");
    });

    it("telefono come link tel:, interessi in italiano, utm presenti solo se valorizzati", () => {
        expect(mail.html).toContain('href="tel:+393451559558"');
        expect(mail.text).toContain("Interessi: Il menù, Gli ordini al tavolo");
        expect(mail.text).toContain("Sorgente: facebook");
        expect(mail.text).toContain("Campagna: autunno");
        expect(mail.text).not.toContain("Mezzo:");
        expect(mail.text).toContain("Email: —");
    });

    it("data e ora nel fuso di Roma", () => {
        expect(formatRomeDateTime(new Date("2026-09-25T12:05:00Z"))).toContain("14:05");
        expect(formatRomeDateTime(new Date("2026-01-15T12:05:00Z"))).toContain("13:05");
    });
});
