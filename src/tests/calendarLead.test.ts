import { describe, expect, it } from "vitest";
import { calLead, inOndaOra } from "@/pages/Dashboard/Programming/calendar/calendarLead";
import type { Pezzo } from "@/pages/Dashboard/Programming/calendar/calendarConfronto";

const p = (k: Pezzo["k"], label: string, from: number, to: number): Pezzo => ({ k, label, first: label.split(" + ")[0], from, to });
const text = (parts: ReturnType<typeof calLead>) => parts.map(x => ("text" in x ? x.text : "name" in x ? x.name : "down" in x ? x.down : x.strong)).join("");

describe("calendarLead", () => {
    it("prende chi copre l'ora, anche da ieri dopo mezzanotte", () => {
        const oggi = [p("menu", "Pranzo", 720, 900), p("menu", "Cena + Vini", 1140, 1380), p("style", "Sera", 1080, 1500)];
        const ieri = [p("style", "Notte", 1320, 1530)];
        expect(inOndaOra(oggi, ieri, 1200)).toEqual({ menu: ["Cena", "Vini"], style: ["Sera"], featured: [] });
        expect(inOndaOra(oggi, ieri, 60)).toEqual({ menu: [], style: ["Notte"], featured: [] });
    });

    it("la frase con la sede, lo stile e in evidenza", () => {
        const parts = calLead({ menu: ["Cena"], style: ["Sera in sala"], featured: ["Risotto"] }, "a San Pietro");
        expect(text(parts)).toBe("Adesso a San Pietro i clienti vedono Cena, con lo stile Sera in sala; in evidenza Risotto.");
        expect(parts.filter(x => "name" in x).map(x => ("name" in x ? x.family : ""))).toEqual(["menu", "style", "featured"]);
    });

    it("una sede sola, tutte le sedi, nessun menù", () => {
        expect(text(calLead({ menu: ["A", "B"], style: [], featured: [] }, ""))).toBe("Adesso i clienti vedono A e B.");
        expect(text(calLead({ menu: ["A"], style: [], featured: [] }, ", nella maggior parte delle sedi,"))).toBe(
            "Adesso, nella maggior parte delle sedi, i clienti vedono A."
        );
        expect(text(calLead({ menu: [], style: ["S"], featured: [] }, "a Lago"))).toBe("Adesso a Lago nessun menù è in onda.");
    });
});
