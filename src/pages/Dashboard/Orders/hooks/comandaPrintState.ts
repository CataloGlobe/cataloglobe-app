import type { ComandaPrintJobRow } from "@/types/orders";

/**
 * Stato di stampa della comanda mostrato sulla card del kanban. Derivato
 * dai job `print_jobs` (kind='comanda') dell'ordine, SOLO dagli stati
 * terminali del modello:
 *
 *   - `done`   → almeno una stampante ha accettato la comanda: "Ristampa"
 *   - `failed` → almeno un job ha esaurito i tentativi: "Comanda non
 *                stampata" + "Riprova"
 *
 * `pending` / `processing` NON producono uno stato: lo sweeper
 * `process-print-jobs` li porta da solo a `done` o `failed`. Nessun
 * "appeso" derivato lato client (niente confronto con now(), niente soglia
 * duplicata dallo sweeper): la stampante irraggiungibile si segnala nello
 * stato stampante della sede, non per ordine.
 *
 * Con piu' job per ordine (una stampante per job) vince lo stato peggiore:
 * failed > done.
 */
export type ComandaPrintState = "done" | "failed";

export function deriveComandaPrintStates(
    jobs: Iterable<ComandaPrintJobRow>
): Map<string, ComandaPrintState> {
    const out = new Map<string, ComandaPrintState>();
    for (const job of jobs) {
        if (job.status === "failed") {
            out.set(job.order_id, "failed");
        } else if (job.status === "done" && !out.has(job.order_id)) {
            out.set(job.order_id, "done");
        }
    }
    return out;
}
