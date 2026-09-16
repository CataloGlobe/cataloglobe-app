// @ts-nocheck
// =============================================================================
// process-print-jobs (Edge Function) — sweeper coda stampa comande
// =============================================================================
//
// Invocata da pg_cron ogni minuto (migration 20260907210300). Auth via header
// X-Job-Secret (PRINT_JOB_SECRET). Niente CORS: chiamata interna da DB
// net.http_post.
//
// Il percorso felice NON passa da qui: submit-order / submit-order-admin
// inseriscono il job e fanno il push inline (EdgeRuntime.waitUntil). Questo
// sweeper riprende:
//   * i 'pending'  → push inline fallito (rete, stampante offline);
//   * i 'processing' orfani → edge morta con il push in volo (reclaim per eta'
//     di claimed_at, soglia DEFAULT DB 5 min).
//
// Tick:
//   1. claim_pending_print_jobs(BATCH, MAX_ATTEMPTS) — cap poison lato DB;
//   2. raggruppa per (order_id, kind) → buildComanda UNA volta per gruppo
//      (stesso ordine puo' avere sia un job 'comanda' che un job 'annullo');
//   2b. guard di stato per i job 'annullo' (blocco 3a): rilegge orders.status
//       PRIMA di stampare. Se non e' piu' 'cancelled' (ripristinato via
//       uncancel-to-* entro il minuto), il job va a 'done' senza stampare —
//       niente ticket fantasma per un ordine tornato attivo;
//   3. push per job → finalizePrintJob (done / pending / failed);
//   4. finally: i job presi ma non risolti (crash a meta' loop) tornano
//      'pending' (guard status='processing', come process-translation-jobs).
//
// Modellata su process-translation-jobs.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildComanda } from "../_shared/buildComanda.ts";
import { renderComandaEscPos, renderAnnulloEscPos } from "../_shared/escpos.ts";
import {
    PRINT_MAX_ATTEMPTS,
    finalizePrintJob,
    pushComandaToPrinter,
    type PushResult,
    type PrintJobKind
} from "../_shared/printJobs.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_SECRET = Deno.env.get("PRINT_JOB_SECRET");

const BATCH_SIZE = 50;
const LOG = "[process-print-jobs]";

interface ClaimedJob {
    id: string;
    tenant_id: string;
    activity_id: string;
    order_id: string;
    printer_id: string;
    trade_no: string;
    kind: PrintJobKind;
    attempts: number;
}

interface JobGroup {
    orderId: string;
    kind: PrintJobKind;
    jobs: ClaimedJob[];
}

// Confronto constant-time (stesso helper di process-translation-jobs).
function timingSafeEqualStr(a: string, b: string): boolean {
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    const maxLen = Math.max(aBytes.length, bBytes.length);
    let diff = aBytes.length === bBytes.length ? 0 : 1;
    for (let i = 0; i < maxLen; i++) {
        const x = i < aBytes.length ? aBytes[i] : 0;
        const y = i < bBytes.length ? bBytes[i] : 0;
        diff |= x ^ y;
    }
    return diff === 0;
}

function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

Deno.serve(async (req: Request) => {
    // 1. Auth — secret mancante dall'env = rifiuta (fail-safe).
    const providedSecret = req.headers.get("X-Job-Secret");
    if (!JOB_SECRET || !providedSecret || !timingSafeEqualStr(providedSecret, JOB_SECRET)) {
        return jsonResponse({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    const counters = {
        claimed: 0,
        done: 0,
        requeued: 0,
        failed: 0,
        orphans_reset: 0,
        skipped_restored: 0
    };

    // 2. Claim
    const { data: claimedRaw, error: claimErr } = await supabase.rpc("claim_pending_print_jobs", {
        p_limit: BATCH_SIZE,
        p_max_attempts: PRINT_MAX_ATTEMPTS
        // p_reclaim_after_minutes: DEFAULT DB (5 min)
    });
    if (claimErr) {
        console.error(`${LOG} claim failed`, { error: claimErr.message });
        return jsonResponse({ error: "claim_failed", ...counters }, 500);
    }
    const claimed = (claimedRaw ?? []) as ClaimedJob[];
    counters.claimed = claimed.length;
    if (claimed.length === 0) return jsonResponse(counters, 200);

    // Job presi ma non ancora risolti: il finally li riporta a pending.
    const unresolved = new Set(claimed.map(j => j.id));

    try {
        // 3. Stampanti (sn) dei job claimati — una query.
        const printerIds = Array.from(new Set(claimed.map(j => j.printer_id)));
        const { data: printers, error: printersErr } = await supabase
            .from("printers")
            .select("id, sn, is_active")
            .in("id", printerIds);
        if (printersErr) {
            console.error(`${LOG} printers lookup failed`, { error: printersErr.message });
            return jsonResponse({ error: "printers_lookup_failed", ...counters }, 500);
        }
        const printerById = new Map<string, { sn: string; is_active: boolean }>(
            (printers ?? []).map(p => [p.id, { sn: p.sn, is_active: p.is_active }])
        );

        // 4. Raggruppa per (ordine, kind) → build una volta per gruppo.
        // Lo stesso ordine puo' avere sia un job 'comanda' (in retry) sia un
        // job 'annullo': contenuti diversi, non possono condividere la build.
        const byOrderKind = new Map<string, JobGroup>();
        for (const job of claimed) {
            const key = `${job.order_id}::${job.kind}`;
            const group = byOrderKind.get(key) ?? { orderId: job.order_id, kind: job.kind, jobs: [] };
            group.jobs.push(job);
            byOrderKind.set(key, group);
        }

        // 4b. Guard di stato per gli annulli — rilegge orders.status PRIMA di
        // stampare. Se l'ordine non e' (piu') 'cancelled' (uncancel-to-* lo ha
        // ripristinato entro il minuto, o l'ordine e' sparito), il ticket va
        // soppresso: senza questa guard la cucina riceverebbe un annullo
        // fantasma per un ordine tornato attivo. E' il cuore del blocco 3a.
        const annulloOrderIds = Array.from(
            new Set(
                Array.from(byOrderKind.values())
                    .filter(g => g.kind === "annullo")
                    .map(g => g.orderId)
            )
        );
        const statusByOrderId = new Map<string, string>();
        let orderStatusLookupFailed = false;
        if (annulloOrderIds.length > 0) {
            const { data: orderStatuses, error: statusErr } = await supabase
                .from("orders")
                .select("id, status")
                .in("id", annulloOrderIds);
            if (statusErr) {
                orderStatusLookupFailed = true;
                console.error(`${LOG} order status guard lookup failed`, { error: statusErr.message });
            } else {
                for (const row of (orderStatuses ?? []) as Array<{ id: string; status: string }>) {
                    statusByOrderId.set(row.id, row.status);
                }
            }
        }

        for (const group of byOrderKind.values()) {
            const { orderId, kind, jobs } = group;

            if (kind === "annullo") {
                if (orderStatusLookupFailed) {
                    // Impossibile confermare lo stato: NON stampare stavolta.
                    // I job restano irrisolti → il finally di fine tick li
                    // riporta 'pending', riprovati al tick successivo.
                    continue;
                }
                const currentStatus = statusByOrderId.get(orderId);
                if (currentStatus !== "cancelled") {
                    // Ripristinato (o ordine non trovato): chiudi senza
                    // stampare, nessun tentativo sprecato in retry infiniti.
                    for (const job of jobs) {
                        const fin = await finalizePrintJob(
                            supabase,
                            job.id,
                            { ok: true, duplicate: false },
                            job.attempts,
                            PRINT_MAX_ATTEMPTS
                        );
                        if (fin.error) {
                            console.error(`${LOG} job update failed`, {
                                print_job_id: job.id,
                                error: fin.error
                            });
                            continue; // resta in unresolved → finally lo riporta a pending
                        }
                        unresolved.delete(job.id);
                        counters.skipped_restored++;
                        console.log(`${LOG} print_job_skipped_restored`, {
                            event: "print_job_skipped_restored",
                            order_id: orderId,
                            print_job_id: job.id,
                            printer_id: job.printer_id,
                            current_status: currentStatus ?? "not_found"
                        });
                    }
                    continue;
                }
            }

            let contentHex: string | null = null;
            let buildError: string | null = null;
            try {
                const built = await buildComanda(supabase, orderId);
                if (built.kind === "ok") {
                    contentHex = kind === "annullo"
                        ? renderAnnulloEscPos(built.payload)
                        : renderComandaEscPos(built.payload);
                } else {
                    buildError = built.kind === "db_error" ? built.message : "order not found";
                }
            } catch (e) {
                buildError = (e as Error)?.message ?? "unknown";
            }

            for (const job of jobs) {
                let result: PushResult;
                const printer = printerById.get(job.printer_id);

                if (buildError !== null || contentHex === null) {
                    result = { ok: false, error: `build: ${buildError ?? "unknown"}` };
                } else if (!printer) {
                    result = { ok: false, error: "printer not found" };
                } else if (!printer.is_active) {
                    // Stampante sospesa dopo l'accodamento: non stampare, ma non
                    // bruciare tentativi all'infinito → conta come tentativo.
                    result = { ok: false, error: "printer inactive" };
                } else {
                    try {
                        result = await pushComandaToPrinter(printer.sn, job.trade_no, contentHex);
                    } catch (e) {
                        result = { ok: false, error: (e as Error)?.message ?? "unknown" };
                    }
                }

                const fin = await finalizePrintJob(
                    supabase,
                    job.id,
                    result,
                    job.attempts,
                    PRINT_MAX_ATTEMPTS
                );
                if (fin.error) {
                    console.error(`${LOG} job update failed`, { print_job_id: job.id, error: fin.error });
                    continue; // resta in unresolved → finally lo riporta a pending
                }
                unresolved.delete(job.id);

                if (result.ok) {
                    counters.done++;
                    console.log(`${LOG} print_job_done`, {
                        event: "print_job_done",
                        order_id: orderId,
                        kind,
                        print_job_id: job.id,
                        printer_id: job.printer_id,
                        attempts: job.attempts,
                        duplicate: result.duplicate
                    });
                } else if (job.attempts >= PRINT_MAX_ATTEMPTS) {
                    counters.failed++;
                    console.error(`${LOG} print_job_failed`, {
                        event: "print_job_failed",
                        order_id: orderId,
                        kind,
                        print_job_id: job.id,
                        printer_id: job.printer_id,
                        attempts: job.attempts,
                        error: result.error,
                        terminal: true
                    });
                } else {
                    counters.requeued++;
                    console.error(`${LOG} print_job_requeued`, {
                        event: "print_job_requeued",
                        order_id: orderId,
                        kind,
                        print_job_id: job.id,
                        printer_id: job.printer_id,
                        attempts: job.attempts,
                        error: result.error
                    });
                }
            }
        }
    } finally {
        // 5. Anti-orfano: job presi in questo tick ma non risolti → pending.
        if (unresolved.size > 0) {
            const ids = Array.from(unresolved);
            const { error } = await supabase
                .from("print_jobs")
                .update({ status: "pending" })
                .in("id", ids)
                .eq("status", "processing");
            if (error) {
                console.error(`${LOG} orphan reset failed`, { error: error.message, ids });
            } else {
                counters.orphans_reset = ids.length;
            }
        }
    }

    return jsonResponse(counters, 200);
});
