import { describe, it, expect } from "vitest";
import {
    buildReservationConfirmedEmail,
    buildReservationOutcomeEmail,
    buildReservationReceiptEmail,
    buildReservationVenueAlertEmail,
    type ReservationEmailBase,
    type ReservationEmailContent,
    type ReservationVenueAlertVariant
} from "./reservationEmails.ts";

const BASE: ReservationEmailBase = {
    activityName: "Trattoria da Ciro",
    customerName: "Mario Rossi",
    reservationDate: "2026-06-15",
    reservationTime: "20:30:00",
    partySize: 4
};

// Name carrying HTML metacharacters + an attribute-breaking quote.
const XSS_NAME = `<script>alert("x")</script> & 'Mario'`;

// Shape produced by buildReservationsDashboardUrl(tenantId).
const DASHBOARD_URL =
    "https://cataloglobe.com/business/11111111-2222-3333-4444-555555555555/reservations";

function expectNonEmptyContent(email: ReservationEmailContent): void {
    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.html.length).toBeGreaterThan(0);
    expect(email.text.length).toBeGreaterThan(0);
}

/** Every builder, invoked with the same base data, for the shared assertions. */
const ALL_BUILDERS: ReadonlyArray<[string, (over?: Partial<ReservationEmailBase>) => ReservationEmailContent]> = [
    ["receipt", over => buildReservationReceiptEmail({ ...BASE, ...over })],
    ["confirmed:auto", over => buildReservationConfirmedEmail({ ...BASE, ...over, variant: "auto" })],
    ["confirmed:manual", over => buildReservationConfirmedEmail({ ...BASE, ...over, variant: "manual" })],
    ["outcome:decline", over => buildReservationOutcomeEmail({ ...BASE, ...over, action: "decline" })],
    ["outcome:cancel", over => buildReservationOutcomeEmail({ ...BASE, ...over, action: "cancel" })],
    [
        "venueAlert",
        over =>
            buildReservationVenueAlertEmail({
                ...BASE,
                ...over,
                customerEmail: "mario@example.com",
                customerPhone: "+39 333 1234567",
                notes: null,
                dashboardUrl: DASHBOARD_URL,
                variant: "request"
            })
    ],
    [
        "venueAlert:autoConfirmed",
        over =>
            buildReservationVenueAlertEmail({
                ...BASE,
                ...over,
                customerEmail: "mario@example.com",
                customerPhone: "+39 333 1234567",
                notes: null,
                dashboardUrl: DASHBOARD_URL,
                variant: "autoConfirmed"
            })
    ]
];

describe("reservation email builders (_shared)", () => {
    describe.each(ALL_BUILDERS)("%s", (_name, build) => {
        it("returns non-empty subject, html and text", () => {
            expectNonEmptyContent(build());
        });

        it("includes the reservation data in both html and text", () => {
            const email = build();
            for (const body of [email.html, email.text]) {
                expect(body).toContain("Trattoria da Ciro");
                expect(body).toContain("15 giugno 2026");
                expect(body).toContain("20:30");
                expect(body).toContain("4");
            }
            expect(email.subject).toContain("Trattoria da Ciro");
        });

        it("escapes HTML metacharacters coming from the customer name", () => {
            const email = build({ customerName: XSS_NAME });
            expect(email.html).not.toContain("<script>");
            expect(email.html).toContain("&lt;script&gt;");
            expect(email.html).toContain("&quot;");
            expect(email.html).toContain("&#39;");
            // The plain-text part is not HTML: it keeps the raw characters.
            expect(email.text).toContain(XSS_NAME);
        });

        it("renders the seconds-less time form", () => {
            expect(build().html).not.toContain("20:30:00");
        });
    });

    it("uses the seconds-less time form when the input already lacks seconds", () => {
        const email = buildReservationReceiptEmail({ ...BASE, reservationTime: "09:05" });
        expect(email.html).toContain("09:05");
        expect(email.text).toContain("Ora: 09:05");
    });

    describe("confirmed variants", () => {
        it("omits 'richiesta di' on the auto-confirm path", () => {
            const email = buildReservationConfirmedEmail({ ...BASE, variant: "auto" });
            expect(email.html).toContain("La tua prenotazione presso");
            expect(email.html).not.toContain("richiesta di prenotazione");
            expect(email.text).toContain("La tua prenotazione presso");
            expect(email.text).not.toContain("richiesta di prenotazione");
        });

        it("keeps 'richiesta di' on the admin-confirm path", () => {
            const email = buildReservationConfirmedEmail({ ...BASE, variant: "manual" });
            expect(email.html).toContain("La tua richiesta di prenotazione presso");
            expect(email.text).toContain("La tua richiesta di prenotazione presso");
        });

        it("shares subject and title across variants", () => {
            const auto = buildReservationConfirmedEmail({ ...BASE, variant: "auto" });
            const manual = buildReservationConfirmedEmail({ ...BASE, variant: "manual" });
            expect(auto.subject).toBe(manual.subject);
            expect(auto.subject).toBe("Prenotazione confermata — Trattoria da Ciro");
            expect(auto.html).toContain("<h1 style=\"margin:0 0 16px;font-size:22px;color:#111827\">Prenotazione confermata</h1>");
            expect(manual.html).toContain("<h1 style=\"margin:0 0 16px;font-size:22px;color:#111827\">Prenotazione confermata</h1>");
        });
    });

    describe("outcome actions", () => {
        it("uses the declined subject and copy", () => {
            const email = buildReservationOutcomeEmail({ ...BASE, action: "decline" });
            expect(email.subject).toBe("Prenotazione non confermata — Trattoria da Ciro");
            expect(email.html).toContain("non è stata confermata");
        });

        it("uses the cancelled subject and copy", () => {
            const email = buildReservationOutcomeEmail({ ...BASE, action: "cancel" });
            expect(email.subject).toBe("Prenotazione annullata — Trattoria da Ciro");
            expect(email.html).toContain("annullata");
        });
    });

    describe("venue alert", () => {
        const venue = (
            dashboardUrl: string | null,
            notes: string | null = null,
            variant: ReservationVenueAlertVariant = "request"
        ) =>
            buildReservationVenueAlertEmail({
                ...BASE,
                customerEmail: "mario@example.com",
                customerPhone: "+39 333 1234567",
                notes,
                dashboardUrl,
                variant
            });
        const venueAuto = (dashboardUrl: string | null, notes: string | null = null) =>
            venue(dashboardUrl, notes, "autoConfirmed");

        it("includes the customer contact details", () => {
            const email = venue("https://cataloglobe.com");
            expect(email.html).toContain("mario@example.com");
            expect(email.html).toContain("+39 333 1234567");
            expect(email.text).toContain("mario@example.com");
            expect(email.text).toContain("+39 333 1234567");
        });

        it("links the dashboard sentence in html when a URL is supplied", () => {
            const email = venue(DASHBOARD_URL);
            expect(email.html).toContain(`<a href="${DASHBOARD_URL}"`);
            expect(email.html).toContain(">Accedi alla dashboard</a> per confermarla o rifiutarla.");
        });

        it("appends the plain URL in text when a URL is supplied", () => {
            const email = venue(DASHBOARD_URL);
            expect(email.text).toContain(
                `Accedi alla dashboard per confermarla o rifiutarla.\n${DASHBOARD_URL}\n`
            );
        });

        it.each([
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "not a url",
            ""
        ])("treats the unsafe URL %j as absent", unsafe => {
            const email = venue(unsafe);
            expectNonEmptyContent(email);
            expect(email.html).not.toContain(">Accedi alla dashboard</a>");
            expect(email.html).not.toContain("javascript:");
            expect(email.html).not.toContain("data:text/html");
            expect(email.html).toContain("Accedi alla dashboard per confermarla o rifiutarla.");
            expect(email.text).toContain("Accedi alla dashboard per confermarla o rifiutarla.\n\n");
            if (unsafe.length > 0) expect(email.text).not.toContain(unsafe);
        });

        it("falls back to link-less copy in both formats when the URL is missing", () => {
            const email = venue(null);
            expectNonEmptyContent(email);
            // The footer keeps its own links; only the dashboard anchor drops.
            expect(email.html).not.toContain(">Accedi alla dashboard</a>");
            expect(email.html).toContain("Accedi alla dashboard per confermarla o rifiutarla.");
            expect(email.text).toContain("Accedi alla dashboard per confermarla o rifiutarla.\n\n");
            expect(email.text).not.toContain("https://cataloglobe.com/business/");
        });

        it("uses the request subject and title on the manual-confirm path", () => {
            const email = venue(DASHBOARD_URL);
            expect(email.subject).toBe("Nuova richiesta di prenotazione — Trattoria da Ciro");
            expect(email.html).toContain(">Nuova richiesta di prenotazione</h1>");
            expect(email.html).toContain(
                "Hai ricevuto una nuova richiesta di prenotazione su <strong>Trattoria da Ciro</strong>."
            );
            expect(email.text).toContain("Nuova richiesta di prenotazione su Trattoria da Ciro.");
        });

        it("uses the auto-confirmed subject and title on the auto path", () => {
            const email = venueAuto(DASHBOARD_URL);
            expect(email.subject).toBe("Nuova prenotazione confermata — Trattoria da Ciro");
            expect(email.html).toContain(">Nuova prenotazione</h1>");
            expect(email.html).toContain(
                "Una nuova prenotazione su <strong>Trattoria da Ciro</strong> è stata confermata automaticamente. Vedi il dettaglio "
            );
            expect(email.text).toContain(
                "Una nuova prenotazione su Trattoria da Ciro è stata confermata automaticamente."
            );
            expect(email.text).toContain("Vedi il dettaglio nella dashboard.");
        });

        it("never asks to confirm or decline on the auto path", () => {
            for (const email of [venueAuto(DASHBOARD_URL), venueAuto(null)]) {
                expect(email.html).not.toContain("confermarla o rifiutarla");
                expect(email.text).not.toContain("confermarla o rifiutarla");
                expect(email.html).not.toContain("Accedi alla dashboard");
                expect(email.text).not.toContain("Accedi alla dashboard");
            }
        });

        it("links the dashboard wording in both variants", () => {
            expect(venue(DASHBOARD_URL).html).toContain(
                `<a href="${DASHBOARD_URL}" style="color:#111827;text-decoration:underline">Accedi alla dashboard</a> per confermarla o rifiutarla.`
            );
            expect(venueAuto(DASHBOARD_URL).html).toContain(
                `<a href="${DASHBOARD_URL}" style="color:#111827;text-decoration:underline">nella dashboard</a>.`
            );
            expect(venueAuto(DASHBOARD_URL).text).toContain(
                `Vedi il dettaglio nella dashboard.\n${DASHBOARD_URL}\n`
            );
        });

        it("falls back to link-less copy in the auto variant too", () => {
            const email = venueAuto(null);
            expectNonEmptyContent(email);
            expect(email.html).not.toContain("</a>.</p>");
            expect(email.html).toContain("Vedi il dettaglio nella dashboard.");
            expect(email.text).toContain("Vedi il dettaglio nella dashboard.\n\n");
            expect(email.text).not.toContain("https://cataloglobe.com/business/");
        });

        it("keeps customer and reservation blocks identical across variants", () => {
            const req = venue(null, "Tavolo vicino alla finestra");
            const auto = venueAuto(null, "Tavolo vicino alla finestra");
            for (const email of [req, auto]) {
                expect(email.html).toContain("mario@example.com");
                expect(email.html).toContain("+39 333 1234567");
                expect(email.html).toContain("<strong>Note:</strong> Tavolo vicino alla finestra");
                expect(email.html).toContain("<strong>Data:</strong> 15 giugno 2026");
            }
        });

        it("renders the notes row only when notes are present", () => {
            expect(venue(null, "Tavolo vicino alla finestra").html).toContain("Note:");
            expect(venue(null, "Tavolo vicino alla finestra").text).toContain("Note: Tavolo vicino alla finestra");
            expect(venue(null).html).not.toContain("Note:");
            expect(venue(null).text).not.toContain("Note:");
        });

        it("escapes HTML metacharacters in the notes", () => {
            const email = venue(null, "<b>urgente</b>");
            expect(email.html).not.toContain("<b>urgente</b>");
            expect(email.html).toContain("&lt;b&gt;urgente&lt;/b&gt;");
        });
    });
});
