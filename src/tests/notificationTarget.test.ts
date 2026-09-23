import { describe, expect, it } from "vitest";
import { resolveTargetPath } from "@/components/layout/AppHeader/notificationTarget";
import type { Notification } from "@/services/supabase/notifications";

function notification(o: Partial<Notification>): Notification {
    return { id: "n1", tenant_id: "t1", event_type: "reservation.new", data: {}, ...o } as Notification;
}

describe("resolveTargetPath — prenotazioni", () => {
    it("una nuova prenotazione apre le Prenotazioni della sua sede (§48.1)", () => {
        expect(resolveTargetPath(notification({ data: { activity_id: "a1" } }), null)).toBe(
            "/business/t1/locations/a1/prenotazioni"
        );
        expect(
            resolveTargetPath(notification({ event_type: "reservation.auto_confirmed", data: { activity_id: "a1" } }), null)
        ).toBe("/business/t1/locations/a1/prenotazioni");
    });

    it("senza sede nei dati ripiega su /reservations, che porta comunque in una sede", () => {
        expect(resolveTargetPath(notification({ data: {} }), null)).toBe("/business/t1/reservations");
    });

    it("senza azienda non porta da nessuna parte", () => {
        expect(resolveTargetPath(notification({ tenant_id: null, data: { activity_id: "a1" } }), null)).toBeNull();
        expect(resolveTargetPath(notification({ tenant_id: null, data: { activity_id: "a1" } }), "t9")).toBe(
            "/business/t9/locations/a1/prenotazioni"
        );
    });
});
