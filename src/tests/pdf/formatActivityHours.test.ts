import { describe, it, expect } from "vitest";

import { formatActivityHours } from "@/services/pdf/formatActivityHours";
import type { V2ActivityHours } from "@/types/activity-hours";

function h(overrides: Partial<V2ActivityHours>): V2ActivityHours {
    return {
        id: `${overrides.day_of_week ?? 0}-${overrides.slot_index ?? 0}`,
        tenant_id: "t",
        activity_id: "a",
        day_of_week: 0,
        slot_index: 0,
        opens_at: "12:00",
        closes_at: "15:00",
        closes_next_day: false,
        is_closed: false,
        created_at: "",
        updated_at: "",
        ...overrides
    };
}

describe("formatActivityHours", () => {
    it("input vuoto → nessuna riga", () => {
        expect(formatActivityHours([])).toEqual([]);
    });

    it("stesso orario 7 giorni → un'unica riga Lun–Dom", () => {
        const hours = Array.from({ length: 7 }, (_, d) =>
            h({ day_of_week: d, opens_at: "07:30", closes_at: "22:30" })
        );
        expect(formatActivityHours(hours)).toEqual([
            { label: "Lun–Dom", value: "07:30–22:30" }
        ]);
    });

    it("raggruppa giorni consecutivi con orario identico, isola i diversi", () => {
        // Lun-Ven 12-15, Sab-Dom 19-23
        const hours = [
            ...[0, 1, 2, 3, 4].map(d => h({ day_of_week: d, opens_at: "12:00", closes_at: "15:00" })),
            ...[5, 6].map(d => h({ day_of_week: d, opens_at: "19:00", closes_at: "23:00" }))
        ];
        expect(formatActivityHours(hours)).toEqual([
            { label: "Lun–Ven", value: "12:00–15:00" },
            { label: "Sab–Dom", value: "19:00–23:00" }
        ]);
    });

    it("fasce multiple/giorno unite per slot_index", () => {
        const hours = [
            h({ day_of_week: 0, slot_index: 1, opens_at: "19:00", closes_at: "23:00" }),
            h({ day_of_week: 0, slot_index: 0, opens_at: "12:00", closes_at: "15:00" })
        ];
        expect(formatActivityHours(hours)).toEqual([
            { label: "Lun", value: "12:00–15:00 · 19:00–23:00" },
            { label: "Mar–Dom", value: "Chiuso" }
        ]);
    });

    it("is_closed → 'Chiuso'; giorno chiuso in mezzo spezza il gruppo", () => {
        const hours = [
            ...[0, 1].map(d => h({ day_of_week: d, opens_at: "09:00", closes_at: "18:00" })),
            h({ day_of_week: 2, is_closed: true, opens_at: null, closes_at: null }),
            ...[3, 4].map(d => h({ day_of_week: d, opens_at: "09:00", closes_at: "18:00" }))
        ];
        expect(formatActivityHours(hours)).toEqual([
            { label: "Lun–Mar", value: "09:00–18:00" },
            { label: "Mer", value: "Chiuso" },
            { label: "Gio–Ven", value: "09:00–18:00" },
            { label: "Sab–Dom", value: "Chiuso" }
        ]);
    });

    it("giorno assente dalla tabella → trattato come Chiuso", () => {
        const hours = [h({ day_of_week: 0, opens_at: "10:00", closes_at: "20:00" })];
        expect(formatActivityHours(hours)).toEqual([
            { label: "Lun", value: "10:00–20:00" },
            { label: "Mar–Dom", value: "Chiuso" }
        ]);
    });

    it("closes_next_day → orario di chiusura reso as-is (mattina dopo)", () => {
        const hours = [h({ day_of_week: 4, opens_at: "19:00", closes_at: "02:00", closes_next_day: true })];
        const rows = formatActivityHours(hours);
        expect(rows.find(r => r.label === "Ven")?.value).toBe("19:00–02:00");
    });
});
