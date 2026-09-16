// printJobs — orchestrazione coda di stampa comande (tabella print_jobs).
//
// Un solo modulo per i tre chiamanti (submit-order, submit-order-admin,
// process-print-jobs): evita di replicare tre volte la stessa sequenza
// "stampanti attive → INSERT job → push Sunmi → aggiorna stato".
//
// Percorso inline (submit-*):
//   enqueueAndDispatchPrintJobs()
//     1. legge le stampanti attive della sede (nessuna → nessun job);
//     2. INSERT sincrono di un print_job per stampante, gia' in stato
//        'processing' (claimed_at=now, attempts=1): cosi' lo sweeper (cron ogni
//        minuto) NON lo ripesca mentre il push inline e' ancora in volo. Se il
//        push fallisce, il job torna 'pending' e lo sweeper lo riprende.
//        UNIQUE (order_id, printer_id) + ignoreDuplicates = rete di sicurezza
//        contro il doppio INSERT (oltre alla guard idempotent_replay a monte);
//     3. EdgeRuntime.waitUntil(): build comanda → push per stampante → stato.
//   Tutto best-effort e non-throwing: nessun errore di stampa deve toccare la
//   risposta 201 al cliente (stesso contratto del side effect bill_requested_at).
//
// Percorso sweeper (process-print-jobs):
//   pushComandaToPrinter() + finalizePrintJob() sui job claimati via RPC
//   claim_pending_print_jobs (cap attempts lato DB + lato edge).
//
// Idempotenza Sunmi: `trade_no` = 28 hex di order_id + 4 hex di printer_id
// (vedi tradeNoFor). Un retry dello stesso trade_no risponde 10071705
// (TRADE_NO_DUPLICATE) → trattato come successo: la comanda e' gia' uscita,
// non va ristampata.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUNMI_CODES, SUNMI_PATHS, sunmiRequest, type SunmiRequestOptions } from "./sunmi.ts";
import { renderComandaEscPos, renderAnnulloEscPos, type ComandaPayload } from "./escpos.ts";
import { buildComanda } from "./buildComanda.ts";

// ============================================================
// Tipi
// ============================================================

/**
 * Tipo di documento del job. 'comanda' = ordine da preparare, percorso
 * inline. 'annullo' = ticket corto quando un ordine gia' stampato viene
 * cancellato — SEMPRE deferred (mai inline): vedi enqueueAndDispatchPrintJobs.
 */
export type PrintJobKind = "comanda" | "annullo";

export interface PrinterTarget {
    printer_id: string;
    sn: string;
}

export interface CreatedPrintJob {
    id: string;
    printer_id: string;
    sn: string;
    trade_no: string;
    kind: PrintJobKind;
}

export type PushResult =
    | { ok: true; duplicate: boolean }
    | { ok: false; error: string };

export interface EnqueueParams {
    orderId: string;
    tenantId: string;
    activityId: string;
    /** 'comanda' (default nei call site esistenti) o 'annullo'. */
    kind: PrintJobKind;
    /**
     * 'inline' = push in background subito (EdgeRuntime.waitUntil), come le
     * comande. 'deferred' = accoda solo (status 'pending'), niente push:
     * lo sweeper (ogni minuto) lo raccoglie. Gli annulli sono SEMPRE
     * 'deferred' — l'undo del toast "Annulla" (uncancel-to-*) non deve
     * trovare un ticket gia' uscito per un click sbagliato.
     */
    dispatch: "inline" | "deferred";
    /** Prefisso log, es. "[submit-order]". */
    logPrefix: string;
}

// ============================================================
// Helpers puri
// ============================================================

/**
 * trade_no Sunmi per la tripla (ordine, stampante, kind): 32 caratteri hex =
 * primi 27 hex di order_id + primi 4 hex di printer_id + 1 carattere kind
 * ('c' = comanda, 'a' = annullo).
 *
 * ⚠️ NON "semplificare" in `order_id senza trattini`:
 *   * Sunmi deduplica il trade_no per SHOP, e piu' stampanti della stessa sede
 *     condividono `activities.sunmi_shop_id`. Con un trade_no per solo ordine
 *     la seconda stampante riceverebbe 10071705 (TRADE_NO_DUPLICATE), che
 *     trattiamo come successo → job `done` senza che esca carta.
 *   * Non si puo' appendere un suffisso libero: 32 caratteri e' il massimo
 *     accettato e l'uuid senza trattini li occupa tutti gia' da solo. Si
 *     sacrificano quindi 5 hex dell'order_id (4 per la stampante, 1 per il
 *     kind — collisione fra ordini ~2^-100, ancora irrilevante) per
 *     distinguere sia stampante che tipo di documento.
 *   * Un solo carattere per kind, non due: bastano 2 valori oggi, e ogni
 *     carattere risparmiato resta sull'order_id (meno rischio collisione).
 * Deve restare UNIVOCO per (order_id, printer_id, kind), come la UNIQUE su
 * print_jobs.
 */
export function tradeNoFor(orderId: string, printerId: string, kind: PrintJobKind): string {
    const o = orderId.replace(/-/g, "").toLowerCase();
    const p = printerId.replace(/-/g, "").toLowerCase();
    const k = kind === "annullo" ? "a" : "c";
    return o.slice(0, 27) + p.slice(0, 4) + k;
}

/** Sceglie il renderer ESC/POS in base al kind del job. */
function _renderContent(kind: PrintJobKind, payload: ComandaPayload): string {
    return kind === "annullo" ? renderAnnulloEscPos(payload) : renderComandaEscPos(payload);
}

function _waitUntil(promise: Promise<unknown>): void {
    const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
        .EdgeRuntime;
    if (rt && typeof rt.waitUntil === "function") {
        rt.waitUntil(promise);
    } else {
        // Fuori da Supabase Edge Runtime (test locali): fire-and-forget.
        void promise;
    }
}

// ============================================================
// Push Sunmi
// ============================================================

/**
 * pushContent verso una stampante. Non lancia mai.
 * `count` = 1 copia. `content` = hex ESC/POS.
 */
export async function pushComandaToPrinter(
    sn: string,
    tradeNo: string,
    contentHex: string,
    options?: SunmiRequestOptions
): Promise<PushResult> {
    const res = await sunmiRequest(
        SUNMI_PATHS.pushContent,
        { sn, trade_no: tradeNo, count: 1, content: contentHex },
        options
    );
    if (res.kind === "ok") return { ok: true, duplicate: false };
    if (res.kind === "sunmi_error") {
        if (res.code === SUNMI_CODES.TRADE_NO_DUPLICATE) return { ok: true, duplicate: true };
        return { ok: false, error: `sunmi ${res.code} (${res.category}): ${res.msg}` };
    }
    return { ok: false, error: `${res.kind}: ${res.message}` };
}

// ============================================================
// Stato job
// ============================================================

/**
 * Aggiorna il job dopo un tentativo. Su fallimento: 'failed' se ha esaurito i
 * tentativi, altrimenti 'pending' (lo sweeper riprova). Ritorna l'eventuale
 * errore DB (il chiamante logga; non lancia).
 */
export async function finalizePrintJob(
    supabase: SupabaseClient,
    jobId: string,
    result: PushResult,
    attempts: number,
    maxAttempts: number
): Promise<{ error: string | null }> {
    const nowIso = new Date().toISOString();
    const patch = result.ok
        ? { status: "done", processed_at: nowIso, last_error: null }
        : attempts >= maxAttempts
            ? { status: "failed", processed_at: nowIso, last_error: result.error }
            : { status: "pending", last_error: result.error };

    const { error } = await supabase
        .from("print_jobs")
        .update(patch)
        .eq("id", jobId)
        .eq("status", "processing"); // guard: non sovrascrivere done/failed
    return { error: error ? error.message : null };
}

// ============================================================
// Percorso inline (submit-order / submit-order-admin)
// ============================================================

/** Numero massimo di tentativi: il push inline e' il tentativo #1. */
export const PRINT_MAX_ATTEMPTS = 3;

async function _dispatchInline(
    supabase: SupabaseClient,
    params: EnqueueParams,
    jobs: CreatedPrintJob[]
): Promise<void> {
    const { orderId, kind, logPrefix } = params;

    let contentHex: string;
    try {
        const built = await buildComanda(supabase, orderId);
        if (built.kind !== "ok") {
            const reason = built.kind === "db_error" ? built.message : "order not found";
            console.error(`${logPrefix} print_build_failed`, {
                event: "print_build_failed",
                order_id: orderId,
                kind,
                reason
            });
            for (const job of jobs) {
                await finalizePrintJob(
                    supabase,
                    job.id,
                    { ok: false, error: `build: ${reason}` },
                    1,
                    PRINT_MAX_ATTEMPTS
                );
            }
            return;
        }
        contentHex = _renderContent(kind, built.payload);
    } catch (e) {
        const message = (e as Error)?.message ?? "unknown";
        console.error(`${logPrefix} print_build_failed`, {
            event: "print_build_failed",
            order_id: orderId,
            reason: message
        });
        for (const job of jobs) {
            await finalizePrintJob(
                supabase,
                job.id,
                { ok: false, error: `build: ${message}` },
                1,
                PRINT_MAX_ATTEMPTS
            );
        }
        return;
    }

    for (const job of jobs) {
        let result: PushResult;
        try {
            result = await pushComandaToPrinter(job.sn, job.trade_no, contentHex);
        } catch (e) {
            result = { ok: false, error: (e as Error)?.message ?? "unknown" };
        }
        const fin = await finalizePrintJob(supabase, job.id, result, 1, PRINT_MAX_ATTEMPTS);
        if (result.ok) {
            // La comanda e' uscita: la carta c'e'. Spegne l'avviso acceso dal
            // callback Sunmi (report_type=2, vedi sunmi-device-callback) — un
            // segnale piu' affidabile del prossimo callback, che puo' non
            // arrivare mai se non c'e' altro da stampare. Best-effort: un
            // fallimento qui non deve mai far fallire l'esito della stampa.
            const { error: clearErr } = await supabase
                .from("printers")
                .update({ out_of_paper: false })
                .eq("id", job.printer_id)
                .eq("out_of_paper", true);
            if (clearErr) {
                console.error(`${logPrefix} printer_out_of_paper_clear_failed`, {
                    event: "printer_out_of_paper_clear_failed",
                    printer_id: job.printer_id,
                    error: clearErr.message
                });
            }
            console.log(`${logPrefix} print_job_done`, {
                event: "print_job_done",
                order_id: orderId,
                kind,
                print_job_id: job.id,
                printer_id: job.printer_id,
                duplicate: result.duplicate
            });
        } else {
            console.error(`${logPrefix} print_job_failed`, {
                event: "print_job_failed",
                order_id: orderId,
                kind,
                print_job_id: job.id,
                printer_id: job.printer_id,
                error: result.error,
                requeued: true
            });
        }
        if (fin.error) {
            console.error(`${logPrefix} print_job_update_failed`, {
                event: "print_job_update_failed",
                print_job_id: job.id,
                error: fin.error
            });
        }
    }
}

/**
 * Crea i print_jobs per le stampanti attive della sede e lancia il push in
 * background. NON lancia mai e NON blocca la risposta: il chiamante la invoca
 * e passa oltre.
 */
export async function enqueueAndDispatchPrintJobs(
    supabase: SupabaseClient,
    params: EnqueueParams
): Promise<void> {
    const { orderId, tenantId, activityId, kind, dispatch, logPrefix } = params;
    try {
        const { data: printers, error: printersErr } = await supabase
            .from("printers")
            .select("id, sn")
            .eq("activity_id", activityId)
            .eq("tenant_id", tenantId)
            .eq("is_active", true);

        if (printersErr) {
            console.error(`${logPrefix} print_printers_lookup_failed`, {
                event: "print_printers_lookup_failed",
                order_id: orderId,
                kind,
                activity_id: activityId,
                error: printersErr.message
            });
            return;
        }
        const targets = (printers ?? []) as Array<{ id: string; sn: string }>;
        if (targets.length === 0) return; // nessuna stampante: nessun job, nessun errore

        // Inline (comande): INSERT gia' 'processing' cosi' lo sweeper non lo
        // ripesca mentre il push e' in volo. Deferred (annulli): 'pending'
        // puro, nessun tentativo consumato — lo sweeper lo prende al tick
        // successivo e rilegge lo stato ordine prima di stampare.
        const nowIso = new Date().toISOString();
        const rows = targets.map(p => ({
            tenant_id: tenantId,
            activity_id: activityId,
            order_id: orderId,
            printer_id: p.id,
            kind,
            trade_no: tradeNoFor(orderId, p.id, kind),
            status: dispatch === "inline" ? "processing" : "pending",
            attempts: dispatch === "inline" ? 1 : 0,
            claimed_at: dispatch === "inline" ? nowIso : null
        }));

        const { data: inserted, error: insertErr } = await supabase
            .from("print_jobs")
            .upsert(rows, { onConflict: "order_id,printer_id,kind", ignoreDuplicates: true })
            .select("id, printer_id, trade_no");

        if (insertErr) {
            console.error(`${logPrefix} print_job_insert_failed`, {
                event: "print_job_insert_failed",
                order_id: orderId,
                kind,
                activity_id: activityId,
                error: insertErr.message
            });
            return;
        }

        const snByPrinter = new Map(targets.map(p => [p.id, p.sn]));
        const jobs: CreatedPrintJob[] = (
            (inserted ?? []) as Array<{ id: string; printer_id: string; trade_no: string }>
        )
            .map(r => ({
                id: r.id,
                printer_id: r.printer_id,
                trade_no: r.trade_no,
                kind,
                sn: snByPrinter.get(r.printer_id) ?? ""
            }))
            .filter(j => j.sn.length > 0);

        for (const job of jobs) {
            console.log(`${logPrefix} print_job_created`, {
                event: "print_job_created",
                order_id: orderId,
                kind,
                activity_id: activityId,
                print_job_id: job.id,
                printer_id: job.printer_id,
                trade_no: job.trade_no
            });
        }
        if (jobs.length === 0) return; // tutti duplicati (gia' accodati): niente da fare

        if (dispatch === "deferred") {
            // Annullo: mai push inline. Lo sweeper lo raccoglie e rilegge lo
            // stato dell'ordine prima di stampare (guard in process-print-jobs).
            return;
        }

        _waitUntil(
            _dispatchInline(supabase, params, jobs).catch(e => {
                console.error(`${logPrefix} print_dispatch_crashed`, {
                    event: "print_dispatch_crashed",
                    order_id: orderId,
                    kind,
                    error: (e as Error)?.message ?? "unknown"
                });
            })
        );
    } catch (e) {
        console.error(`${logPrefix} print_enqueue_crashed`, {
            event: "print_enqueue_crashed",
            order_id: orderId,
            error: (e as Error)?.message ?? "unknown"
        });
    }
}
