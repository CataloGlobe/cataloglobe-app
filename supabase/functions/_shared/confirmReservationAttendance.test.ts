import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// Guardrail sul sorgente di `confirm-reservation-attendance`.

const SOURCE = readFileSync(
    resolve(process.cwd(), "supabase/functions/confirm-reservation-attendance/index.ts"),
    "utf-8"
);

const REMINDERS = readFileSync(
    resolve(process.cwd(), "supabase/functions/send-reservation-reminders/index.ts"),
    "utf-8"
);

describe("non tocca lo stato della prenotazione", () => {
    it("l'unica colonna scritta è guest_confirmed_at", () => {
        const updates = SOURCE.match(/\.update\(\{[^}]*\}\)/g) ?? [];
        expect(updates).toHaveLength(1);
        expect(updates[0]).toContain("guest_confirmed_at");
        // `status` compare come filtro (.eq) ma MAI come colonna scritta: la
        // conferma del cliente non è una transizione della macchina a stati.
        expect(updates[0]).not.toContain("status");
    });

    it("scrive solo su reservations, e nient'altro", () => {
        expect(SOURCE).not.toMatch(/\.insert\(/);
        expect(SOURCE).not.toMatch(/\.upsert\(/);
        expect(SOURCE).not.toMatch(/\.delete\(/);
    });

    it("conferma solo una prenotazione ancora confermata", () => {
        expect(SOURCE).toContain('reservation.status !== "confirmed"');
        expect(SOURCE).toContain('.eq("status", "confirmed")');
    });
});

describe("idempotenza", () => {
    it("una seconda pressione è un successo, non un errore", () => {
        expect(SOURCE).toContain("already_confirmed: true");
        expect(SOURCE).toContain("if (reservation.guest_confirmed_at)");
    });

    it("non sovrascrive il timestamp originale", () => {
        // Due difese: il ramo idempotente ritorna prima dell'UPDATE, e
        // l'UPDATE stesso è condizionato al valore ancora nullo.
        expect(SOURCE.indexOf("if (reservation.guest_confirmed_at)")).toBeLessThan(
            SOURCE.indexOf(".update({ guest_confirmed_at:")
        );
        expect(SOURCE).toContain('.is("guest_confirmed_at", null)');
    });

    it("il ramo idempotente restituisce il timestamp letto, non uno nuovo", () => {
        const block = SOURCE.slice(
            SOURCE.indexOf("if (reservation.guest_confirmed_at)"),
            SOURCE.indexOf(".update({ guest_confirmed_at:")
        );
        expect(block).toContain("buildSummary(reservation.guest_confirmed_at)");
        // E non un `new Date()` fabbricato sul momento.
        expect(block).not.toContain("new Date()");
    });

    it("una corsa persa viene riletta e risolta come conferma, non come errore", () => {
        expect(SOURCE).toContain("if (!updated)");
        expect(SOURCE).toContain("recheck?.guest_confirmed_at");
    });
});

describe("separazione dei due token", () => {
    it("questo endpoint accetta solo token con act confirm", () => {
        expect(SOURCE).toContain('verifyReservationToken(rawToken, "confirm")');
    });

    it("l'endpoint di disdetta accetta solo token con act cancel", () => {
        const cancelSource = readFileSync(
            resolve(process.cwd(), "supabase/functions/cancel-reservation-public/index.ts"),
            "utf-8"
        );
        expect(cancelSource).toContain('verifyReservationToken(rawToken, "cancel")');
    });

    it("il promemoria conia DUE token distinti, uno per operazione", () => {
        expect(REMINDERS).toContain('signReservationToken(reservation.id, "cancel")');
        expect(REMINDERS).toContain('signReservationToken(reservation.id, "confirm")');
        expect(REMINDERS).toContain("buildReservationCancelUrl(");
        expect(REMINDERS).toContain("buildReservationConfirmUrl(");
    });

    it("i due URL passano al builder come campi separati", () => {
        const call = REMINDERS.slice(
            REMINDERS.indexOf("buildReservationReminderEmail({"),
            REMINDERS.indexOf("await resend.emails.send(")
        );
        expect(call).toContain("cancelUrl");
        expect(call).toContain("confirmUrl");
    });
});

describe("nessun oracolo", () => {
    it("token non valido e prenotazione inesistente danno lo stesso codice", () => {
        const occurrences = SOURCE.match(/errorResponse\("INVALID_LINK", 404\)/g) ?? [];
        expect(occurrences.length).toBeGreaterThanOrEqual(3);
        expect(SOURCE.match(/INVALID_LINK:\s*"[^"]+"/g) ?? []).toHaveLength(1);
        expect(SOURCE).not.toContain("RESERVATION_NOT_FOUND");
    });

    it("il motivo del rifiuto del token resta nei log", () => {
        expect(SOURCE).toContain("console.warn");
        expect(SOURCE).not.toMatch(/errorResponse\([^)]*tokenErr/);
    });
});

describe("lettura senza effetti e rate limit", () => {
    it("la read ritorna prima di qualsiasi scrittura", () => {
        expect(SOURCE.indexOf('if (action === "read")')).toBeLessThan(
            SOURCE.indexOf(".update({ guest_confirmed_at:")
        );
    });

    it("il rate limit precede la verifica del token", () => {
        expect(SOURCE.indexOf("checkRateLimit(")).toBeLessThan(
            SOURCE.indexOf("verifyReservationToken(")
        );
    });

    it("l'IP non finisce in chiaro nella chiave del bucket", () => {
        expect(SOURCE).toContain("hashIp(");
        expect(SOURCE).not.toMatch(/ip:\$\{clientIp\}/);
    });
});

describe("configurazione dell'endpoint", () => {
    it("è registrata in config.toml con verify_jwt = false", () => {
        const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");
        const block = config.slice(config.indexOf("[functions.confirm-reservation-attendance]"));
        expect(block).toContain("verify_jwt = false");
        expect(block).toContain(
            'entrypoint = "./functions/confirm-reservation-attendance/index.ts"'
        );
    });
});
