// «E adesso?» dopo ogni creazione (D194): cosa si eredita, cosa si chiede di confermare.
import { describe, expect, it } from "vitest";
import { adessoDid, blocker, inhAsk, newTunnel, type Ctx, type From } from "@/pages/Dashboard/Crea/creaModel";
import { badSel } from "@/pages/Dashboard/Crea/creaBad";

const ALL = { all: true, activityIds: [], groupIds: [] };
const c: Ctx = { owner: true, multi: true };
const from = (over: Partial<From> = {}): From => ({
    kind: "menu",
    name: "Pranzo",
    catalogId: "m",
    ruleId: "r",
    productIds: ["p1", "p2"],
    dish: { id: "p1", name: "Margherita" },
    onda: "on",
    when: { days: [0, 1, 2, 3, 4], ranges: [[720, 900]] },
    where: { all: false, activityIds: ["porto", "lido"], groupIds: [] },
    per: null,
    ...over
});

describe("da «E adesso?»: quello che si eredita", () => {
    it("in onda: sedi e orari arrivano già scelti, e la cosa nuova è già in onda", () => {
        const t = newTunnel("stile", ALL, from());
        expect(t).toMatchObject({ onda: "on", qmode: "momenti", when: { days: [0, 1, 2, 3, 4] }, where: { all: false, activityIds: ["porto", "lido"] } });
        expect(inhAsk(t)).toBe(true);
    });

    it("tenuta pronta: «In onda?» si richiede", () => {
        expect(newTunnel("evid", ALL, from({ onda: "off" })).onda).toBeNull();
    });

    it("in evidenza e storia partono dal primo piatto", () => {
        expect(newTunnel("evid", ALL, from())).toMatchObject({ evType: "promo", dishes: ["p1"] });
        expect(newTunnel("storia", ALL, from()).linked).toBe("p1");
        expect(newTunnel("evid", ALL, from({ dish: null }))).toMatchObject({ evType: null, dishes: [] });
        expect(newTunnel("stile", ALL, from()).dishes).toEqual([]);
    });

    it("la storia non ha ore; da più sedi va in tutte, e non chiede conferme", () => {
        const t = newTunnel("storia", ALL, from());
        expect(t).toMatchObject({ qmode: "sempre", when: {}, per: null, where: { all: true, activityIds: [] } });
        expect(inhAsk(t)).toBe(false);
        expect(newTunnel("storia", ALL, from({ where: { all: false, activityIds: ["porto"], groupIds: [] } })).where).toMatchObject({ all: false, activityIds: ["porto"] });
    });

    it("da una storia non si ereditano sedi e ore: solo il piatto", () => {
        const none = { all: false, activityIds: [], groupIds: [] };
        const t = newTunnel("evid", none, from({ kind: "storia", catalogId: null, ruleId: null, productIds: [] }));
        expect(t).toMatchObject({ onda: null, qmode: "sempre", when: {}, where: none, dishes: ["p1"] });
        expect(inhAsk(t)).toBe(false);
    });
});

describe("da «E adesso?»: sedi e orari si confermano o si cambiano", () => {
    it("il Dove chiede le sedi, il Quando gli orari; «Avanti» porta al riquadro", () => {
        const t = newTunnel("stile", ALL, from());
        expect(blocker(t, "dove", c)).toBe("Conferma le sedi o cambiale");
        expect(badSel("dove", blocker(t, "dove", c), t)).toBe('[data-bad="inhd"]');
        t.inhD = "si";
        expect(blocker(t, "dove", c)).toBe("");
        expect(blocker(t, "quando", c)).toBe("Conferma gli orari o cambiali");
        expect(badSel("quando", blocker(t, "quando", c), t)).toBe('[data-bad="inhq"]');
        t.inhQ = "cambio";
        expect(blocker(t, "quando", c)).toBe("");
    });

    it("tenuto pronto non chiede niente; senza sedi vince «Scegli almeno una sede»", () => {
        const t = newTunnel("stile", ALL, from());
        t.onda = "off";
        expect(blocker(t, "dove", c)).toBe("");
        expect(blocker(t, "quando", c)).toBe("");
        t.onda = "on";
        t.where = { all: false, activityIds: [], groupIds: [] };
        expect(blocker(t, "dove", c)).toBe("Scegli almeno una sede");
    });

    it("con una sede sola il Dove non c'è: si confermano solo gli orari", () => {
        const t = newTunnel("stile", ALL, from());
        expect(blocker(t, "dove", { owner: true, multi: false })).toBe("");
        expect(blocker(t, "quando", { owner: true, multi: false })).toBe("Conferma gli orari o cambiali");
    });

    it("una creazione normale non chiede conferme", () => {
        const t = newTunnel("stile", ALL);
        t.onda = "on";
        expect(inhAsk(t)).toBe(false);
        expect(blocker(t, "dove", c)).toBe("");
    });
});

describe("«E adesso?»: cosa hai appena fatto", () => {
    const menu = newTunnel("menu", { all: false, activityIds: ["porto"], groupIds: [] });
    it("in onda, con le sedi e le ore", () => {
        expect(adessoDid(menu, { name: "Pranzo", live: true }, { multi: true, sedi: ["Porto", "Lido"], dish: "" })).toBe("«Pranzo» è in onda a Porto e Lido, sempre, tutto il giorno.");
        expect(adessoDid(menu, { name: "Pranzo", live: true }, { multi: false, sedi: ["Porto"], dish: "" })).toBe("«Pranzo» è in onda, sempre, tutto il giorno.");
    });
    it("tenuto pronto, al maschile e al femminile", () => {
        expect(adessoDid(menu, { name: "Pranzo", live: false }, { multi: true, sedi: [], dish: "" })).toBe("«Pranzo» è pronto: nessun cliente lo vede finché non lo metti in onda.");
        expect(adessoDid(newTunnel("storia", ALL), { name: "Il forno", live: false }, { multi: true, sedi: [], dish: "" })).toBe("«Il forno» è pronta: nessun cliente la vede finché non la metti in onda.");
    });
    it("la storia dice dove si vede", () => {
        const st = newTunnel("storia", ALL);
        expect(adessoDid(st, { name: "Il forno", live: true }, { multi: true, sedi: [], dish: "" })).toBe("«Il forno» è in onda: si vede sotto il menù.");
        expect(adessoDid(st, { name: "Il forno", live: true }, { multi: true, sedi: [], dish: "Margherita" })).toBe("«Il forno» è in onda: si vede in fondo alla scheda di «Margherita».");
    });
});
