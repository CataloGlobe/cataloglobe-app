import { describe, it, expect } from "vitest";
import { computeVenueStatus, CLOSING_SOON_MINUTES } from "@/components/PublicCollectionView/redesign/venue/venueStatus";
import type { OpeningHoursEntry, UpcomingClosure } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";

// Istanti scritti in UTC; ottobre 2026 a Roma è UTC+2 fino al 25/10 (poi UTC+1).
// lun 12/10/2026, 12:00 Roma = 10:00 UTC.
const at = (iso: string) => new Date(iso);

const slot = (day: number, opens: string, closes: string, extra: Partial<OpeningHoursEntry> = {}): OpeningHoursEntry => ({
    day_of_week: day,
    slot_index: 0,
    opens_at: opens,
    closes_at: closes,
    is_closed: false,
    closes_next_day: false,
    ...extra
});

// Lunedì 12:00-15:00 e 19:00-23:00.
const lunedi = [slot(0, "12:00", "15:00"), slot(0, "19:00", "23:00", { slot_index: 1 })];

describe("computeVenueStatus", () => {
    it("senza orari → unknown", () => {
        expect(computeVenueStatus(at("2026-10-12T10:00:00Z"), [], [])).toMatchObject({ kind: "unknown" });
        expect(computeVenueStatus(at("2026-10-12T10:00:00Z"), undefined, undefined)).toMatchObject({ kind: "unknown" });
    });

    it("dentro la fascia, lontano dalla chiusura → open", () => {
        // lun 12/10 12:30 Roma
        expect(computeVenueStatus(at("2026-10-12T10:30:00Z"), lunedi, [])).toMatchObject({ kind: "open" });
    });

    it("a meno di un'ora dalla chiusura → closing-soon con i minuti", () => {
        // lun 12/10 14:40 Roma
        expect(computeVenueStatus(at("2026-10-12T12:40:00Z"), lunedi, [])).toMatchObject({ kind: "closing-soon", minutes: 20 });
    });

    it("al confine della soglia", () => {
        // 14:00 → 60 min: closing-soon; 13:59 → 61 min: open
        expect(computeVenueStatus(at("2026-10-12T12:00:00Z"), lunedi, []).kind).toBe("closing-soon");
        expect(computeVenueStatus(at("2026-10-12T11:59:00Z"), lunedi, []).kind).toBe("open");
        expect(CLOSING_SOON_MINUTES).toBe(60);
    });

    it("l'ora di chiusura è già chiuso", () => {
        // 15:00 Roma
        expect(computeVenueStatus(at("2026-10-12T13:00:00Z"), lunedi, [])).toMatchObject({
            kind: "closed",
            opensAt: { dayOffset: 0, time: "19:00" }
        });
    });

    it("chiuso a fine serata: la prossima apertura è un altro giorno", () => {
        const sett = [...lunedi, slot(1, "12:00", "15:00")];
        // lun 12/10 23:30 Roma
        expect(computeVenueStatus(at("2026-10-12T21:30:00Z"), sett, [])).toMatchObject({
            kind: "closed",
            opensAt: { dayOffset: 1, time: "12:00" }
        });
    });

    it("fascia notturna: la coda del giorno prima tiene aperto dopo mezzanotte", () => {
        const notte = [slot(0, "19:00", "02:00", { closes_next_day: true })];
        // mar 13/10 00:30 Roma, fascia di lunedì
        expect(computeVenueStatus(at("2026-10-12T22:30:00Z"), notte, [])).toMatchObject({ kind: "open" });
        // mar 13/10 01:30 Roma → 30 min alla chiusura
        expect(computeVenueStatus(at("2026-10-12T23:30:00Z"), notte, [])).toMatchObject({ kind: "closing-soon", minutes: 30 });
        // mar 13/10 02:00 Roma → chiuso
        expect(computeVenueStatus(at("2026-10-13T00:00:00Z"), notte, []).kind).toBe("closed");
    });

    it("23:59 aperto, 00:00 con fascia fino a mezzanotte chiuso", () => {
        const finoAMezzanotte = [slot(0, "18:00", "00:00", { closes_next_day: true })];
        // lun 23:59 Roma
        expect(computeVenueStatus(at("2026-10-12T21:59:00Z"), finoAMezzanotte, [])).toMatchObject({ kind: "closing-soon", minutes: 1 });
        // mar 00:00 Roma
        expect(computeVenueStatus(at("2026-10-12T22:00:00Z"), finoAMezzanotte, []).kind).toBe("closed");
    });

    it("due fasce che si toccano a mezzanotte sono una sola", () => {
        const sett = [slot(0, "18:00", "00:00", { closes_next_day: true }), slot(1, "00:00", "03:00")];
        // mar 00:30 Roma
        expect(computeVenueStatus(at("2026-10-12T22:30:00Z"), sett, [])).toMatchObject({ kind: "open" });
    });

    it("giorno chiuso → apre il giorno dopo", () => {
        const sett = [slot(0, "12:00", "15:00", { is_closed: true }), slot(1, "12:00", "15:00")];
        expect(computeVenueStatus(at("2026-10-12T10:00:00Z"), sett, [])).toMatchObject({
            kind: "closed",
            opensAt: { dayOffset: 1, time: "12:00" }
        });
    });

    it("nessuna apertura nei prossimi 7 giorni → closed senza orario", () => {
        const sett = [slot(0, "12:00", "15:00", { is_closed: true })];
        expect(computeVenueStatus(at("2026-10-12T10:00:00Z"), sett, [])).toMatchObject({ kind: "closed", opensAt: null });
    });

    it("chiusura straordinaria di tutto il giorno vince sulle fasce", () => {
        const chiusura: UpcomingClosure = { closure_date: "2026-10-12", end_date: null, label: null, is_closed: true, slots: null };
        // Il lunedì dopo (fra 7 giorni) riapre.
        expect(computeVenueStatus(at("2026-10-12T10:30:00Z"), lunedi, [chiusura])).toMatchObject({
            kind: "closed",
            opensAt: { dayOffset: 7, time: "12:00" }
        });
    });

    it("chiusura straordinaria con fasce proprie sostituisce quelle del giorno", () => {
        const speciale: UpcomingClosure = {
            closure_date: "2026-10-12",
            end_date: null,
            label: null,
            is_closed: false,
            slots: [{ opens_at: "10:00", closes_at: "11:00", closes_next_day: false }]
        };
        // 12:30 Roma: la fascia normale sarebbe aperta, quella speciale no
        expect(computeVenueStatus(at("2026-10-12T10:30:00Z"), lunedi, [speciale]).kind).toBe("closed");
    });

    it("chiusura su un intervallo di giorni", () => {
        const ferie: UpcomingClosure = { closure_date: "2026-10-12", end_date: "2026-10-14", label: null, is_closed: true, slots: null };
        const sett = [slot(0, "12:00", "15:00"), slot(1, "12:00", "15:00"), slot(2, "12:00", "15:00"), slot(3, "12:00", "15:00")];
        expect(computeVenueStatus(at("2026-10-13T10:30:00Z"), sett, [ferie])).toMatchObject({
            kind: "closed",
            opensAt: { dayOffset: 2, time: "12:00" }
        });
    });

    it("la chiusura di oggi toglie la coda notturna di ieri", () => {
        const notte = [slot(0, "19:00", "02:00", { closes_next_day: true })];
        const chiusoMartedi: UpcomingClosure = { closure_date: "2026-10-13", end_date: null, label: null, is_closed: true, slots: null };
        // mar 13/10 00:30 Roma
        expect(computeVenueStatus(at("2026-10-12T22:30:00Z"), notte, [chiusoMartedi]).kind).toBe("closed");
    });

    it("cambio dell'ora legale (25/10/2026) non rompe il calcolo", () => {
        const sett = [slot(6, "12:00", "15:00")];
        // dom 25/10 12:30 Roma = 11:30 UTC (UTC+1)
        expect(computeVenueStatus(at("2026-10-25T11:30:00Z"), sett, [])).toMatchObject({ kind: "open" });
        // dom 25/10 00:30 Roma = sab 24/10 22:30 UTC (ancora UTC+2)
        expect(computeVenueStatus(at("2026-10-24T22:30:00Z"), sett, [])).toMatchObject({
            kind: "closed",
            opensAt: { dayOffset: 0, time: "12:00" }
        });
    });
});
