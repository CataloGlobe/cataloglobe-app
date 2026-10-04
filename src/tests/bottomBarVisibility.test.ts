import { describe, expect, it } from "vitest";
import {
    HIDE_AFTER_CART_PX,
    initialBarState,
    resyncScroll,
    revealBar,
    stepScroll,
    TOP_ZONE_PX,
    type BarVisibilityState,
} from "@/components/PublicCollectionView/hooks/bottomBarVisibility";

const MAX = 5000;

function scrollThrough(state: BarVisibilityState, ys: number[], maxY = MAX) {
    return ys.reduce((s, y) => stepScroll(s, y, maxY), state);
}

describe("bottomBarVisibility", () => {
    it("resta visibile entro la zona in cima, anche scorrendo giù", () => {
        const s = scrollThrough(initialBarState(), [20, 60, 100, TOP_ZONE_PX]);
        expect(s.hidden).toBe(false);
    });

    it("si nasconde oltre la zona in cima dopo 6px cumulativi", () => {
        let s = scrollThrough(initialBarState(), [TOP_ZONE_PX, 123]);
        expect(s.hidden).toBe(false);
        s = stepScroll(s, 126, MAX);
        expect(s.hidden).toBe(true);
    });

    it("ricompare dopo 12px cumulativi verso l'alto, non prima", () => {
        let s = scrollThrough(initialBarState(), [TOP_ZONE_PX, 400, 800]);
        expect(s.hidden).toBe(true);
        s = scrollThrough(s, [795, 790]);
        expect(s.hidden).toBe(true);
        s = stepScroll(s, 788, MAX);
        expect(s.hidden).toBe(false);
    });

    it("un'inversione azzera l'accumulo opposto", () => {
        let s = scrollThrough(initialBarState(), [TOP_ZONE_PX, 400, 800]);
        s = scrollThrough(s, [792, 796, 788]);
        expect(s.hidden).toBe(true);
    });

    it("torna visibile entro la zona in cima", () => {
        let s = scrollThrough(initialBarState(), [TOP_ZONE_PX, 400, 800]);
        s = stepScroll(s, 100, MAX);
        expect(s.hidden).toBe(false);
    });

    it("torna visibile a fine pagina", () => {
        let s = scrollThrough(initialBarState(), [TOP_ZONE_PX, 400, 800]);
        s = stepScroll(s, MAX - 1, MAX);
        expect(s.hidden).toBe(false);
        s = stepScroll(s, MAX, MAX);
        expect(s.hidden).toBe(false);
    });

    it("dopo l'aggiunta al carrello servono 80px giù per nasconderla", () => {
        let s = scrollThrough(initialBarState(), [TOP_ZONE_PX, 400, 800]);
        s = revealBar(s, true);
        expect(s.hidden).toBe(false);
        s = stepScroll(s, 800 + HIDE_AFTER_CART_PX - 1, MAX);
        expect(s.hidden).toBe(false);
        s = stepScroll(s, 800 + HIDE_AFTER_CART_PX, MAX);
        expect(s.hidden).toBe(true);
        // la soglia lunga vale una volta sola
        s = stepScroll(s, 860, MAX);
        expect(s.hidden).toBe(false);
        s = stepScroll(s, 865, MAX);
        expect(s.hidden).toBe(false);
        s = stepScroll(s, 866, MAX);
        expect(s.hidden).toBe(true);
    });

    it("il resync non cambia stato e non produce un delta spurio", () => {
        let s = scrollThrough(initialBarState(), [TOP_ZONE_PX, 400, 800]);
        s = resyncScroll(s, 2000);
        expect(s.hidden).toBe(true);
        s = stepScroll(s, 1995, MAX);
        expect(s.hidden).toBe(true);
    });

    it("rubber-band negativo vale come cima", () => {
        let s = scrollThrough(initialBarState(), [TOP_ZONE_PX, 400, 800]);
        s = stepScroll(s, -40, MAX);
        expect(s.hidden).toBe(false);
    });
});
