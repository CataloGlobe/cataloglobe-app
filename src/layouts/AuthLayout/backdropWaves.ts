/**
 * Logica dello sfondo delle pagine di accesso («respiro QR», scelto da Lorenzo
 * il 2026-10-09): una tela di punti; ogni tanto un'onda parte dal centro e dove
 * passa una parte dei punti diventa per un attimo un quadratino, come i moduli
 * di un QR. Qui solo i conti, senza canvas, così si provano con vitest.
 */

/** Ogni quanto parte un'onda dal centro, in ms. */
export const WAVE_PERIOD = 3500;
/** Quanto vive un'onda, in ms. */
export const WAVE_LIFE = 5000;
/** Senza interazioni per questo tempo (e col focus fuori dalla scheda) lo sfondo riparte. */
export const WAKE_AFTER = 10000;

export type Wave = {
    /** Centro, in frazioni della tela (0-1): resta giusto se la finestra cambia misura. */
    fx: number;
    fy: number;
    start: number;
    /** Ogni onda ha il suo disegno di moduli. */
    seed: number;
};

/** Numero pseudo-casuale stabile per una cella e un'onda, tra 0 e 1. */
export function hash(i: number, j: number): number {
    const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return v - Math.floor(v);
}

/** La cella (i, j) diventa un modulo quando l'onda `seed` ci passa sopra? Circa il 45%. */
export function isModule(i: number, j: number, seed: number): boolean {
    return hash(i + seed * 37, j - seed * 11) > 0.55;
}

/**
 * Quanto l'onda tocca un punto a distanza `dist` dal suo centro, tra 0 e 1.
 * L'onda rallenta allontanandosi e si spegne con l'età.
 */
export function waveStrength(dist: number, age: number, reach: number): number {
    if (age < 0 || age >= WAVE_LIFE) return 0;
    const q = age / WAVE_LIFE;
    const radius = reach * (1 - Math.pow(1 - q, 2.2));
    const off = (dist - radius) / 75;
    return Math.exp(-off * off) * Math.pow(1 - q, 1.3);
}

/**
 * Stato condiviso tra un montaggio e l'altro: ogni pagina di accesso monta il suo
 * layout, e così passando da Accedi a Registrati l'onda continua invece di ripartire.
 */
export type BackdropState = {
    waves: Wave[];
    nextWaveAt: number;
    seed: number;
    calm: boolean;
    lastInteraction: number;
};

export function createBackdropState(): BackdropState {
    return { waves: [], nextWaveAt: 0, seed: 0, calm: false, lastInteraction: 0 };
}

/** Un passo del tempo: fa partire l'onda del centro se è ora e toglie quelle finite. */
export function tick(state: BackdropState, now: number): void {
    if (!state.calm && now >= state.nextWaveAt) {
        state.seed += 1;
        state.waves.push({ fx: 0.5, fy: 0.5, start: now, seed: state.seed });
        state.nextWaveAt = now + WAVE_PERIOD;
    }
    state.waves = state.waves.filter((w) => now - w.start < WAVE_LIFE);
}

/** L'utente scrive o clicca nella scheda: niente onde nuove, quelle in corso finiscono. */
export function calmDown(state: BackdropState, now: number): void {
    state.calm = true;
    state.lastInteraction = now;
}

/** Riparte se è calmo da abbastanza e il focus non è nella scheda. */
export function shouldWake(state: BackdropState, now: number, focusInCard: boolean): boolean {
    return state.calm && !focusInCard && now - state.lastInteraction >= WAKE_AFTER;
}

export function wake(state: BackdropState, now: number): void {
    state.calm = false;
    state.nextWaveAt = Math.max(state.nextWaveAt, now);
}

/** Un'onda dal punto cliccato sullo sfondo. */
export function pulseAt(state: BackdropState, fx: number, fy: number, now: number): void {
    state.seed += 1;
    state.waves.push({ fx, fy, start: now, seed: state.seed });
}

/** Lo stato vero, unico per tutta l'app. */
export const backdrop = createBackdropState();
let kick: (() => void) | null = null;

/** Il canvas montato si registra qui, per ripartire quando arriva un'onda nuova. */
export function setBackdropKick(fn: (() => void) | null): void {
    kick = fn;
}

/** La scheda è stata usata (tasto, incolla, clic): lo sfondo si calma. */
export function calmAuthBackdrop(): void {
    calmDown(backdrop, performance.now());
}

/** Clic sullo sfondo, in coordinate della finestra: parte un'onda da lì. */
export function pulseAuthBackdrop(clientX: number, clientY: number): void {
    pulseAt(backdrop, clientX / window.innerWidth, clientY / window.innerHeight, performance.now());
    kick?.();
}
