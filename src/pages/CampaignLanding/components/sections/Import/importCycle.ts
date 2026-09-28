/**
 * Ciclo dell'animazione import (SPEC §7, §6 Import), logica pura.
 * 23 tick da 260 ms (≈6 s): 0 reset · 1 mirino · 2 lampo · 3-10 lettura
 * (un piatto ogni 2 tick) · 11 fine scansione · 12+ pronto (12: pulsante che
 * si accende) · pausa fino a 22. Stessa logica della classe `Component` delle tavole C.
 */
export const IMPORT_TICK_MS = 260;
export const IMPORT_TICKS = 23;
/** Tick fermo (reduced-motion): risultato pronto. Il ciclo parte da 0. */
export const IMPORT_READY_TICK = 18;

/** Posizione della linea di scansione su ogni piatto, in % dell'altezza del foglio. */
const DISH_Y = [26, 37, 47, 59];

export type ImportFrame = {
    /** Piatti letti (0-4). */
    read: number;
    /** Piatto evidenziato sul foglio: quelli letti, finché la scansione è in corso. */
    highlight: boolean;
    scanY: number;
    scanOn: boolean;
    frameOn: boolean;
    flash: boolean;
    ready: boolean;
    /** Tick in cui il pulsante «Controlla e pubblica» si accende (piccolo rimbalzo). */
    pop: boolean;
};

export function importFrame(tick: number): ImportFrame {
    const read = tick < 4 ? 0 : Math.min(4, Math.floor((tick - 4) / 2) + 1);
    return {
        read,
        highlight: tick < 12,
        scanY: tick < 4 ? 12 : tick < 11 ? DISH_Y[Math.min(3, read - 1)] : 100,
        scanOn: tick >= 3 && tick <= 11,
        frameOn: tick >= 1 && tick <= 10,
        flash: tick === 2,
        ready: tick >= 12,
        pop: tick === 12
    };
}
