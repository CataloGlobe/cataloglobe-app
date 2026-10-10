import { describe, expect, it } from "vitest";
import { placeLines } from "@/utils/placeLabel";

const ALL = "Tutte le sedi";

describe("placeLines", () => {
    it("fuori da una sede: l'azienda e «Tutte le sedi»", () => {
        expect(placeLines("San Pietro", null, ALL)).toEqual({ title: "San Pietro", subtitle: ALL });
    });

    it("sede con lo stesso nome dell'azienda: una riga sola", () => {
        expect(placeLines("San Pietro", "San Pietro", ALL)).toEqual({ title: "San Pietro", subtitle: null });
        expect(placeLines("Caffè Roma", "caffe roma", ALL)).toEqual({ title: "Caffè Roma", subtitle: null });
    });

    it("sede che comincia col nome dell'azienda: resta il resto", () => {
        expect(placeLines("McDonald's", "McDonald's Garbagnate", ALL)).toEqual({
            title: "McDonald's",
            subtitle: "Garbagnate"
        });
        expect(placeLines("San Pietro", "San Pietro - Porta Venezia", ALL)).toEqual({
            title: "San Pietro",
            subtitle: "Porta Venezia"
        });
    });

    it("una parola che solo comincia come l'azienda non si taglia", () => {
        expect(placeLines("Roma", "Romagna Mia", ALL)).toEqual({ title: "Roma", subtitle: "Romagna Mia" });
    });

    it("nomi diversi: tutti e due", () => {
        expect(placeLines("Gruppo Rossi", "Trattoria Bella", ALL)).toEqual({
            title: "Gruppo Rossi",
            subtitle: "Trattoria Bella"
        });
    });
});
