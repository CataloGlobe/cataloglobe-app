import { describe, expect, it } from "vitest";
import { filterChipOptions, toggleAll, visibleChips } from "@/components/ui/ChipPicker/chipPickerModel";

const options = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, name: i === 3 ? "Città Alta" : `Sede ${i}` }));

describe("ChipPicker: chip in pagina", () => {
    it("fino a 8 chip, poi «+N altri», nell'ordine dell'elenco", () => {
        const all = options.map(o => o.id).reverse();
        const { chips, rest } = visibleChips(options, all);
        expect(chips.map(c => c.id)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
        expect(rest).toBe(3);
    });

    it("con poche scelte nessun resto", () => {
        expect(visibleChips(options, ["s1", "s2"])).toEqual({ chips: [options[1], options[2]], rest: 0 });
    });
});

describe("ChipPicker: pannello", () => {
    it("la ricerca ignora maiuscole e accenti", () => {
        expect(filterChipOptions(options, "citta").map(o => o.id)).toEqual(["s3"]);
    });

    it("«Seleziona tutte» sceglie tutto, una seconda volta toglie tutto", () => {
        expect(toggleAll(options, ["s1"])).toHaveLength(11);
        expect(toggleAll(options, options.map(o => o.id))).toEqual([]);
    });
});
