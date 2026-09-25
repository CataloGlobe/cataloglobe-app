/**
 * Ciclo della scheda animata dell'hero (SPEC §6), logica pura.
 *
 * Cinque momenti da 12 tick (380 ms l'uno, ≈4,5 s a momento). Ogni momento
 * porta la scheda da una fascia (`from`) a un'altra (`to`):
 * - cambio di fascia (`from !== to`): barra, titolo, piatti e sfondo cambiano
 *   nello stesso tick;
 * - modifica dal telefono (`from === to`): la barra cambia al tick 0, la riga
 *   al tick 1 (≈380 ms dopo).
 * Stessa logica di `heroVals()` nelle tavole C.
 */

export const HERO_TICK_MS = 380;
export const HERO_TICKS_PER_BEAT = 12;
export const HERO_BEATS = 5;
export const HERO_CYCLE_TICKS = HERO_TICKS_PER_BEAT * HERO_BEATS;

/** 0 pranzo · 1 aperitivo · 2 cena */
export type Fascia = 0 | 1 | 2;

const BEAT_FASCE: { from: Fascia; to: Fascia }[] = [
    { from: 2, to: 0 }, // 12:00, parte il pranzo
    { from: 0, to: 0 }, // prezzo aggiornato
    { from: 0, to: 1 }, // 18:00, parte l'aperitivo
    { from: 1, to: 1 }, // esaurito
    { from: 1, to: 2 } // 20:00, parte la cena
];

/** Tick fermo con `prefers-reduced-motion`: il momento «Esaurito», già applicato. */
export const HERO_REDUCED_TICK = 3 * HERO_TICKS_PER_BEAT + 5;

export type HeroFrame = {
    beat: number;
    fascia: Fascia;
    /** Riga 2 del pranzo: prezzo alzato di 1 €. */
    raisedRow: number | null;
    /** Riga 4 dell'aperitivo: esaurita. */
    soldOutRow: number | null;
};

export function heroFrame(tick: number): HeroFrame {
    const beat = Math.floor(tick / HERO_TICKS_PER_BEAT) % HERO_BEATS;
    const { from, to } = BEAT_FASCE[beat];
    const applied = from !== to || tick % HERO_TICKS_PER_BEAT >= 1;
    const fascia = applied ? to : from;
    return {
        beat,
        fascia,
        raisedRow: fascia === 0 && beat === 1 && applied ? 1 : null,
        soldOutRow: fascia === 1 && beat === 3 && applied ? 3 : null
    };
}

/**
 * Tick di partenza: il cambio di fascia dell'orario del visitatore.
 * Pranzo fino alle 15, aperitivo fino alle 20, poi cena (anche di notte).
 */
export function startTickForHour(hour: number): number {
    const beat = hour >= 5 && hour < 15 ? 0 : hour >= 15 && hour < 20 ? 2 : 4;
    return beat * HERO_TICKS_PER_BEAT;
}
