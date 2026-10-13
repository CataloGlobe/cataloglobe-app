/**
 * Invito al voto del redesign (spec §11, D38): quando arriva, cosa succede a ogni
 * gesto, cosa resta per il resto della visita. Puro, provato in
 * `src/tests/publicRedesign/voteInvite.test.ts`.
 */

/**
 * Il momento giusto (D76, 2026-10-13): non un tempo fisso ma la «seconda ripresa
 * del telefono». Chi legge il menu poi posa il telefono (ordina, aspetta, mangia);
 * quando lo riprende dopo una pausa lunga ha quasi sempre finito. Vale per tutti,
 * ordini al tavolo o no; al tavolo conta subito anche il conto chiesto.
 */
/** Pausa minima a pagina nascosta (telefono in tasca, altra app). */
export const AWAY_MS = 10 * 60_000;
/** Visita minima dalla prima apertura: chi ha appena ordinato non ha ancora mangiato. */
export const MIN_VISIT_MS = 25 * 60_000;
/** Con `?prova-voto=1`: tempi corti, per provarlo dal telefono. */
export const PROVA_AWAY_MS = 5_000;
export const PROVA_VISIT_MS = 20_000;
/** Invito ignorato: dopo questo tempo vola nella barra (da tarare, 8 s nel mockup). */
export const INVITE_IGNORE_MS = 8_000;
/** Il pulsante largo si stringe da solo dopo questo tempo (o al primo scorrimento). */
export const WIDE_MS = 4_600;
/** Un voto vale per 24 ore, come il blocco del fondo e il voto di oggi. */
export const REVIEW_MEMORY_MS = 24 * 60 * 60 * 1000;
/** Misure del pulsante (spec §3): largo 155, stretto 88, alto come il cerchio dell'ordine. */
export const VOTE_WIDE_PX = 155;
export const VOTE_NARROW_PX = 88;
/**
 * - `idle`: niente ancora.
 * - `invite`: la modale piccola è a vista (`again`: riaperta dal pulsante della barra).
 * - `rating`: toccata una stella, la modale è cresciuta nel modulo (foglio col velo).
 * - `parked`: il pulsante sta nella barra (`wide`: «Com'è andata? ★», altrimenti «★ Vota»).
 * - `gone`: «No grazie», modulo chiuso senza voto o voto dato; per questa visita non torna.
 */
export type VotePhase = "idle" | "invite" | "rating" | "parked" | "gone";

export type VoteState = {
    phase: VotePhase;
    wide: boolean;
    /** Momenti già usati: il primo apre l'invito, il secondo riallarga il pulsante, poi basta. */
    attempts: number;
    /** Invito riaperto dal pulsante della barra: ignorato, ci torna stretto. */
    again?: boolean;
};

export type VoteEvent =
    /** Un momento della visita (conto chiesto, ripresa del telefono dopo una pausa lunga). */
    | { type: "moment"; canInvite: boolean }
    /** × della modale: «no grazie», non resta niente. */
    | { type: "dismiss" }
    /** Ignorata, tocco fuori o tirata giù: vola nella barra. */
    | { type: "ignore" }
    /** Una stella della modale: la modale cresce nel modulo. */
    | { type: "rate" }
    /** Il pulsante della barra: torna la modale piccola (mockup v38). */
    | { type: "reopen" }
    /** Il modulo si è chiuso senza voto: × vuol dire «no grazie» anche lì (spec §11). */
    | { type: "formClosed" }
    /** Il pulsante largo si stringe (tempo o scorrimento). */
    | { type: "shrink" }
    /** Voto inviato (anche dal fondo): il pulsante esce. */
    | { type: "voted" }
    /** Stato della visita riletto dallo storage (solo all'inizio). */
    | { type: "restore"; state: VoteState };

export const INITIAL_VOTE: VoteState = { phase: "idle", wide: false, attempts: 0 };

export function voteReducer(state: VoteState, event: VoteEvent): VoteState {
    if (event.type === "voted") return { ...state, phase: "gone", wide: false };
    switch (state.phase) {
        case "idle":
            if (event.type === "restore") return event.state;
            // Un foglio aperto o la pagina a metà lettura: il momento si perde, il prossimo conta.
            return event.type === "moment" && event.canInvite ? { phase: "invite", wide: false, attempts: 1 } : state;
        case "invite":
            if (event.type === "dismiss") return { ...state, phase: "gone", again: false };
            if (event.type === "ignore") return { ...state, phase: "parked", wide: !state.again, again: false };
            if (event.type === "rate") return { ...state, phase: "rating", again: false };
            return state;
        case "rating":
            return event.type === "formClosed" ? { ...state, phase: "gone" } : state;
        case "parked":
            if (event.type === "shrink") return { ...state, wide: false };
            if (event.type === "reopen") return { ...state, phase: "invite", wide: false, again: true };
            // Al massimo un secondo tentativo, solo con un momento nuovo e utile: riallarga il pulsante.
            if (event.type === "moment" && event.canInvite && state.attempts < 2 && !state.wide) {
                return { ...state, wide: true, attempts: 2 };
            }
            return state;
        case "gone":
            return state;
    }
}

/** Cosa resta per la visita (sessionStorage): la modale non torna dopo un ricaricamento. */
export function persistedVote(state: VoteState): VoteState | null {
    if (state.phase === "gone") return { phase: "gone", wide: false, attempts: state.attempts };
    if (state.phase === "invite" || state.phase === "rating" || state.phase === "parked") {
        return { phase: "parked", wide: false, attempts: state.attempts };
    }
    return null;
}

export function restoreVote(raw: string | null): VoteState {
    if (!raw) return INITIAL_VOTE;
    try {
        const value = JSON.parse(raw) as Partial<VoteState>;
        if (value.phase !== "gone" && value.phase !== "parked") return INITIAL_VOTE;
        const attempts = typeof value.attempts === "number" && value.attempts >= 1 ? Math.min(2, value.attempts) : 1;
        return { phase: value.phase, wide: false, attempts };
    } catch {
        return INITIAL_VOTE;
    }
}

export const voteStorageKey = (activityId: string) => `pub_vote_${activityId}`;

export function reviewedRecently(timestamp: string | null, now: number): boolean {
    if (!timestamp) return false;
    const at = parseInt(timestamp, 10);
    return Number.isFinite(at) && now - at < REVIEW_MEMORY_MS;
}

/** Prima apertura e ultima volta che la pagina si è nascosta, per la visita (sessionStorage). */
export type VisitClock = { firstAt: number; hiddenAt: number | null };

export const visitStorageKey = (activityId: string) => `pub_vote_visit_${activityId}`;

/** Rilegge l'orologio della visita; un valore rotto o assente riparte da adesso. */
export function restoreVisit(raw: string | null, now: number): VisitClock {
    try {
        const value = raw ? (JSON.parse(raw) as Partial<VisitClock>) : null;
        if (value && typeof value.firstAt === "number" && value.firstAt <= now) {
            const hiddenAt = typeof value.hiddenAt === "number" && value.hiddenAt <= now ? value.hiddenAt : null;
            return { firstAt: value.firstAt, hiddenAt };
        }
    } catch {
        /* si riparte da adesso */
    }
    return { firstAt: now, hiddenAt: null };
}

/**
 * La pagina torna a vista: è la ripresa del telefono se è rimasta nascosta almeno
 * `away` e la visita dura da almeno `visit`. Anche dopo un ricaricamento (Safari
 * scarta le schede ferme): l'orologio sta in sessionStorage.
 */
export function isReturnMoment(
    clock: VisitClock,
    now: number,
    timing: { away: number; visit: number } = { away: AWAY_MS, visit: MIN_VISIT_MS }
): boolean {
    return clock.hiddenAt !== null && now - clock.hiddenAt >= timing.away && now - clock.firstAt >= timing.visit;
}

/**
 * Il largo ci sta? La barra intera (capsula, pulsante largo, cerchio dell'ordine,
 * spazi) dentro la larghezza utile; altrimenti si stringe subito (spec §11).
 */
export function fitsWide(barWidth: number, viewportWidth: number): boolean {
    return barWidth <= viewportWidth - 24;
}
