import { describe, it, expect } from "vitest";
import {
    EXCERPT_MAX_LENGTH,
    buildExcerpt,
    buildSupportCustomerReplyEmail,
    buildSupportPlatformAlertEmail,
    type SupportEmailContent,
    type SupportPlatformAlertVariant
} from "./supportEmails.ts";

const TICKET_SUBJECT = "Il QR del tavolo 4 non apre il menu";
const MESSAGE_BODY = "Abbiamo rigenerato i QR, prova di nuovo e facci sapere.";

// Shapes produced by buildSupportTicketUrl / buildSupportAdminTicketUrl.
const CUSTOMER_URL =
    "https://cataloglobe.com/business/11111111-2222-3333-4444-555555555555/support/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ADMIN_URL = "https://cataloglobe.com/admin/supporto/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Text carrying HTML metacharacters plus an attribute-breaking quote.
const XSS_TEXT = `<script>alert("x")</script> & 'ciao'`;

/** Card body, footer excluded: the footer carries CataloGlobe's own links. */
function cardBody(html: string): string {
    return html.split("border-top")[0];
}

/** Both builders, invoked with the same data, for the shared assertions. */
const ALL_BUILDERS: ReadonlyArray<
    [string, (over?: { ticketSubject?: string; messageBody?: string; threadUrl?: string | null }) => SupportEmailContent]
> = [
    [
        "customerReply",
        over =>
            buildSupportCustomerReplyEmail({
                ticketSubject: TICKET_SUBJECT,
                messageBody: MESSAGE_BODY,
                threadUrl: CUSTOMER_URL,
                ...over
            })
    ],
    [
        "platformAlert:newTicket",
        over =>
            buildSupportPlatformAlertEmail({
                tenantName: "Trattoria da Ciro",
                ticketSubject: TICKET_SUBJECT,
                messageBody: MESSAGE_BODY,
                threadUrl: ADMIN_URL,
                variant: "newTicket",
                ...over
            })
    ],
    [
        "platformAlert:newMessage",
        over =>
            buildSupportPlatformAlertEmail({
                tenantName: "Trattoria da Ciro",
                ticketSubject: TICKET_SUBJECT,
                messageBody: MESSAGE_BODY,
                threadUrl: ADMIN_URL,
                variant: "newMessage",
                ...over
            })
    ]
];

describe("buildExcerpt", () => {
    it("returns a short body unchanged", () => {
        expect(buildExcerpt("Ciao, non funziona.")).toBe("Ciao, non funziona.");
    });

    it("collapses newlines and whitespace runs into single spaces", () => {
        expect(buildExcerpt("Ciao,\n\n   non   funziona.\r\nGrazie")).toBe(
            "Ciao, non funziona. Grazie"
        );
    });

    it("trims the surrounding whitespace", () => {
        expect(buildExcerpt("   ciao   ")).toBe("ciao");
    });

    it("returns an empty string for a blank body", () => {
        expect(buildExcerpt("   \n\t  ")).toBe("");
    });

    it("truncates past the limit and marks it with an ellipsis", () => {
        const body = "parola ".repeat(80);
        const excerpt = buildExcerpt(body);
        expect(excerpt.endsWith("…")).toBe(true);
        expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX_LENGTH + 1);
    });

    it("does not cut mid-word when a word boundary is available", () => {
        const body = "parola ".repeat(80);
        const excerpt = buildExcerpt(body);
        expect(excerpt).toBe(`${"parola ".repeat(28).trimEnd()}…`);
    });

    it("cuts hard when the body has no usable word boundary", () => {
        const body = "a".repeat(400);
        const excerpt = buildExcerpt(body);
        expect(excerpt).toBe(`${"a".repeat(EXCERPT_MAX_LENGTH)}…`);
    });

    it("keeps an early word boundary from swallowing the whole preview", () => {
        // One short word then a very long unbreakable token: backing off to the
        // only space would leave a two-character preview.
        const body = `ok ${"z".repeat(400)}`;
        expect(buildExcerpt(body)).toBe(`${`ok ${"z".repeat(400)}`.slice(0, EXCERPT_MAX_LENGTH)}…`);
    });

    it("honours a custom limit", () => {
        expect(buildExcerpt("a".repeat(50), 10)).toBe(`${"a".repeat(10)}…`);
    });

    it("does not truncate at exactly the limit", () => {
        const body = "a".repeat(EXCERPT_MAX_LENGTH);
        expect(buildExcerpt(body)).toBe(body);
    });
});

describe("support email builders — shared guarantees", () => {
    for (const [name, build] of ALL_BUILDERS) {
        describe(name, () => {
            it("produces a non-empty subject, html and text", () => {
                const email = build();
                expect(email.subject.length).toBeGreaterThan(0);
                expect(email.html.length).toBeGreaterThan(0);
                expect(email.text.length).toBeGreaterThan(0);
            });

            it("tells the reader to answer from the panel, in both formats", () => {
                const email = build();
                expect(email.html).toContain(
                    "Rispondi dal pannello: da questa email non possiamo risponderti."
                );
                expect(email.text).toContain(
                    "Rispondi dal pannello: da questa email non possiamo risponderti."
                );
            });

            it("promises nothing about response times", () => {
                const email = build();
                const haystack = `${email.subject} ${email.html} ${email.text}`.toLowerCase();
                for (const forbidden of ["entro", "24 ore", "48 ore", "al più presto", "tempi di risposta"]) {
                    expect(haystack).not.toContain(forbidden);
                }
            });

            it("escapes HTML metacharacters in the subject", () => {
                const email = build({ ticketSubject: XSS_TEXT });
                expect(cardBody(email.html)).not.toContain("<script>");
                expect(cardBody(email.html)).toContain("&lt;script&gt;");
            });

            it("escapes HTML metacharacters in the message body", () => {
                const email = build({ messageBody: XSS_TEXT });
                expect(cardBody(email.html)).not.toContain("<script>");
                expect(cardBody(email.html)).toContain("&lt;script&gt;");
            });

            it("leaves the plain-text part unescaped", () => {
                const email = build({ messageBody: XSS_TEXT });
                expect(email.text).toContain(XSS_TEXT);
            });

            it("truncates the quoted body", () => {
                const email = build({ messageBody: "parola ".repeat(80) });
                expect(email.html).toContain("…");
                expect(email.text).toContain("…");
            });

            it("renders the thread link as an anchor when available", () => {
                const email = build();
                expect(email.html).toContain('href="https://cataloglobe.com/');
            });

            it("degrades to plain copy when the URL is null", () => {
                const email = build({ threadUrl: null });
                expect(cardBody(email.html)).not.toContain("<a href");
                expect(email.text).not.toContain("https://cataloglobe.com/business");
                expect(email.text).not.toContain("https://cataloglobe.com/admin");
                expect(email.subject.length).toBeGreaterThan(0);
            });

            it("refuses a javascript: URL as it would a missing one", () => {
                const email = build({ threadUrl: "javascript:alert(1)" });
                expect(email.html).not.toContain("javascript:");
                expect(email.text).not.toContain("javascript:");
            });
        });
    }
});

describe("buildSupportCustomerReplyEmail", () => {
    it("names the ticket in the subject", () => {
        const email = buildSupportCustomerReplyEmail({
            ticketSubject: TICKET_SUBJECT,
            messageBody: MESSAGE_BODY,
            threadUrl: CUSTOMER_URL
        });
        expect(email.subject).toBe(
            `Risposta alla tua richiesta di assistenza — ${TICKET_SUBJECT}`
        );
    });

    it("quotes the platform answer", () => {
        const email = buildSupportCustomerReplyEmail({
            ticketSubject: TICKET_SUBJECT,
            messageBody: MESSAGE_BODY,
            threadUrl: CUSTOMER_URL
        });
        expect(email.html).toContain(MESSAGE_BODY);
        expect(email.text).toContain(MESSAGE_BODY);
    });

    it("links the business-side thread", () => {
        const email = buildSupportCustomerReplyEmail({
            ticketSubject: TICKET_SUBJECT,
            messageBody: MESSAGE_BODY,
            threadUrl: CUSTOMER_URL
        });
        expect(email.html).toContain(`href="${CUSTOMER_URL}"`);
        expect(email.text).toContain(CUSTOMER_URL);
    });
});

describe("buildSupportPlatformAlertEmail", () => {
    const VARIANTS: ReadonlyArray<[SupportPlatformAlertVariant, string]> = [
        ["newTicket", "Nuova richiesta di assistenza — Trattoria da Ciro"],
        ["newMessage", "Nuovo messaggio di assistenza — Trattoria da Ciro"]
    ];

    for (const [variant, expectedSubject] of VARIANTS) {
        it(`uses a distinct subject for ${variant}`, () => {
            const email = buildSupportPlatformAlertEmail({
                tenantName: "Trattoria da Ciro",
                ticketSubject: TICKET_SUBJECT,
                messageBody: MESSAGE_BODY,
                threadUrl: ADMIN_URL,
                variant
            });
            expect(email.subject).toBe(expectedSubject);
        });
    }

    it("gives the two variants different copy", () => {
        const shared = {
            tenantName: "Trattoria da Ciro",
            ticketSubject: TICKET_SUBJECT,
            messageBody: MESSAGE_BODY,
            threadUrl: ADMIN_URL
        };
        const newTicket = buildSupportPlatformAlertEmail({ ...shared, variant: "newTicket" });
        const newMessage = buildSupportPlatformAlertEmail({ ...shared, variant: "newMessage" });
        expect(newTicket.subject).not.toBe(newMessage.subject);
        expect(newTicket.html).not.toBe(newMessage.html);
        expect(newTicket.text).not.toBe(newMessage.text);
    });

    it("names the company and the ticket subject", () => {
        const email = buildSupportPlatformAlertEmail({
            tenantName: "Trattoria da Ciro",
            ticketSubject: TICKET_SUBJECT,
            messageBody: MESSAGE_BODY,
            threadUrl: ADMIN_URL,
            variant: "newTicket"
        });
        expect(email.html).toContain("Trattoria da Ciro");
        expect(email.html).toContain(TICKET_SUBJECT);
        expect(email.text).toContain("Trattoria da Ciro");
        expect(email.text).toContain(TICKET_SUBJECT);
    });

    it("falls back to a neutral label when the company is unknown", () => {
        const email = buildSupportPlatformAlertEmail({
            tenantName: null,
            ticketSubject: TICKET_SUBJECT,
            messageBody: MESSAGE_BODY,
            threadUrl: ADMIN_URL,
            variant: "newMessage"
        });
        expect(email.subject).toBe("Nuovo messaggio di assistenza — Azienda non identificata");
        expect(email.html).toContain("Azienda non identificata");
    });

    it("escapes HTML metacharacters in the company name", () => {
        const email = buildSupportPlatformAlertEmail({
            tenantName: XSS_TEXT,
            ticketSubject: TICKET_SUBJECT,
            messageBody: MESSAGE_BODY,
            threadUrl: ADMIN_URL,
            variant: "newTicket"
        });
        expect(cardBody(email.html)).not.toContain("<script>");
        expect(cardBody(email.html)).toContain("&lt;script&gt;");
    });

    it("links the admin-side thread", () => {
        const email = buildSupportPlatformAlertEmail({
            tenantName: "Trattoria da Ciro",
            ticketSubject: TICKET_SUBJECT,
            messageBody: MESSAGE_BODY,
            threadUrl: ADMIN_URL,
            variant: "newTicket"
        });
        expect(email.html).toContain(`href="${ADMIN_URL}"`);
        expect(email.text).toContain(ADMIN_URL);
    });
});
