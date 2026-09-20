import { describe, expect, it } from "vitest";

import { computeBlockedDay, formatSlotList } from "@/pages/Operativita/Attivita/tabs/hours-services/blockTimeRange";
import type { V2ActivityClosure } from "@/types/activity-closures";
import type { V2ActivityHours } from "@/types/activity-hours";

// FASE 5.5 — la sottrazione di una fascia dagli orari del giorno, nella
// forma che `activity_closures.slots` sa esprimere. Il punto di partenza
// viene da `getDaySlots` (lo stesso del picker), quindi qui si prova la
// sottrazione, non la lettura degli orari.

function hour(
    day_of_week: number,
    opens_at: string,
    closes_at: string,
    closes_next_day = false,
    slot_index = 0
): V2ActivityHours {
    return {
        id: `h-${day_of_week}-${slot_index}`,
        tenant_id: "t",
        activity_id: "a",
        day_of_week,
        slot_index,
        opens_at: `${opens_at}:00`,
        closes_at: `${closes_at}:00`,
        closes_next_day,
        is_closed: false,
        created_at: "",
        updated_at: ""
    };
}

function closure(closure_date: string, patch: Partial<V2ActivityClosure> = {}): V2ActivityClosure {
    return {
        id: "c",
        tenant_id: "t",
        activity_id: "a",
        closure_date,
        end_date: null,
        label: null,
        is_closed: true,
        slots: null,
        created_at: "",
        updated_at: "",
        ...patch
    };
}

// 2026-09-22 è un martedì (dow Monday-based = 1).
const TUE = "2026-09-22";
const MON = "2026-09-21";

describe("computeBlockedDay", () => {
    it("una fascia in mezzo alla giornata la spezza in due", () => {
        const r = computeBlockedDay({
            isoDate: TUE, hours: [hour(1, "07:30", "22:30")], closures: [], from: "20:00", to: "22:00"
        });
        expect(r).toEqual({
            kind: "partial",
            before: [{ opens_at: "07:30", closes_at: "22:30", closes_next_day: false }],
            slots: [
                { opens_at: "07:30", closes_at: "20:00", closes_next_day: false },
                { opens_at: "22:00", closes_at: "22:30", closes_next_day: false }
            ]
        });
    });

    it("multi-slot: la fascia si sottrae da ogni slot, uno svuotato sparisce, gli altri restano", () => {
        const r = computeBlockedDay({
            isoDate: TUE,
            hours: [hour(1, "12:00", "15:00", false, 0), hour(1, "19:00", "23:00", false, 1)],
            closures: [],
            from: "14:00",
            to: "20:00"
        });
        expect(r.kind).toBe("partial");
        if (r.kind !== "partial") return;
        expect(r.slots).toEqual([
            { opens_at: "12:00", closes_at: "14:00", closes_next_day: false },
            { opens_at: "20:00", closes_at: "23:00", closes_next_day: false }
        ]);

        const whole = computeBlockedDay({
            isoDate: TUE,
            hours: [hour(1, "12:00", "15:00", false, 0), hour(1, "19:00", "23:00", false, 1)],
            closures: [],
            from: "11:00",
            to: "16:00"
        });
        expect(whole.kind).toBe("partial");
        if (whole.kind !== "partial") return;
        expect(whole.slots).toEqual([{ opens_at: "19:00", closes_at: "23:00", closes_next_day: false }]);
    });

    it("se si svuota tutto il giorno diventa chiuso", () => {
        const r = computeBlockedDay({
            isoDate: TUE, hours: [hour(1, "07:30", "22:30")], closures: [], from: "07:00", to: "23:00"
        });
        expect(r.kind).toBe("closed-all-day");
    });

    it("una fascia che non tocca nessun orario non cambia niente", () => {
        const r = computeBlockedDay({
            isoDate: TUE, hours: [hour(1, "12:00", "15:00")], closures: [], from: "16:00", to: "18:00"
        });
        expect(r.kind).toBe("no-overlap");
    });

    it("«00:00» come fine vale mezzanotte: taglia la coda della giornata", () => {
        const r = computeBlockedDay({
            isoDate: TUE, hours: [hour(1, "07:30", "22:30")], closures: [], from: "20:00", to: "00:00"
        });
        expect(r).toMatchObject({
            kind: "partial",
            slots: [{ opens_at: "07:30", closes_at: "20:00", closes_next_day: false }]
        });
    });

    it("slot oltre la mezzanotte: un buco prima della mezzanotte lascia la coda intatta", () => {
        const r = computeBlockedDay({
            isoDate: TUE, hours: [hour(1, "19:00", "02:00", true)], closures: [], from: "21:00", to: "22:00"
        });
        expect(r).toMatchObject({
            kind: "partial",
            slots: [
                { opens_at: "19:00", closes_at: "21:00", closes_next_day: false },
                { opens_at: "22:00", closes_at: "02:00", closes_next_day: true }
            ]
        });
    });

    it("slot oltre la mezzanotte: bloccare fino a mezzanotte lascerebbe solo il pezzo di D+1 → non esprimibile", () => {
        const r = computeBlockedDay({
            isoDate: TUE, hours: [hour(1, "19:00", "02:00", true)], closures: [], from: "22:00", to: "00:00"
        });
        expect(r.kind).toBe("not-representable");
    });

    it("slot fino a mezzanotte esatta (nd=true, 00:00): bloccare la fine non è un pezzo di D+1", () => {
        const r = computeBlockedDay({
            isoDate: TUE, hours: [hour(1, "07:30", "00:00", true)], closures: [], from: "22:00", to: "00:00"
        });
        expect(r).toMatchObject({
            kind: "partial",
            slots: [{ opens_at: "07:30", closes_at: "22:00", closes_next_day: false }]
        });
    });

    it("la coda del giorno prima si conserva come fascia esplicita", () => {
        // Lunedì 19:00–02:00+1 → martedì ha la coda 00:00–02:00 prima del suo orario.
        const hours = [hour(0, "19:00", "02:00", true), hour(1, "12:00", "15:00")];
        const r = computeBlockedDay({ isoDate: TUE, hours, closures: [], from: "13:00", to: "14:00" });
        expect(r).toMatchObject({
            kind: "partial",
            slots: [
                { opens_at: "00:00", closes_at: "02:00", closes_next_day: false },
                { opens_at: "12:00", closes_at: "13:00", closes_next_day: false },
                { opens_at: "14:00", closes_at: "15:00", closes_next_day: false }
            ]
        });

        // E si può bloccare la coda stessa.
        const tail = computeBlockedDay({ isoDate: TUE, hours, closures: [], from: "00:00", to: "01:00" });
        expect(tail).toMatchObject({
            kind: "partial",
            slots: [
                { opens_at: "01:00", closes_at: "02:00", closes_next_day: false },
                { opens_at: "12:00", closes_at: "15:00", closes_next_day: false }
            ]
        });
    });

    it("una data già coperta da una chiusura (anche a intervallo) non si blocca: si modifica quella", () => {
        expect(
            computeBlockedDay({
                isoDate: TUE, hours: [hour(1, "07:30", "22:30")], closures: [closure(TUE)], from: "20:00", to: "22:00"
            }).kind
        ).toBe("already-closure");
        expect(
            computeBlockedDay({
                isoDate: TUE,
                hours: [hour(1, "07:30", "22:30")],
                closures: [closure(MON, { end_date: "2026-09-25" })],
                from: "20:00",
                to: "22:00"
            }).kind
        ).toBe("already-closure");
    });

    it("giorno senza orari: niente da bloccare", () => {
        expect(
            computeBlockedDay({ isoDate: TUE, hours: [hour(3, "07:30", "22:30")], closures: [], from: "20:00", to: "22:00" }).kind
        ).toBe("no-hours");
    });

    it("una chiusura totale sul giorno prima sopprime la coda, come nel picker", () => {
        const hours = [hour(0, "19:00", "02:00", true), hour(1, "12:00", "15:00")];
        const r = computeBlockedDay({ isoDate: TUE, hours, closures: [closure(MON)], from: "13:00", to: "14:00" });
        expect(r).toMatchObject({
            kind: "partial",
            slots: [
                { opens_at: "12:00", closes_at: "13:00", closes_next_day: false },
                { opens_at: "14:00", closes_at: "15:00", closes_next_day: false }
            ]
        });
    });
});

describe("formatSlotList", () => {
    it("elenca le fasce, segnando quelle che finiscono il giorno dopo", () => {
        expect(
            formatSlotList([
                { opens_at: "07:30", closes_at: "20:00", closes_next_day: false },
                { opens_at: "22:00", closes_at: "02:00", closes_next_day: true }
            ])
        ).toBe("07:30–20:00, 22:00–02:00 (+1)");
    });
});
