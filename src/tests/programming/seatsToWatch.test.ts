import { describe, it, expect } from "vitest";
import { seatWatchReason, seatsToWatchFirst, seatWatchLabel } from "@/utils/seatsToWatch";
import type { MatrixCell, MatrixRow } from "@/utils/scheduleMatrix";

// Le sedi «da guardare» della card «Adesso» d'azienda (T9b, PG5): sospese,
// senza menù attivo, con modifiche a mano. Le altre sono «senza problemi».
const empty: MatrixCell<{ id: string }> = { kind: "empty", diagnosis: { kind: "none", count: 0 } };
const winner: MatrixCell<{ id: string }> = { kind: "winner", rule: { id: "r" } };

function row(o: Partial<MatrixRow<{ id: string }>> & { activityId: string; layout?: "winner" | "empty" }): MatrixRow<{ id: string }> {
    return {
        activityId: o.activityId,
        name: o.name ?? o.activityId,
        suspended: o.suspended ?? false,
        manualCount: o.manualCount ?? 0,
        cells: {
            layout: o.layout === "empty" ? empty : winner,
            visibility: empty,
            price: empty,
            featured: empty
        }
    };
}

describe("seatWatchReason", () => {
    it("menù attivo, niente a mano: nessun motivo", () => {
        expect(seatWatchReason(row({ activityId: "a" }))).toBeNull();
    });
    it("sospesa vince sugli altri motivi", () => {
        expect(seatWatchReason(row({ activityId: "a", suspended: true, layout: "empty", manualCount: 2 }))).toBe("suspended");
    });
    it("nessun menù attivo", () => {
        expect(seatWatchReason(row({ activityId: "a", layout: "empty" }))).toBe("noMenu");
    });
    it("modifiche a mano", () => {
        expect(seatWatchReason(row({ activityId: "a", manualCount: 1 }))).toBe("manual");
    });
    it("conteggio a mano mancante: non è un motivo", () => {
        expect(seatWatchReason(row({ activityId: "a", manualCount: null }))).toBeNull();
    });
});

describe("seatsToWatchFirst", () => {
    it("prima le sedi da guardare, ognuna nel suo ordine", () => {
        const rows = [
            row({ activityId: "ok1" }),
            row({ activityId: "w1", layout: "empty" }),
            row({ activityId: "ok2" }),
            row({ activityId: "w2", manualCount: 3 })
        ];
        expect(seatsToWatchFirst(rows).map(r => r.activityId)).toEqual(["w1", "w2", "ok1", "ok2"]);
    });
});

describe("seatWatchLabel", () => {
    it("col nome del catalogo del verticale", () => {
        expect(seatWatchLabel("noMenu", "Menù")).toBe("nessun menù attivo");
        expect(seatWatchLabel("manual", "Menù")).toBe("modifiche a mano");
        expect(seatWatchLabel("suspended", "Menù")).toBe("sospesa");
    });
});
