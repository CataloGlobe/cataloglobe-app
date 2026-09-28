/**
 * Sequenza dell'hero (telefono + programmazione di oggi), logica pura.
 *
 * Cinque passi, uno ogni 2,3 s, il primo a 150 ms; dopo l'ultimo 1,5 s di
 * pausa sulla giornata finita, poi si riparte da capo (giro di 13 s):
 * 12:00 Menù Pranzo → 13:10 modifica al volo (Insalata di mare 17 €) →
 * 18:00 Menù Aperitivo → 19:25 modifica al volo (Bruschette esaurite) →
 * 20:00 Menù Cena.
 *
 * `heroEvents()` dà gli eventi di un giro con il loro istante, `heroReducer`
 * li applica allo stato. Il componente (HeroStage.tsx) li programma coi timer
 * e li mette in pausa fuori schermo.
 */

export type Fascia = 0 | 1 | 2;

/** Un passo ogni 2,3 s. */
export const HERO_STEP_MS = 2300;
/** Il primo stato arriva quasi subito. */
export const HERO_START_MS = 150;
/** Pausa sulla giornata finita, prima di ripartire. */
export const HERO_END_PAUSE_MS = 1500;
/** Uscita di ora, nome del menù e contenuto (HeroStage.module.scss: 160 ms di transizione). */
export const HERO_SWAP_MS = 170;
/** Programmazione: la fascia si accende 150 ms dopo l'ora, il telefono cambia menù a 450. */
export const HERO_SLOT_MS = 150;
export const HERO_MENU_MS = 450;
/** Modifica al volo: entra in lista a 100 ms, la linea la raggiunge a +450, il telefono a +650. */
export const HERO_LIVE_MS = 100;
export const HERO_FILL_MS = 450;
export const HERO_APPLY_MS = 650;

type Step = { kind: "slot"; slot: Fascia; clock: string } | { kind: "live"; live: 0 | 1; clock: string };

export const HERO_STEPS: readonly Step[] = [
    { kind: "slot", slot: 0, clock: "12:00" },
    { kind: "live", live: 0, clock: "13:10" },
    { kind: "slot", slot: 1, clock: "18:00" },
    { kind: "live", live: 1, clock: "19:25" },
    { kind: "slot", slot: 2, clock: "20:00" }
];

/** Durata di un giro: i passi più la pausa finale. */
export const HERO_LOOP_MS = HERO_STEPS.length * HERO_STEP_MS + HERO_END_PAUSE_MS;

export type HeroEvent =
    | { type: "clockOut" }
    | { type: "clock"; clock: string }
    | { type: "slot"; slot: Fascia }
    | { type: "menuOut" }
    | { type: "menu"; menu: Fascia }
    | { type: "live"; live: 0 | 1 }
    | { type: "fill" }
    | { type: "apply" }
    | { type: "reset" };

export type HeroState = {
    /** Ora in barra di stato; `clockOut` mentre la vecchia sparisce. */
    clock: string;
    clockOut: boolean;
    /** Fascia programmata in corso (-1 prima delle 12:00). */
    slot: Fascia | -1;
    /** Modifiche al volo entrate in lista (0, 1, 2), in ordine. */
    lives: number;
    /** Modifiche al volo raggiunte dalla linea viola (arriva dopo l'ingresso della riga). */
    filled: number;
    /** Ultimo evento della giornata, per la riga di stato della versione orizzontale. */
    last: { kind: "slot"; slot: Fascia } | { kind: "live"; live: 0 | 1 } | null;
    /** Menù nel telefono; `menuOut` mentre il vecchio esce. */
    menu: Fascia;
    menuOut: boolean;
    /** Modifiche al volo applicate al telefono (0, 1, 2). */
    applied: number;
};

export function heroInitialState(startClock: string): HeroState {
    return { clock: startClock, clockOut: false, slot: -1, lives: 0, filled: 0, last: null, menu: 0, menuOut: false, applied: 0 };
}

/** Stato fermo con `prefers-reduced-motion`: Aperitivo, Bruschette esaurite. */
export function heroReducedState(startClock: string): HeroState {
    return {
        ...heroInitialState(startClock),
        clock: "19:25",
        slot: 1,
        lives: 2,
        filled: 2,
        last: { kind: "live", live: 1 },
        menu: 1,
        applied: 2
    };
}

/** Gli eventi di un giro, in ordine di tempo (ms dall'inizio del giro). */
export function heroEvents(): { at: number; event: HeroEvent }[] {
    const out: { at: number; event: HeroEvent }[] = [];
    HERO_STEPS.forEach((step, i) => {
        const t0 = HERO_START_MS + i * HERO_STEP_MS;
        out.push({ at: t0, event: { type: "clockOut" } });
        out.push({ at: t0 + HERO_SWAP_MS, event: { type: "clock", clock: step.clock } });
        if (step.kind === "slot") {
            out.push({ at: t0 + HERO_SLOT_MS, event: { type: "slot", slot: step.slot } });
            out.push({ at: t0 + HERO_MENU_MS, event: { type: "menuOut" } });
            out.push({ at: t0 + HERO_MENU_MS + HERO_SWAP_MS, event: { type: "menu", menu: step.slot } });
        } else {
            const t = t0 + HERO_LIVE_MS;
            out.push({ at: t, event: { type: "live", live: step.live } });
            out.push({ at: t + HERO_FILL_MS, event: { type: "fill" } });
            out.push({ at: t + HERO_APPLY_MS, event: { type: "apply" } });
        }
    });
    return out.sort((a, b) => a.at - b.at);
}

export function heroReducer(state: HeroState, event: HeroEvent, startClock: string): HeroState {
    switch (event.type) {
        case "clockOut":
            return { ...state, clockOut: true };
        case "clock":
            return { ...state, clock: event.clock, clockOut: false };
        case "slot":
            return { ...state, slot: event.slot, last: { kind: "slot", slot: event.slot } };
        case "menuOut":
            // Stesso menù (il pranzo alle 12:00, già in vista): niente uscita.
            return state.menu === state.slot ? state : { ...state, menuOut: true };
        case "menu":
            return state.menu === event.menu ? { ...state, menuOut: false } : { ...state, menu: event.menu, menuOut: false };
        case "live":
            return { ...state, lives: event.live + 1, last: { kind: "live", live: event.live } };
        case "fill":
            return { ...state, filled: state.lives };
        case "apply":
            return { ...state, applied: state.lives };
        case "reset":
            return heroInitialState(startClock);
    }
}

/**
 * Programmazione verticale (desktop): righe nell'ordine della giornata, le
 * modifiche al volo subito dopo la fascia in cui avvengono.
 */
export type TimelineRow = { kind: "slot"; slot: Fascia } | { kind: "live"; live: 0 | 1 };

export function timelineRows(lives: number): TimelineRow[] {
    const rows: TimelineRow[] = [{ kind: "slot", slot: 0 }];
    if (lives >= 1) rows.push({ kind: "live", live: 0 });
    rows.push({ kind: "slot", slot: 1 });
    if (lives >= 2) rows.push({ kind: "live", live: 1 });
    rows.push({ kind: "slot", slot: 2 });
    return rows;
}

/** Altezze delle righe (HeroStage.module.scss): fascia 44, modifica al volo 50. */
export const TIMELINE_SLOT_H = 44;
export const TIMELINE_LIVE_H = 50;

/**
 * Altezza della linea viola: dal centro della prima riga al centro
 * dell'ultima accesa (fascia in corso o modifica al volo già raggiunta).
 */
export function timelineFill(state: Pick<HeroState, "slot" | "lives" | "filled">): number {
    const rows = timelineRows(state.lives);
    let y = 0;
    let fill = 0;
    for (const row of rows) {
        const h = row.kind === "slot" ? TIMELINE_SLOT_H : TIMELINE_LIVE_H;
        const on = row.kind === "slot" ? row.slot === state.slot : row.live < state.filled;
        if (on) fill = y + h / 2 - TIMELINE_SLOT_H / 2;
        y += h;
    }
    return Math.max(0, fill);
}

/**
 * Versione orizzontale: posizione (%) di un'ora sulla linea. Le tre fasce
 * stanno a 0 / 60 / 100 %: 12→18 occupa il 60 %, 18→20 il resto.
 */
export function trackPosition(time: string): number {
    const [h, m] = time.split(":").map(Number);
    const v = h + m / 60;
    return v <= 18 ? ((v - 12) / 6) * 60 : 60 + ((v - 18) / 2) * 40;
}
