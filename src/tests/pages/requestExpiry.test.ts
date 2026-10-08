import { describe, it, expect } from "vitest";
import { isExpiredRequest } from "@/pages/Dashboard/Reservations/requestExpiry";

// T19: una richiesta (pending) del giorno già passato è scaduta: in Prenotazioni
// sta sotto «Scadute» e non ha «Conferma», né nella riga né nel dettaglio.
describe("isExpiredRequest", () => {
    const pending = (reservation_date: string) => ({ status: "pending" as const, reservation_date });

    it("a request of a past day is expired", () => {
        expect(isExpiredRequest(pending("2026-10-06"), "2026-10-07")).toBe(true);
    });

    it("today and later are not", () => {
        expect(isExpiredRequest(pending("2026-10-07"), "2026-10-07")).toBe(false);
        expect(isExpiredRequest(pending("2026-10-09"), "2026-10-07")).toBe(false);
    });

    it("only requests expire: a confirmed booking of yesterday is not «expired»", () => {
        expect(isExpiredRequest({ status: "confirmed", reservation_date: "2026-10-06" }, "2026-10-07")).toBe(false);
    });
});
