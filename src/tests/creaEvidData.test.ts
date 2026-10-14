import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB, NEW_MODEL } from "@/pages/Dashboard/Programming/calendar/calendarFlags";
import { dayNum } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { blocker, newTunnel, stepSummary, type Tunnel } from "@/pages/Dashboard/Crea/creaModel";
import { btnName, btnOk, dateTxt, effBtn, evidColumns, evidWait, presetQuando, qautoNote, readEvid } from "@/pages/Dashboard/Crea/evidData";

const ALL = { all: true, activityIds: [], groupIds: [] };
const D = (day: number) => dayNum(2026, 9, day); // ottobre 2026
const evid = (fn?: (t: Tunnel) => void) => {
    const t = newTunnel("evid", ALL);
    t.title = "Karaoke";
    fn?.(t);
    return t;
};

describe("in evidenza: «Quando succede» e «Il pulsante» (D187)", () => {
    const keep = { evid: NEW_MODEL.evid, ready: DB.ready };
    beforeEach(() => void (NEW_MODEL.evid = true));
    afterEach(() => {
        NEW_MODEL.evid = keep.evid;
        DB.ready = keep.ready;
    });

    it("la riga sulla card", () => {
        const t = evid();
        expect(dateTxt(t.date)).toBe("");
        Object.assign(t.date, { k: "day", day: D(21) });
        expect(dateTxt(t.date)).toBe("Mercoledì 21 ott");
        t.date.time = 17 * 60;
        expect(dateTxt(t.date)).toBe("Mercoledì 21 ott, dalle 17");
        t.date.time = 17 * 60 + 30;
        expect(dateTxt(t.date)).toBe("Mercoledì 21 ott, dalle 17:30");
        Object.assign(t.date, { k: "period", from: D(19), to: D(25), time: null });
        expect(dateTxt(t.date)).toBe("Dal 19 al 25 ott");
        Object.assign(t.date, { from: D(8), to: D(11) });
        expect(dateTxt(t.date)).toBe("Dall'8 all'11 ott");
        Object.assign(t.date, { from: D(28), to: dayNum(2026, 10, 2) });
        expect(dateTxt(t.date)).toBe("Dal 28 ott al 2 nov");
        Object.assign(t.date, { k: "week", days: [4, 2] });
        expect(dateTxt(t.date)).toBe("Ogni mercoledì e venerdì");
        t.date.days = [];
        expect(dateTxt(t.date)).toBe("Ogni settimana");
    });

    it("il pulsante segue i piatti e il piano", () => {
        const t = evid();
        expect(btnOk(t, "prenota", false)).toBe(false);
        expect(btnOk(t, "prenota", true)).toBe(true);
        expect(btnOk(t, "vedi", true)).toBe(false);
        expect(btnOk(t, "ordine", true)).toBe(false);
        t.evType = "promo";
        t.dishes = ["a"];
        expect(btnOk(t, "vedi", true)).toBe(true);
        expect(btnName(t, "vedi")).toBe("Vedi il piatto");
        t.dishes = ["a", "b"];
        expect(btnName(t, "vedi")).toBe("Vedi i prodotti");
        expect(btnOk(t, "ordine", true)).toBe(false);
        t.evType = "bundle";
        expect(btnOk(t, "ordine", true)).toBe(false);
        t.bundle = "35";
        expect(btnOk(t, "ordine", true)).toBe(true);
        // tolti i piatti, la scelta cade da sola
        t.btn = "ordine";
        expect(effBtn(t)).toBe("ordine");
        t.evType = null;
        expect(effBtn(t)).toBe("");
        expect(btnName(t)).toBe("Nessun pulsante");
    });

    it("il riassunto del passo dice la data e il pulsante", () => {
        const t = evid(x => Object.assign(x.date, { k: "day", day: D(21) }));
        const L = { products: new Map() } as never;
        expect(stepSummary(t, "contenuto", L, () => "")).toBe("Karaoke · Mercoledì 21 ott · senza pulsante");
        t.btn = "prenota";
        expect(stepSummary(t, "contenuto", L, () => "")).toBe("Karaoke · Mercoledì 21 ott · pulsante «Prenota con CataloGlobe»");
        NEW_MODEL.evid = false;
        expect(stepSummary(evid(), "contenuto", L, () => "")).toBe("Karaoke");
    });

    it("un periodo che finisce prima di cominciare non passa", () => {
        const t = evid(x => Object.assign(x.date, { k: "period", from: D(25), to: D(19) }));
        expect(blocker(t, "contenuto", { owner: true, multi: false })).toBe("La fine del periodo viene prima dell'inizio");
    });

    it("la prima volta al «Quando»: fino al giorno del contenuto (punto 14)", () => {
        const t = evid(x => Object.assign(x.date, { k: "day", day: D(21) }));
        presetQuando(t, D(14));
        expect(t.qmode).toBe("momenti");
        expect(t.when).toEqual({ period: { from: D(14), to: D(21) } });
        expect(qautoNote(t)).toBe("Fino al 21 ott, il giorno del contenuto: puoi cambiarlo.");
        // cambiata la fine, la nota se ne va; e non si riscrive una seconda volta
        t.when.period!.to = D(30);
        expect(qautoNote(t)).toBe("");
        presetQuando(t, D(14));
        expect(t.when.period!.to).toBe(D(30));
    });

    it("il periodo prende la sua fine; l'8 e l'11 si elidono", () => {
        const t = evid(x => Object.assign(x.date, { k: "period", from: D(5), to: D(11) }));
        presetQuando(t, D(1));
        expect(t.when.period).toEqual({ from: D(1), to: D(11) });
        expect(qautoNote(t)).toBe("Fino all'11 ott, il giorno del contenuto: puoi cambiarlo.");
    });

    it("niente da fare: senza data, ogni settimana, giorno passato, in modifica", () => {
        for (const fn of [
            (x: Tunnel) => void x,
            (x: Tunnel) => void (x.date.k = "week"),
            (x: Tunnel) => void Object.assign(x.date, { k: "day", day: D(10) })
        ]) {
            const t = evid(fn);
            presetQuando(t, D(14));
            expect(t.qmode).toBe("sempre");
            expect(t.qauto).toBeNull();
            expect(t.qset).toBe(true);
        }
    });

    it("aspetta il database nuovo, poi scrive le colonne", () => {
        const t = evid();
        expect(evidWait(t)).toBe("");
        expect(evidColumns(t)).toEqual({});
        t.btn = "prenota";
        expect(evidWait(t)).toBe("«Il pulsante»: si salva col database nuovo");
        Object.assign(t.date, { k: "week", days: [6, 0], time: 17 * 60 + 30 });
        expect(evidWait(t)).toBe("«Quando succede»: si salva col database nuovo");
        DB.ready = true;
        expect(evidWait(t)).toBe("");
        // 0 = domenica, come nelle regole
        expect(evidColumns(t)).toEqual({
            shown_date_kind: "weekly",
            shown_date_from: null,
            shown_date_to: null,
            shown_weekdays: [0, 1],
            shown_time_from: "17:30:00",
            shown_time_to: null,
            cta_text: "Prenota un tavolo",
            cta_url: null,
            cta_action: "reservation"
        });
        Object.assign(t.date, { k: "period", from: D(19), to: D(25), time: null });
        t.btn = "";
        expect(evidColumns(t)).toMatchObject({ shown_date_kind: "period", shown_date_from: "2026-10-19", shown_date_to: "2026-10-25", shown_weekdays: null, shown_time_from: null, cta_action: "none" });
        // il link libero di prima resta un link
        t.cta = true;
        expect(evidColumns(t).cta_action).toBe("link");
        expect(evidColumns(t)).not.toHaveProperty("cta_text");
    });

    it("rilegge ciò che ha scritto", () => {
        const t = evid();
        t.cta = true;
        readEvid(t, { shown_date_kind: "weekly", shown_weekdays: [0, 3], shown_time_from: "20:15:00", cta_action: "reservation" });
        expect(t.date).toMatchObject({ k: "week", days: [2, 6], time: 20 * 60 + 15 });
        expect(t.btn).toBe("prenota");
        expect(t.cta).toBe(false);
        const p = evid();
        readEvid(p, { shown_date_kind: "period", shown_date_from: "2026-10-19", shown_date_to: "2026-10-25", cta_action: "none" });
        expect(p.date).toMatchObject({ k: "period", from: D(19), to: D(25), time: null });
        expect(p.btn).toBe("");
    });

    it("spento, non tocca niente", () => {
        NEW_MODEL.evid = false;
        const t = evid(x => Object.assign(x.date, { k: "day", day: D(21) }));
        presetQuando(t, D(14));
        expect(t.qmode).toBe("sempre");
        expect(evidWait(t)).toBe("");
    });
});
