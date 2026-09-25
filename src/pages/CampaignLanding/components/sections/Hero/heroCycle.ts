/**
 * Ciclo della scheda animata dell'hero, logica pura.
 *
 * Cinque momenti con durate proprie (giro ≈ 11,4 s, continuo):
 * 12:00 pranzo 1,8 s → prezzo aggiornato 2,2 s → 18:00 aperitivo 2,6 s →
 * esaurito 2,2 s → 20:00 cena 2,6 s → di nuovo pranzo.
 * - cambio di fascia (pranzo/aperitivo/cena): striscia e blocco menù escono
 *   ed entrano insieme;
 * - modifica dal telefono (prezzo, esaurito): cambia la striscia e solo la
 *   riga interessata, il blocco menù resta fermo.
 */

/** Durata di ogni momento, dall'inizio della sua uscita a quella del successivo. */
export const HERO_BEAT_MS = [1800, 2200, 2600, 2200, 2600] as const;
export const HERO_BEATS = HERO_BEAT_MS.length;

/** Uscita e ingresso di striscia e blocco menù (Hero.module.scss usa gli stessi valori). */
export const HERO_EXIT_MS = 160;

/**
 * Fine dell'ingresso dell'hero: la scheda entra per ultima (ritardo 560 ms +
 * 900 ms, Hero.module.scss). Il primo cambio arriva 1,8 s dopo.
 */
export const HERO_ENTRANCE_MS = 1460;
export const HERO_FIRST_CHANGE_MS = HERO_ENTRANCE_MS + 1800;

/** 0 pranzo · 1 aperitivo · 2 cena */
export type Fascia = 0 | 1 | 2;

const BEAT_FASCIA: readonly Fascia[] = [0, 0, 1, 1, 2];

/** Momento fermo con `prefers-reduced-motion`: «Esaurito», già applicato. */
export const HERO_REDUCED_BEAT = 3;

export type HeroFrame = {
    beat: number;
    fascia: Fascia;
    /** Riga 2 del pranzo: prezzo alzato di 1 €. */
    raisedRow: number | null;
    /** Riga 4 dell'aperitivo: esaurita. */
    soldOutRow: number | null;
};

const wrap = (beat: number) => ((beat % HERO_BEATS) + HERO_BEATS) % HERO_BEATS;

export function heroFrame(beat: number): HeroFrame {
    const b = wrap(beat);
    return {
        beat: b,
        fascia: BEAT_FASCIA[b],
        raisedRow: b === 1 ? 1 : null,
        soldOutRow: b === 3 ? 3 : null
    };
}

export const nextBeat = (beat: number) => wrap(beat + 1);

/** Il passaggio `from → from + 1` cambia fascia (esce anche il blocco menù). */
export const changesFascia = (from: number) => BEAT_FASCIA[wrap(from)] !== BEAT_FASCIA[nextBeat(from)];

/**
 * Momento di partenza: il cambio di fascia dell'orario del visitatore.
 * Pranzo fino alle 15, aperitivo fino alle 20, poi cena (anche di notte).
 */
export function startBeatForHour(hour: number): number {
    return hour >= 5 && hour < 15 ? 0 : hour >= 15 && hour < 20 ? 2 : 4;
}
