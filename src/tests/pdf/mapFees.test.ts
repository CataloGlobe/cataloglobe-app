import { describe, it, expect } from "vitest";
import { mapFees } from "@/services/pdf/mapFees";
import type { ActivityFee } from "@/types/activity";

const fee = (key: ActivityFee["key"], value: string): ActivityFee => ({ key, value });

describe("mapFees", () => {
    it("normalizza a due decimali le voci monetarie digitate col punto", () => {
        expect(mapFees([fee("coperto", "2.5")])).toEqual([
            { label: "Coperto", value: "2,50 €/persona" }
        ]);
    });

    it("normalizza a due decimali le voci monetarie digitate con la virgola", () => {
        expect(mapFees([fee("coperto", "2,5")])).toEqual([
            { label: "Coperto", value: "2,50 €/persona" }
        ]);
    });

    it("formatta anche le voci con unità € semplice", () => {
        expect(mapFees([fee("spesa_minima", "15")])).toEqual([
            { label: "Spesa minima", value: "15,00 €" }
        ]);
    });

    it("lascia invariate le percentuali (non sono valute)", () => {
        expect(mapFees([fee("servizio", "10")])).toEqual([
            { label: "Servizio", value: "10 %" }
        ]);
    });

    it("lascia invariati gli anni (non sono valute)", () => {
        expect(mapFees([fee("eta_minima", "8")])).toEqual([
            { label: "Età minima", value: "8 anni" }
        ]);
    });

    // Il coperto ha valore legale: un dato sporco non deve far sparire la riga.
    it("stampa il valore grezzo quando il parse fallisce", () => {
        expect(mapFees([fee("coperto", "n/d")])).toEqual([
            { label: "Coperto", value: "n/d €/persona" }
        ]);
    });

    it("scarta le voci vuote e gestisce l'assenza di fee", () => {
        expect(mapFees([fee("coperto", "")])).toEqual([]);
        expect(mapFees(null)).toEqual([]);
    });
});
