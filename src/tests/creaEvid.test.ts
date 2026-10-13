import { describe, expect, it, vi } from "vitest";
// i moduli del tunnel arrivano fino al client: qui non serve, e senza `.env` non partirebbe
vi.mock("@/services/supabase/client", () => ({ supabase: {} }));
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { asEdit, newTunnel, stepSummary, type Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import { dropDishes, dropIdea, ideaOf, pickIdea } from "@/pages/Dashboard/Crea/evidIdee";
import { CreaPhone } from "@/pages/Dashboard/Crea/CreaPhone";
import s from "@/pages/Dashboard/Crea/Crea.module.scss";
import { DEFAULT_STYLE_TOKENS } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";

// Il contenuto in evidenza senza il passo «Che cosa?» (D187): le idee, il
// telefono e il riepilogo dei piatti.

const ALL = { all: true, activityIds: [], groupIds: [] };
const none = new Map<string, string>();
const L: DraftLookups = { products: new Map(), catalogs: none, styles: none, featured: none, sedi: none, groups: none, multi: false };
const idea = (id: string) => ideaOf(id)!;

describe("contenuto in evidenza: partire da un'idea", () => {
    it("un'idea coi piatti ne apre la parte; «Parti da un'altra idea» la richiude", () => {
        const t = newTunnel("evid", ALL);
        pickIdea(t, idea("fisso"));
        expect(t.evType).toBe("bundle");
        dropIdea(t);
        expect(t.idea).toBeNull();
        expect(t.evType).toBeNull();
    });

    it("una serata è un evento, anche dopo aver aggiunto e tolto i piatti (review #444)", () => {
        const t = newTunnel("evid", ALL);
        pickIdea(t, idea("serata"));
        expect(t.evType).toBe("evento");
        t.evType = "promo";
        dropDishes(t);
        expect(t.evType).toBe("evento");
        dropIdea(t);
        expect(t.evType).toBeNull();
    });

    it("in modifica «Togli» rimette il tipo di prima, non l'annuncio (review #444)", () => {
        const ev = asEdit({ ...newTunnel("evid", ALL), title: "Karaoke", evType: "evento" }, "f1", { id: null, count: 0 });
        ev.evType = "promo";
        dropDishes(ev);
        expect(ev.evType).toBe("evento");
        const pr = asEdit({ ...newTunnel("evid", ALL), title: "Pranzo", evType: "promo" }, "f2", { id: null, count: 0 });
        dropDishes(pr);
        expect(pr.evType).toBeNull();
    });

    it("un'idea senza piatti, cambiata, lascia stare i piatti aperti a mano", () => {
        const t = { ...newTunnel("evid", ALL), evType: "promo" as const };
        pickIdea(t, idea("avviso"));
        dropIdea(t);
        expect(t.evType).toBe("promo");
    });
});

describe("contenuto in evidenza: il telefono", () => {
    const phone = (t: Tunnel, step: "contenuto" | "controlla") =>
        renderToStaticMarkup(h(CreaPhone, { t, step, tk: DEFAULT_STYLE_TOKENS, business: "Da Mario", menus: [], sample: [], L, imageUrl: null, coverUrl: null }));

    it("si evidenzia anche un contenuto senza piatti, non in «Controlla»", () => {
        const t = { ...newTunnel("evid", ALL), title: "Chiusi per ferie" };
        expect(t.evType).toBeNull();
        expect(phone(t, "contenuto")).toContain(s.hl);
        expect(phone(t, "controlla")).not.toContain(s.hl);
    });
});

describe("contenuto in evidenza: il riepilogo dei piatti", () => {
    it("il bundle dice «totale di prima barrato»", () => {
        const t = { ...newTunnel("evid", ALL), title: "Degustazione", evType: "bundle" as const, dishes: ["p1"], bundle: "35" };
        expect(stepSummary(t, "contenuto", L, () => "")).toContain("totale di prima barrato");
        expect(stepSummary({ ...t, showOrig: false }, "contenuto", L, () => "")).not.toContain("barrato");
    });
});
