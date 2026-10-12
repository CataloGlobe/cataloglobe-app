/**
 * Ciclo dell'animazione import (§6 Import), logica pura.
 * 45 tick da 200 ms (9 s): 0-2 foglio storto sul tavolo · 3-6 mirino ·
 * 7 scatto · 8 lampo (il foglio entra nella scheda) · 11 il foglio si
 * raddrizza, a lampo finito · 13-28 lettura, un piatto ogni 4 tick (riquadro,
 * poi il nome vola nella scheda, poi la riga) · 30 pronto (pulsante che si
 * accende) · pausa fino a 44.
 */
export const IMPORT_TICK_MS = 200;
export const IMPORT_TICKS = 45;
/** Tick fermo (reduced-motion): risultato pronto. Il ciclo parte da 0. */
export const IMPORT_READY_TICK = 40;

const SHOT_TICK = 8;
const STRAIGHT_TICK = 11;
const READ_START = 13;
const READ_STEP = 4;
/** Tick dopo il riquadro in cui il nome parte dal foglio, e in cui la riga arriva. */
const FLY_AFTER = 1;
const ROW_AFTER = 3;
const READY_TICK = 30;
const DISHES = 4;

export type ImportPhase = "photo" | "reading" | "ready";

export type ImportFrame = {
    phase: ImportPhase;
    finderOn: boolean;
    /** Pulsante di scatto premuto. */
    press: boolean;
    flash: boolean;
    /** Miniatura della foto nella scheda. */
    thumb: boolean;
    straight: boolean;
    /** Piatti con il riquadro di lettura sul foglio (0-4). */
    lit: number;
    /** Righe arrivate nella scheda (0-4). */
    rows: number;
    /** Piatto il cui nome parte in volo dal foglio verso la scheda, in questo tick. */
    fly: number | null;
    ready: boolean;
    /** Tick in cui il pulsante «Controlla e pubblica» si accende (piccolo rimbalzo). */
    pop: boolean;
};

const countFrom = (tick: number, offset: number) =>
    tick < READ_START + offset ? 0 : Math.min(DISHES, Math.floor((tick - READ_START - offset) / READ_STEP) + 1);

export function importFrame(tick: number): ImportFrame {
    const since = tick - READ_START - FLY_AFTER;
    const ready = tick >= READY_TICK;
    return {
        phase: ready ? "ready" : tick >= SHOT_TICK ? "reading" : "photo",
        finderOn: tick >= 3 && tick < SHOT_TICK,
        press: tick === SHOT_TICK - 1,
        flash: tick === SHOT_TICK,
        thumb: tick >= SHOT_TICK,
        straight: tick >= STRAIGHT_TICK,
        lit: countFrom(tick, 0),
        rows: countFrom(tick, ROW_AFTER),
        fly: since >= 0 && since % READ_STEP === 0 && since / READ_STEP < DISHES ? since / READ_STEP : null,
        ready,
        pop: tick === READY_TICK
    };
}
