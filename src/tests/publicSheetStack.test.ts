import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CLOSED_SHEET,
    closeSheet,
    getSheetState,
    openSheet,
    popSheetPage,
    pushSheetPage,
    sheetReducer,
    subscribeSheet,
    type SheetPage
} from "@/components/PublicCollectionView/redesign/sheets/sheetStack";
import {
    DISMISS_DISTANCE_PX,
    EXIT_DURATION_MS,
    EXIT_MIN_DURATION_MS,
    exitDuration,
    shouldDismissOnRelease,
    trackOffsetPercent
} from "@/components/PublicCollectionView/redesign/sheets/sheetMotion";

const info: SheetPage = { key: "info", title: "Informazioni" };
const hours: SheetPage = { key: "hours", title: "Orari" };

afterEach(() => closeSheet());

describe("sheetReducer", () => {
    it("apre con una pagina sola", () => {
        expect(sheetReducer(CLOSED_SHEET, { type: "open", page: info })).toEqual({
            pages: [info],
            move: "open"
        });
    });

    it("un secondo open sostituisce la pila: mai un foglio sopra un altro", () => {
        const state = sheetReducer(
            sheetReducer(CLOSED_SHEET, { type: "open", page: info }),
            { type: "push", page: hours }
        );
        expect(sheetReducer(state, { type: "open", page: info }).pages).toEqual([info]);
    });

    it("push aggiunge in cima e dice che è una spinta", () => {
        const open = sheetReducer(CLOSED_SHEET, { type: "open", page: info });
        const next = sheetReducer(open, { type: "push", page: hours });
        expect(next.pages).toEqual([info, hours]);
        expect(next.move).toBe("push");
    });

    it("push della pagina già in cima non cambia lo stato", () => {
        const open = sheetReducer(CLOSED_SHEET, { type: "open", page: info });
        expect(sheetReducer(open, { type: "push", page: info })).toBe(open);
    });

    it("push di una chiave già in pila torna a quella pagina, senza doppioni", () => {
        const two = sheetReducer(
            sheetReducer(CLOSED_SHEET, { type: "open", page: info }),
            { type: "push", page: hours }
        );
        expect(sheetReducer(two, { type: "push", page: info })).toEqual({ pages: [info], move: "pop" });
    });

    it("push a foglio chiuso apre dritto sulla figlia", () => {
        expect(sheetReducer(CLOSED_SHEET, { type: "push", page: hours })).toEqual({
            pages: [hours],
            move: "open"
        });
    });

    it("pop torna alla madre; dall'ultima pagina chiude", () => {
        const two = sheetReducer(
            sheetReducer(CLOSED_SHEET, { type: "open", page: info }),
            { type: "push", page: hours }
        );
        const back = sheetReducer(two, { type: "pop" });
        expect(back).toEqual({ pages: [info], move: "pop" });
        expect(sheetReducer(back, { type: "pop" })).toBe(CLOSED_SHEET);
    });

    it("openAt apre già sulla figlia con la madre sotto: «‹» torna alla madre", () => {
        const at = sheetReducer(CLOSED_SHEET, { type: "openAt", pages: [info, hours] });
        expect(at).toEqual({ pages: [info, hours], move: "open" });
        expect(sheetReducer(at, { type: "pop" })).toEqual({ pages: [info], move: "pop" });
    });

    it("openAt senza pagine chiude, e da chiuso non cambia nulla", () => {
        const open = sheetReducer(CLOSED_SHEET, { type: "open", page: info });
        expect(sheetReducer(open, { type: "openAt", pages: [] })).toBe(CLOSED_SHEET);
        expect(sheetReducer(CLOSED_SHEET, { type: "openAt", pages: [] })).toBe(CLOSED_SHEET);
    });

    it("close svuota e da chiuso è un no-op", () => {
        const open = sheetReducer(CLOSED_SHEET, { type: "open", page: info });
        expect(sheetReducer(open, { type: "close" })).toBe(CLOSED_SHEET);
        expect(sheetReducer(CLOSED_SHEET, { type: "close" })).toBe(CLOSED_SHEET);
    });
});

describe("store", () => {
    it("avvisa chi ascolta a ogni cambio e non agli no-op", () => {
        const listener = vi.fn();
        const unsubscribe = subscribeSheet(listener);
        openSheet(info);
        pushSheetPage(hours);
        pushSheetPage(hours);
        popSheetPage();
        closeSheet();
        closeSheet();
        expect(listener).toHaveBeenCalledTimes(4);
        expect(getSheetState().pages).toHaveLength(0);
        unsubscribe();
    });
});

describe("sheetMotion", () => {
    it("chiude oltre la distanza o con un colpo veloce, mai verso l'alto", () => {
        expect(shouldDismissOnRelease(DISMISS_DISTANCE_PX, 0)).toBe(true);
        expect(shouldDismissOnRelease(DISMISS_DISTANCE_PX - 1, 0)).toBe(false);
        expect(shouldDismissOnRelease(30, 0.8)).toBe(true);
        expect(shouldDismissOnRelease(-50, 2)).toBe(false);
        expect(shouldDismissOnRelease(0, 2)).toBe(false);
    });

    it("la durata d'uscita segue la velocità entro i limiti", () => {
        expect(exitDuration(300, 0)).toBe(EXIT_DURATION_MS);
        expect(exitDuration(300, 10)).toBe(EXIT_MIN_DURATION_MS);
        expect(exitDuration(300, 1.5)).toBe(200);
        expect(exitDuration(300, 0.1)).toBe(EXIT_DURATION_MS);
    });

    it("sposta la pista di una pagina, in % della pista larga quanto tutte le pagine", () => {
        expect(trackOffsetPercent(0, 1)).toBe(-0);
        expect(trackOffsetPercent(1, 2)).toBe(-50);
        expect(trackOffsetPercent(3, 4)).toBe(-75);
        expect(trackOffsetPercent(-1, 2)).toBe(-0);
        expect(trackOffsetPercent(1, 0)).toBe(-100);
    });
});
