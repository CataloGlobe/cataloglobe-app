// «Servizio concluso» con ordini ancora aperti: quando il gesto chiede, cosa
// offre, e come lo dice. Regole pure, fuori dal JSX, come `seatingDrawer.ts`.
//
// Il fatto arriva dalla view (`pending_orders_count`,
// `pending_orders_deliverable`), con la STESSA condizione con cui il server
// pretende un'azione: qui non si ricostruisce la regola, si legge.

import type { SeatingWithState } from "@/types/seating";

/** Cosa è successo agli ordini rimasti aperti. Valori di `close_seating.p_action`. */
export type SeatingCloseAction = "deliver" | "cancel";

export type SeatingCloseFlow =
    /** Nessun ordine da decidere: si chiude, senza chiedere niente. */
    | { kind: "direct" }
    /** Il drawer cambia stato e fa la domanda. */
    | { kind: "ask"; pendingOrders: number; options: SeatingCloseAction[] };

export type SeatingPendingOrders = Pick<
    SeatingWithState,
    "pending_orders_count" | "pending_orders_deliverable"
>;

/**
 * Chiede solo se c'è qualcosa da decidere. «Serviti» si offre solo quando
 * il locale l'ha resa possibile confermando gli ordini: altrimenti l'unica
 * risposta è «annullati», e «serviti» NON si disegna — nemmeno spento. Un
 * bottone disabilitato che non spiega perché è peggio di un bottone assente
 * accompagnato dalla riga che lo dice (`notDeliverableReason`).
 */
export function seatingCloseFlowFor(seating: SeatingPendingOrders): SeatingCloseFlow {
    if (seating.pending_orders_count <= 0) return { kind: "direct" };
    return {
        kind: "ask",
        pendingOrders: seating.pending_orders_count,
        options: seating.pending_orders_deliverable ? ["deliver", "cancel"] : ["cancel"]
    };
}

// ── Testi della domanda ───────────────────────────────────────────────────
// Niente gergo del dominio (gruppo, verificato, risoluzione) e niente numeri
// scritti a mano: il conteggio viene dal dato.

/** Titolo, singolare e plurale. */
export function closeQuestionTitle(pendingOrders: number): string {
    return pendingOrders === 1 ? "C'è un ordine ancora aperto" : "Ci sono ordini ancora aperti";
}

/**
 * "C'è un ordine ancora aperto …" / "Ci sono 3 ordini ancora aperti …".
 * "Aperto" è la parola dello stato, la stessa della riga nella lista e del
 * toast di rete: una sola per lo stesso fatto. Non "chiuso" (è ciò che
 * succede a un conto, non a un ordine) e non "non ancora servito"
 * (suggerirebbe la risposta).
 */
export function closeQuestionText(pendingOrders: number): string {
    const head =
        pendingOrders === 1
            ? "C'è un ordine ancora aperto su questa tavolata."
            : `Ci sono ${pendingOrders} ordini ancora aperti su questa tavolata.`;
    return `${head} Prima di concludere il servizio, dì cosa è successo.`;
}

/** La riga che accompagna l'assenza di «serviti». */
export function notDeliverableReason(pendingOrders: number): string {
    return pendingOrders === 1
        ? "Questo ordine non è mai stato confermato dal locale, quindi non si può segnare come servito."
        : "Questi ordini non sono mai stati confermati dal locale, quindi non si possono segnare come serviti.";
}

export const CLOSE_ANSWER_LABEL: Record<SeatingCloseAction, string> = {
    deliver: "Sono stati serviti",
    cancel: "Sono stati annullati"
};

export const CLOSE_BACK_LABEL = "Torna indietro";

/** Singolare: la domanda parla di UN ordine. */
export const CLOSE_ANSWER_LABEL_ONE: Record<SeatingCloseAction, string> = {
    deliver: "È stato servito",
    cancel: "È stato annullato"
};

export function closeAnswerLabel(action: SeatingCloseAction, pendingOrders: number): string {
    return pendingOrders === 1 ? CLOSE_ANSWER_LABEL_ONE[action] : CLOSE_ANSWER_LABEL[action];
}

// ── Il segnale nella lista ────────────────────────────────────────────────
// Frammento corto, niente punto (è un badge). Grigio come «Servizio precedente»:
// la gente sta mangiando, non è un'urgenza. Serve soprattutto sulle tavolate
// che lo spazzino ha saltato.

export function formatPendingOrdersRow(pendingOrders: number): string {
    return pendingOrders === 1 ? "1 ordine aperto" : `${pendingOrders} ordini aperti`;
}
