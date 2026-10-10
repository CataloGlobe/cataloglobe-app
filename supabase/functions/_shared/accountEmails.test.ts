import { describe, expect, it } from "vitest";
import {
    buildLoginCodeEmail,
    buildRecoveryCodeEmail,
    buildSignupReminderEmail,
    buildTenantInviteEmail,
    buildWaitlistEmail
} from "./accountEmails.ts";

/** La riga d'anteprima nascosta in cima alla mail. */
function preheader(html: string): string {
    return html.match(/<div style="display:none[^>]*>([^&]*)/)?.[1] ?? "";
}

describe("mail dell'account", () => {
    it("codice di accesso: codice nell'oggetto, anteprima con la scadenza", () => {
        const email = buildLoginCodeEmail("586336");
        expect(email.subject).toBe("586336 è il tuo codice di accesso a CataloGlobe");
        expect(preheader(email.html)).toBe("Scade tra 5 minuti.");
        expect(email.text.startsWith("Il tuo codice di accesso: 586336")).toBe(true);
        expect(email.text).not.toContain("P.IVA");
    });

    it("codice di recupero: stessa forma", () => {
        const email = buildRecoveryCodeEmail("123456");
        expect(email.subject).toContain("123456");
        expect(preheader(email.html)).toBe("Scade tra 5 minuti.");
    });

    it("invito: escapa nome e mittente, bottone col link, CataloGlobe con la G", () => {
        const email = buildTenantInviteEmail({
            tenantName: "Bar <b>Rosso</b>",
            inviterEmail: "mario@example.com",
            inviteUrl: "https://cataloglobe.com/invite/abc?x=1&y=2"
        });
        expect(email.html).not.toContain("<b>Rosso</b>");
        expect(email.html).toContain("Bar &lt;b&gt;Rosso&lt;/b&gt;");
        expect(email.html).toContain('href="https://cataloglobe.com/invite/abc?x=1&amp;y=2"');
        expect(email.html).not.toContain("Cataloglobe");
        expect(email.text).toContain("https://cataloglobe.com/invite/abc?x=1&y=2");
    });

    it("lista d'attesa: unica con i dati legali completi", () => {
        const email = buildWaitlistEmail();
        expect(email.html).toContain("P.IVA");
        expect(email.text).toContain("P.IVA");
        expect(buildLoginCodeEmail("1").html).not.toContain("P.IVA");
    });

    it("promemoria di conferma: data di cancellazione nell'anteprima, link all'accesso", () => {
        const email = buildSignupReminderEmail({
            deleteAfter: "2026-10-17",
            loginUrl: "https://cataloglobe.com/login"
        });
        expect(preheader(email.html)).toBe("Se non lo confermi entro il 17 ottobre 2026, lo cancelliamo.");
        expect(email.html).toContain('href="https://cataloglobe.com/login"');
        expect(email.text).toContain("https://cataloglobe.com/login");
        expect(email.html).not.toContain("P.IVA");
    });
});
