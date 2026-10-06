import { describe, expect, it } from "vitest";
import {
    HIDE_AFTER_PX,
    HIDE_AFTER_REVEAL_PX,
    initialBarState,
    lockRemaining,
    resyncScroll,
    revealBar,
    stepScroll,
    TOP_ZONE_PX,
    TRANSITION_LOCK_MS,
    type BarVisibilityState,
} from "@/components/PublicCollectionView/hooks/bottomBarVisibility";

const MAX = 5000;
// Passo di tempo tra un evento e l'altro: oltre l'isteresi, salvo dove il test
// la mette alla prova.
const STEP_MS = TRANSITION_LOCK_MS + 1;

type Run = { s: BarVisibilityState; t: number };

function scrollThrough(run: Run, ys: number[], dt = STEP_MS, maxY = MAX): Run {
    return ys.reduce(({ s, t }, y) => ({ s: stepScroll(s, y, maxY, t + dt), t: t + dt }), run);
}

const start = (): Run => ({ s: initialBarState(), t: 0 });
const hiddenAt800 = () => scrollThrough(start(), [TOP_ZONE_PX, 400, 800]);

describe("bottomBarVisibility", () => {
    it("resta visibile entro la zona in cima, anche scorrendo giù", () => {
        const { s } = scrollThrough(start(), [20, 60, 100, TOP_ZONE_PX]);
        expect(s.hidden).toBe(false);
    });

    it("si nasconde oltre la zona in cima dopo 6px cumulativi", () => {
        let r = scrollThrough(start(), [TOP_ZONE_PX, 123]);
        expect(r.s.hidden).toBe(false);
        r = scrollThrough(r, [126]);
        expect(r.s.hidden).toBe(true);
    });

    it("ricompare dopo 12px cumulativi verso l'alto, non prima", () => {
        let r = hiddenAt800();
        expect(r.s.hidden).toBe(true);
        r = scrollThrough(r, [795, 790]);
        expect(r.s.hidden).toBe(true);
        r = scrollThrough(r, [788]);
        expect(r.s.hidden).toBe(false);
    });

    it("un'inversione azzera l'accumulo opposto", () => {
        const { s } = scrollThrough(hiddenAt800(), [792, 796, 788]);
        expect(s.hidden).toBe(true);
    });

    it("torna visibile entro la zona in cima", () => {
        const { s } = scrollThrough(hiddenAt800(), [100]);
        expect(s.hidden).toBe(false);
    });

    it("torna visibile a fine pagina", () => {
        let r = scrollThrough(hiddenAt800(), [MAX - 1]);
        expect(r.s.hidden).toBe(false);
        r = scrollThrough(r, [MAX]);
        expect(r.s.hidden).toBe(false);
    });

    it("dopo una ricomparsa da scroll su servono 80px giù per nasconderla", () => {
        let r = scrollThrough(hiddenAt800(), [780]);
        expect(r.s.hidden).toBe(false);
        r = scrollThrough(r, [780 + HIDE_AFTER_REVEAL_PX - 1]);
        expect(r.s.hidden).toBe(false);
        r = scrollThrough(r, [780 + HIDE_AFTER_REVEAL_PX]);
        expect(r.s.hidden).toBe(true);
    });

    it("dopo revealBar (carrello, sheet) servono 80px giù per nasconderla", () => {
        let r = hiddenAt800();
        r = { s: revealBar(r.s, r.t + 1), t: r.t + 1 };
        expect(r.s.hidden).toBe(false);
        r = scrollThrough(r, [800 + HIDE_AFTER_REVEAL_PX - 1]);
        expect(r.s.hidden).toBe(false);
        r = scrollThrough(r, [800 + HIDE_AFTER_REVEAL_PX]);
        expect(r.s.hidden).toBe(true);
        // nascosta, la soglia torna corta (vale per lo scroll giù dal prossimo ingresso)
        expect(r.s.hideAfter).toBe(HIDE_AFTER_PX);
    });

    it("isteresi: nessun cambio opposto entro 300ms, poi si applica", () => {
        // Nascosta all'istante t, poi 20px su a t + 100: resta nascosta.
        let r = scrollThrough(start(), [TOP_ZONE_PX, 400]);
        expect(r.s.hidden).toBe(true);
        r = scrollThrough(r, [380], 100);
        expect(r.s.hidden).toBe(true);
        expect(lockRemaining(r.s, r.t)).toBeGreaterThan(0);
        // Stessa posizione a fine isteresi: il cambio in sospeso si applica.
        r = scrollThrough(r, [380], TRANSITION_LOCK_MS);
        expect(r.s.hidden).toBe(false);
        // Appena ricomparsa: anche 200px giù entro 300ms non la nascondono.
        r = scrollThrough(r, [580], 50);
        expect(r.s.hidden).toBe(false);
    });

    it("isteresi anche sulla cima: si mostra solo a isteresi finita", () => {
        let r = scrollThrough(start(), [TOP_ZONE_PX, 400]);
        r = scrollThrough(r, [50], 100);
        expect(r.s.hidden).toBe(true);
        r = scrollThrough(r, [50], TRANSITION_LOCK_MS);
        expect(r.s.hidden).toBe(false);
    });

    it("il resync non cambia stato e non produce un delta spurio", () => {
        let r = hiddenAt800();
        r = { s: resyncScroll(r.s, 2000), t: r.t };
        expect(r.s.hidden).toBe(true);
        r = scrollThrough(r, [1995]);
        expect(r.s.hidden).toBe(true);
    });

    it("rimbalzo iOS: delta sopra la cima e oltre la fine ignorati", () => {
        let r = hiddenAt800();
        const before = r.s;
        r = scrollThrough(r, [-40]);
        expect(r.s).toBe(before);
        r = scrollThrough(scrollThrough(start(), [TOP_ZONE_PX, 400, MAX]), [MAX + 60, MAX + 20]);
        expect(r.s.hidden).toBe(false);
        expect(r.s.lastY).toBe(MAX);
    });
});
