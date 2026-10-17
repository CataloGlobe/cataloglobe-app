import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/services/supabase/client", () => ({
    supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
    saveScheduleModel,
    toModelSlot,
} from "@/services/supabase/scheduleModel";

beforeEach(() => rpc.mockReset());

describe("saveScheduleModel — una RPC per menù, modo e fasce", () => {
    it("manda id e payload così come sono", async () => {
        rpc.mockResolvedValue({ data: null, error: null });
        const payload = {
            catalog_id: "menu-bar",
            overlap_mode: "together" as const,
            slots: [
                toModelSlot({ uiDays: [0, 1, 2, 3, 4], from: "12:00", to: "15:00" }),
            ],
        };
        await saveScheduleModel("regola-1", payload);
        expect(rpc).toHaveBeenCalledWith("save_schedule_model", {
            p_schedule_id: "regola-1",
            p_payload: payload,
        });
    });

    it("rilancia l'errore del database", async () => {
        const error = { code: "42501", message: "Permesso negato" };
        rpc.mockResolvedValue({ data: null, error });
        await expect(
            saveScheduleModel("regola-1", { catalog_id: "x" }),
        ).rejects.toBe(error);
    });
});

describe("toModelSlot — dall'interfaccia al database", () => {
    it("i giorni passano da lunedì = 0 a domenica = 0", () => {
        expect(
            toModelSlot({ uiDays: [0, 4, 6], from: "12:00", to: "15:00" }),
        ).toEqual({
            days_of_week: [0, 1, 5],
            start_minute: 720,
            end_minute: 900,
        });
    });

    it("una fine non dopo l'inizio passa la mezzanotte", () => {
        expect(
            toModelSlot({ uiDays: [3], from: "19:00", to: "02:00" }),
        ).toMatchObject({
            days_of_week: [4],
            start_minute: 1140,
            end_minute: 1560,
        });
    });

    it("23:59 e 00:00 come fine sono la mezzanotte; senza giorni vale ogni giorno", () => {
        expect(
            toModelSlot({ uiDays: null, from: "19:00", to: "23:59" }),
        ).toMatchObject({ days_of_week: null, end_minute: 1440 });
        expect(
            toModelSlot({ uiDays: null, from: "19:00", to: "00:00" }),
        ).toMatchObject({ end_minute: 1440 });
    });

    it("inizio e fine uguali non sono una fascia", () => {
        expect(() => toModelSlot({ uiDays: null, from: "10:00", to: "10:00" })).toThrow();
    });

    it("le sedi della fascia ci sono solo se scelte", () => {
        const targets = [
            { target_type: "activity" as const, target_id: "comasina" },
        ];
        expect(
            toModelSlot({ uiDays: null, from: "10:00", to: "11:00", targets })
                .targets,
        ).toEqual(targets);
        expect(
            toModelSlot({ uiDays: null, from: "10:00", to: "11:00", targets: [] }),
        ).not.toHaveProperty("targets");
    });
});
