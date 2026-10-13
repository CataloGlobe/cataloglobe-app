import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { hasOpenSheet, subscribeSheetClose } from "../../hooks/openSheets";
import { useSheetState } from "../sheets/sheetStack";
import type { VoteSlotContext } from "../slots";
import {
    INITIAL_VOTE,
    PROVA_AWAY_MS,
    PROVA_VISIT_MS,
    isReturnMoment,
    persistedVote,
    restoreVisit,
    restoreVote,
    reviewedRecently,
    visitStorageKey,
    voteReducer,
    voteStorageKey,
    type VisitClock,
    type VoteEvent,
    type VoteState
} from "./voteInvite";

/** Dopo la chiusura di un foglio, il tempo di vederlo scendere prima dell'invito. */
const AFTER_SHEET_MS = 900;

/** Si può chiedere adesso? Pagina visibile e nessun foglio aperto; telefono e desktop (D77). */
function canInviteNow(): boolean {
    if (typeof window === "undefined" || document.visibilityState !== "visible") return false;
    return !hasOpenSheet();
}

function saveVisit(activityId: string, clock: VisitClock): void {
    try {
        sessionStorage.setItem(visitStorageKey(activityId), JSON.stringify(clock));
    } catch {
        /* Safari privato: l'orologio vive solo in memoria */
    }
}

function readReviewed(activityId: string): boolean {
    try {
        return reviewedRecently(localStorage.getItem(`fab_reviewed_${activityId}`), Date.now());
    } catch {
        return false;
    }
}

/**
 * Quando chiedere il voto (D76): al tavolo appena chiesto il conto; per tutti alla
 * ripresa del telefono dopo una pausa lunga (`isReturnMoment`). Un momento che
 * cade con un foglio aperto aspetta che si chiuda; una volta per visita. Lo stato
 * della visita resta in sessionStorage: dopo un ricaricamento c'è il pulsante, non la modale.
 */
export function useVoteInvite(vote: VoteSlotContext | undefined) {
    const activityId = vote?.activityId;
    const [state, dispatch] = useReducer(voteReducer, INITIAL_VOTE);
    // Stato e voto si leggono dopo il primo disegno: in SSR non c'è storage.
    const [ready, setReady] = useState(false);
    const restoredFor = useRef<string | null>(null);

    useEffect(() => {
        if (!activityId || restoredFor.current === activityId) return;
        restoredFor.current = activityId;
        let restored: VoteState = INITIAL_VOTE;
        try {
            restored = restoreVote(sessionStorage.getItem(voteStorageKey(activityId)));
        } catch {
            /* Safari privato: si riparte da capo */
        }
        if (readReviewed(activityId)) dispatch({ type: "voted" });
        else if (restored.phase !== "idle") dispatch({ type: "restore", state: restored });
        setReady(true);
    }, [activityId]);

    useEffect(() => {
        if (!activityId || !ready) return;
        const saved = persistedVote(state);
        try {
            if (saved) sessionStorage.setItem(voteStorageKey(activityId), JSON.stringify(saved));
        } catch {
            /* Safari privato */
        }
    }, [activityId, ready, state]);

    const send = useCallback((event: VoteEvent) => dispatch(event), []);
    const moment = useCallback(() => dispatch({ type: "moment", canInvite: canInviteNow() }), []);

    // Voto dato in questa visita (anche dal fondo): il pulsante esce.
    const reviewed = vote?.reviewed ?? false;
    useEffect(() => {
        if (reviewed) dispatch({ type: "voted" });
    }, [reviewed]);

    // Un momento con un foglio aperto (spesso proprio «Il tuo ordine») non si perde:
    // aspetta che il foglio si chiuda e finisca di scendere.
    const pending = useRef(false);
    const momentWhenFree = useCallback(() => {
        if (hasOpenSheet()) pending.current = true;
        else moment();
    }, [moment]);
    useEffect(() => {
        let timer = 0;
        const unsubscribe = subscribeSheetClose(() => {
            if (!pending.current) return;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (hasOpenSheet()) return;
                pending.current = false;
                moment();
            }, AFTER_SHEET_MS);
        });
        return () => {
            unsubscribe();
            window.clearTimeout(timer);
        };
    }, [moment]);

    // Al tavolo: il conto chiesto è un momento (non il valore iniziale).
    const tableMoment = vote?.tableMoment ?? 0;
    const seenTableMoment = useRef(tableMoment);
    useEffect(() => {
        if (!ready || tableMoment === seenTableMoment.current) return;
        seenTableMoment.current = tableMoment;
        momentWhenFree();
    }, [ready, tableMoment, momentWhenFree]);

    // Per tutti: la ripresa del telefono dopo una pausa lunga, anche dopo un ricaricamento.
    const enabled = !!activityId && ready && (state.phase === "idle" || state.phase === "parked");
    useEffect(() => {
        if (!enabled || !activityId) return;
        const prova = new URLSearchParams(window.location.search).has("prova-voto");
        const timing = prova ? { away: PROVA_AWAY_MS, visit: PROVA_VISIT_MS } : undefined;
        let raw: string | null = null;
        try {
            raw = sessionStorage.getItem(visitStorageKey(activityId));
        } catch {
            /* Safari privato */
        }
        let clock = restoreVisit(raw, Date.now());
        const check = () => {
            const now = Date.now();
            if (document.visibilityState === "hidden") {
                // Il primo momento in cui si nasconde: la pausa conta da lì.
                if (clock.hiddenAt === null) clock = { ...clock, hiddenAt: now };
            } else {
                const back = isReturnMoment(clock, now, timing);
                clock = { ...clock, hiddenAt: null };
                if (back) momentWhenFree();
            }
            saveVisit(activityId, clock);
        };
        check();
        document.addEventListener("visibilitychange", check);
        return () => document.removeEventListener("visibilitychange", check);
    }, [enabled, activityId, momentWhenFree]);

    // Il modulo è nel foglio: chiuso senza voto è «no grazie» (× anche lì, spec §11).
    const sheetOpen = useSheetState().pages.length > 0;
    const sawSheet = useRef(false);
    useEffect(() => {
        if (state.phase !== "rating") {
            sawSheet.current = false;
            return;
        }
        if (sheetOpen) sawSheet.current = true;
        else if (sawSheet.current) dispatch({ type: "formClosed" });
    }, [state.phase, sheetOpen]);

    return { state, send };
}
