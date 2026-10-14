import { describe, expect, it } from "vitest";
import it_ from "@/i18n/locales/it/public.json";
import de from "@/i18n/locales/de/public.json";
import en from "@/i18n/locales/en/public.json";
import es from "@/i18n/locales/es/public.json";
import fr from "@/i18n/locales/fr/public.json";
import { venueStatusLabel, venueStatusWord } from "@/components/PublicCollectionView/redesign/venue/venueLabel";
import type { VenueStatus } from "@/components/PublicCollectionView/redesign/venue/venueStatus";

/** `t` minimo sulle traduzioni vere: chiave `venue.x` e `{{nome}}`. */
function translator(dict: { venue: Record<string, string> }) {
    return (key: string, o: Record<string, unknown> = {}) =>
        dict.venue[key.replace(/^venue\./, "")].replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(o[name]));
}

const closed = (dayOffset: number, dow: number): VenueStatus => ({ kind: "closed", opensAt: { dayOffset, time: "12:00", dow } });

describe("venueStatusLabel", () => {
    const t = translator(it_);

    it("frase intera per Orari e fondo pagina", () => {
        expect(venueStatusLabel(closed(1, 2), t, "it")).toBe("Chiuso · apre domani alle 12:00");
        expect(venueStatusLabel(closed(3, 0), t, "it")).toBe("Chiuso · apre lunedì alle 12:00");
    });

    it("corta per la pillola: oggi, domani, giorno abbreviato", () => {
        expect(venueStatusLabel(closed(0, 1), t, "it", true)).toBe("Chiuso · oggi 12:00");
        expect(venueStatusLabel(closed(1, 2), t, "it", true)).toBe("Chiuso · domani 12:00");
        expect(venueStatusLabel(closed(3, 0), t, "it", true)).toBe("Chiuso · lun 12:00");
        expect(venueStatusLabel(closed(3, 0), translator(de), "de", true)).toBe("Geschlossen · Mo 12:00");
        expect(venueStatusLabel(closed(3, 0), translator(fr), "fr", true)).toBe("Fermé · lun. 12:00");
    });

    it("le forme corte ci sono in tutte e cinque le lingue", () => {
        for (const dict of [it_, en, de, fr, es] as { venue: Record<string, string> }[]) {
            expect(dict.venue.closed_opens_today_short).toContain("{{time}}");
            expect(dict.venue.closed_opens_tomorrow_short).toContain("{{time}}");
            expect(dict.venue.closed_opens_day_short).toMatch(/\{\{day\}\}.*\{\{time\}\}/);
        }
    });

    it("aperto e chiusura vicina non cambiano", () => {
        expect(venueStatusLabel({ kind: "open" }, t, "it", true)).toBe("Aperto");
        expect(venueStatusLabel({ kind: "closing-soon", minutes: 20 }, t, "it", true)).toBe("Chiude tra 20 min");
        expect(venueStatusLabel({ kind: "closed", opensAt: null }, t, "it", true)).toBe("Chiuso");
    });
});

describe("venueStatusWord", () => {
    it("accanto al selettore dei menu solo la parola, in tutte e cinque le lingue", () => {
        const t = translator(it_);
        expect(venueStatusWord(closed(1, 2), t)).toBe("Chiuso");
        expect(venueStatusWord({ kind: "open", closesAt: "23:00" } as VenueStatus, t)).toBe("Aperto");
        expect(venueStatusWord({ kind: "closing-soon", minutes: 20 } as VenueStatus, t)).toBe("Chiude presto");
        expect(venueStatusWord({ kind: "unknown" } as VenueStatus, t)).toBeNull();
        for (const dict of [it_, en, de, fr, es] as { venue: Record<string, string> }[]) {
            expect(dict.venue.closing_soon_word).toBeTruthy();
            expect(dict.venue.closing_soon_word).not.toContain("{{");
        }
    });
});
