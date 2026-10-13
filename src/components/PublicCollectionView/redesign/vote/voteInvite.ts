/**
 * Invito al voto del redesign (spec §11, D38): quando arriva, cosa succede a ogni
 * gesto, cosa resta per il resto della visita. Puro, provato in
 * `src/tests/publicRedesign/voteInvite.test.ts`.
 */

/** Chi non è al tavolo: tempo minimo nella pagina prima dell'invito (da tarare). */
export const MIN_DWELL_MS = 15 * 60_000;
/** Con `?prova-voto=1`: il tempo del mockup, per provarlo dal telefono. */
export const PROVA_DWELL_MS = 20_000;
/** Invito ignorato: dopo questo tempo vola nella barra (da tarare, 8 s nel mockup). */
export const INVITE_IGNORE_MS = 8_000;
/** Il pulsante largo si stringe da solo dopo questo tempo (o al primo scorrimento). */
export const WIDE_MS = 4_600;
/** Un voto vale per 24 ore, come il blocco del fondo e il voto di oggi. */
export const REVIEW_MEMORY_MS = 24 * 60 * 60 * 1000;
/** Misure del pulsante (spec §3): largo 155, stretto 88, alto come il cerchio dell'ordine. */
export const VOTE_WIDE_PX = 155;
export const VOTE_NARROW_PX = 88;
/** Distanza dalla cima entro cui si è «tornati in cima». */
export const TOP_ZONE_PX = 120;

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
    /** Un momento della visita (Servito, conto chiesto, ritorno in cima dopo la permanenza). */
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

/**
 * «Tornare in cima»: si era scesi almeno di una schermata e ora si è vicino
 * alla cima. Chi è ancora in cima senza aver letto non conta.
 */
export function isTopReturn(maxScrollY: number, scrollY: number, viewportHeight: number): boolean {
    return maxScrollY >= viewportHeight && scrollY <= TOP_ZONE_PX;
}

/**
 * Il largo ci sta? La barra intera (capsula, pulsante largo, cerchio dell'ordine,
 * spazi) dentro la larghezza utile; altrimenti si stringe subito (spec §11).
 */
export function fitsWide(barWidth: number, viewportWidth: number): boolean {
    return barWidth <= viewportWidth - 24;
}
