import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { hasOpenSheet, subscribeSheetClose } from "../../hooks/openSheets";
import { PUBLIC_MOBILE_QUERY } from "../../publicBreakpoints";
import { useSheetState } from "../sheets/sheetStack";
import type { VoteSlotContext } from "../slots";
import {
    INITIAL_VOTE,
    MIN_DWELL_MS,
    PROVA_DWELL_MS,
    isTopReturn,
    persistedVote,
    restoreVote,
    reviewedRecently,
    voteReducer,
    voteStorageKey,
    type VoteEvent,
    type VoteState
} from "./voteInvite";

/** Si può chiedere adesso? Solo al telefono, a pagina visibile, senza fogli aperti. */
/** Dopo la chiusura di un foglio, il tempo di vederlo scendere prima dell'invito. */
const TABLE_AFTER_SHEET_MS = 900;

function canInviteNow(): boolean {
    if (typeof window === "undefined" || document.visibilityState !== "visible") return false;
    if (hasOpenSheet()) return false;
    return window.matchMedia?.(PUBLIC_MOBILE_QUERY).matches ?? false;
}

function readReviewed(activityId: string): boolean {
    try {
        return reviewedRecently(localStorage.getItem(`fab_reviewed_${activityId}`), Date.now());
    } catch {
        return false;
    }
}

/**
 * Quando chiedere il voto (D38): al tavolo dopo «Servito» o il conto chiesto;
 * per gli altri dopo la permanenza minima, solo tornando in cima o rientrando
 * nella pagina; mai con un foglio aperto; una volta per visita. Lo stato della
 * visita resta in sessionStorage: dopo un ricaricamento c'è il pulsante, non la modale.
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

    // Al tavolo: ogni «Servito» o conto chiesto è un momento (non il valore iniziale).
    // Con un foglio aperto (spesso proprio «Il tuo ordine») aspetta che si chiuda.
    const tableMoment = vote?.tableMoment ?? 0;
    const seenTableMoment = useRef(tableMoment);
    const pendingTable = useRef(false);
    useEffect(() => {
        if (!ready || tableMoment === seenTableMoment.current) return;
        seenTableMoment.current = tableMoment;
        if (hasOpenSheet()) pendingTable.current = true;
        else moment();
    }, [ready, tableMoment, moment]);
    useEffect(() => {
        let timer = 0;
        const unsubscribe = subscribeSheetClose(() => {
            if (!pendingTable.current) return;
            window.clearTimeout(timer);
            // Il foglio finisce di scendere, poi l'invito (se non se n'è aperto un altro).
            timer = window.setTimeout(() => {
                if (hasOpenSheet()) return;
                pendingTable.current = false;
                moment();
            }, TABLE_AFTER_SHEET_MS);
        });
        return () => {
            unsubscribe();
            window.clearTimeout(timer);
        };
    }, [moment]);

    // Gli altri: permanenza minima, poi ritorno in cima o rientro nella pagina.
    const enabled = !!vote && ready && (state.phase === "idle" || state.phase === "parked");
    useEffect(() => {
        if (!enabled) return;
        const dwell = new URLSearchParams(window.location.search).has("prova-voto") ? PROVA_DWELL_MS : MIN_DWELL_MS;
        const start = performance.now();
        let maxScrollY = window.scrollY;
        let frame = 0;
        const onScroll = () => {
            // Il punto più basso si segna subito: il frame dopo può già essere in cima.
            if (!hasOpenSheet()) maxScrollY = Math.max(maxScrollY, window.scrollY);
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                // Col foglio aperto il body è fermo e scrollY vale 0: non è un ritorno in cima.
                if (hasOpenSheet()) return;
                const y = window.scrollY;
                if (performance.now() - start < dwell || !isTopReturn(maxScrollY, y, window.innerHeight)) return;
                // Un ritorno solo: il prossimo momento chiede di scendere di nuovo.
                maxScrollY = y;
                moment();
            });
        };
        const onVisibility = () => {
            if (document.visibilityState === "visible" && performance.now() - start >= dwell) moment();
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("scroll", onScroll);
            document.removeEventListener("visibilitychange", onVisibility);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [enabled, moment]);

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
