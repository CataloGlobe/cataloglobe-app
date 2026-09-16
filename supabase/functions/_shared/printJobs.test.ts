import { describe, it, expect, vi } from "vitest";
import { SUNMI_CODES } from "./sunmi";
import { pushComandaToPrinter, tradeNoFor, finalizePrintJob } from "./printJobs";

const CREDS = { appId: "app", appKey: "key" };

function fakeFetch(body: unknown, status = 200): typeof fetch {
    return vi.fn(async () =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
    ) as unknown as typeof fetch;
}

describe("tradeNoFor", () => {
    const ORDER = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";
    const PRINTER_A = "ffee0011-2233-4455-6677-8899aabbccdd";
    const PRINTER_B = "abcd0011-2233-4455-6677-8899aabbccdd";

    it("27 hex di order_id + 4 hex di printer_id + 1 char kind = 32 caratteri", () => {
        const out = tradeNoFor(ORDER, PRINTER_A, "comanda");
        expect(out).toBe("0a1b2c3d4e5f60718293a4b5c6d" + "ffee" + "c");
        expect(out).toHaveLength(32);
        expect(out).toMatch(/^[0-9a-f]{31}[ca]$/);
    });

    it("kind 'annullo' → suffisso 'a'", () => {
        const out = tradeNoFor(ORDER, PRINTER_A, "annullo");
        expect(out.endsWith("a")).toBe(true);
        expect(out).toHaveLength(32);
    });

    it("stesso ordine e stampante, kind diverso → trade_no diversi (comanda + annullo coesistono)", () => {
        expect(tradeNoFor(ORDER, PRINTER_A, "comanda")).not.toBe(tradeNoFor(ORDER, PRINTER_A, "annullo"));
    });

    it("stesso ordine, stampanti diverse → trade_no diversi (dedup Sunmi per shop)", () => {
        expect(tradeNoFor(ORDER, PRINTER_A, "comanda")).not.toBe(tradeNoFor(ORDER, PRINTER_B, "comanda"));
    });

    it("deterministico: stessa (ordine, stampante, kind) → stesso trade_no (retry idempotente)", () => {
        expect(tradeNoFor(ORDER, PRINTER_A, "comanda")).toBe(tradeNoFor(ORDER, PRINTER_A, "comanda"));
    });

    it("normalizza maiuscole", () => {
        expect(tradeNoFor(ORDER.toUpperCase(), PRINTER_A.toUpperCase(), "comanda")).toBe(
            tradeNoFor(ORDER, PRINTER_A, "comanda")
        );
    });
});

describe("pushComandaToPrinter", () => {
    it("code 1 → ok, invia sn/trade_no/count/content nel body", async () => {
        const f = fakeFetch({ code: 1, msg: "ok" });
        const res = await pushComandaToPrinter("N411ABC", "abc123", "1b40", {
            credentials: CREDS,
            fetchImpl: f
        });
        expect(res).toEqual({ ok: true, duplicate: false });
        const call = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
        const url = call[0] as string;
        const init = call[1] as RequestInit;
        expect(url).toContain("/v2/printer/open/open/device/pushContent");
        expect(JSON.parse(init.body as string)).toEqual({
            sn: "N411ABC",
            trade_no: "abc123",
            count: 1,
            content: "1b40"
        });
    });

    it("10071705 (trade_no duplicato) → ok con duplicate=true", async () => {
        const res = await pushComandaToPrinter("N411ABC", "abc123", "1b40", {
            credentials: CREDS,
            fetchImpl: fakeFetch({ code: SUNMI_CODES.TRADE_NO_DUPLICATE, msg: "dup" })
        });
        expect(res).toEqual({ ok: true, duplicate: true });
    });

    it("altro codice Sunmi → ko con messaggio categorizzato", async () => {
        const res = await pushComandaToPrinter("N411ABC", "abc123", "1b40", {
            credentials: CREDS,
            fetchImpl: fakeFetch({ code: SUNMI_CODES.NO_DEVICE, msg: "no device" })
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain("10071707");
    });

    it("errore di trasporto → ko, non lancia", async () => {
        const f = vi.fn(async () => { throw new Error("boom"); }) as unknown as typeof fetch;
        const res = await pushComandaToPrinter("N411ABC", "abc123", "1b40", {
            credentials: CREDS,
            fetchImpl: f
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain("boom");
    });
});

// Fake minimale del query builder supabase-js per finalizePrintJob:
// registra il patch e i filtri applicati.
function fakeSupabaseUpdate() {
    const calls: { table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }[] = [];
    const client = {
        from(table: string) {
            const entry = { table, patch: {}, filters: [] as Array<[string, unknown]> };
            return {
                update(patch: Record<string, unknown>) {
                    entry.patch = patch;
                    const chain = {
                        eq(col: string, val: unknown) {
                            entry.filters.push([col, val]);
                            return chain;
                        },
                        then(resolve: (v: { error: null }) => void) {
                            calls.push(entry);
                            resolve({ error: null });
                        }
                    };
                    return chain;
                }
            };
        }
    };
    return { client, calls };
}

describe("finalizePrintJob", () => {
    it("ok → done + processed_at, guard status=processing", async () => {
        const { client, calls } = fakeSupabaseUpdate();
        await finalizePrintJob(client as never, "job-1", { ok: true, duplicate: false }, 1, 3);
        expect(calls).toHaveLength(1);
        expect(calls[0].table).toBe("print_jobs");
        expect(calls[0].patch.status).toBe("done");
        expect(calls[0].patch.last_error).toBeNull();
        expect(typeof calls[0].patch.processed_at).toBe("string");
        expect(calls[0].filters).toEqual([["id", "job-1"], ["status", "processing"]]);
    });

    it("ko sotto il cap → pending con last_error", async () => {
        const { client, calls } = fakeSupabaseUpdate();
        await finalizePrintJob(client as never, "job-1", { ok: false, error: "offline" }, 1, 3);
        expect(calls[0].patch).toEqual({ status: "pending", last_error: "offline" });
    });

    it("ko al cap → failed + processed_at", async () => {
        const { client, calls } = fakeSupabaseUpdate();
        await finalizePrintJob(client as never, "job-1", { ok: false, error: "offline" }, 3, 3);
        expect(calls[0].patch.status).toBe("failed");
        expect(calls[0].patch.last_error).toBe("offline");
        expect(typeof calls[0].patch.processed_at).toBe("string");
    });
});

// ============================================================
// Ciclo di vita: un job che fallisce sempre finisce in 'failed' e smette
// di essere ripescato. Il cap sta nel WORKER (finalizePrintJob), come in
// processTranslationTick: la claim SQL incrementa attempts e pesca solo
// pending / processing orfani, mai i failed. Qui la claim e' simulata con
// le stesse regole, finalizePrintJob e' quella reale.
// ============================================================

interface SimJob {
    id: string;
    status: "pending" | "processing" | "done" | "failed";
    attempts: number;
    last_error: string | null;
    processed_at: string | null;
}

function fakeQueue(initial: SimJob) {
    const job: SimJob = { ...initial };
    // Semantica di claim_pending_print_jobs (statement 2): pending OR
    // processing orfano sotto cap. Qui nessun orfano: solo il ramo pending.
    const claim = (maxAttempts: number): SimJob | null => {
        const eligible =
            job.status === "pending"
            || (job.status === "processing" && job.attempts < maxAttempts);
        if (!eligible) return null;
        job.status = "processing";
        job.attempts += 1;
        return { ...job };
    };
    const client = {
        from(table: string) {
            expect(table).toBe("print_jobs");
            return {
                update(patch: Partial<SimJob>) {
                    const filters: Array<[string, unknown]> = [];
                    const chain = {
                        eq(col: string, val: unknown) {
                            filters.push([col, val]);
                            return chain;
                        },
                        then(resolve: (v: { error: null }) => void) {
                            const matches = filters.every(([c, v]) => (job as unknown as Record<string, unknown>)[c] === v);
                            if (matches) Object.assign(job, patch);
                            resolve({ error: null });
                        }
                    };
                    return chain;
                }
            };
        }
    };
    return { client: client as never, claim, job };
}

describe("ciclo di vita job che fallisce sempre", () => {
    it("push inline fallito → pending; 2 sweep falliti → failed; poi mai piu' claimato", async () => {
        const MAX = 3;
        // Stato dopo l'INSERT inline (processing, attempts=1) — vedi enqueueAndDispatchPrintJobs.
        const q = fakeQueue({ id: "j1", status: "processing", attempts: 1, last_error: null, processed_at: null });

        // Tentativo #1 (inline) fallisce → torna pending.
        await finalizePrintJob(q.client, "j1", { ok: false, error: "offline" }, 1, MAX);
        expect(q.job.status).toBe("pending");
        expect(q.job.attempts).toBe(1);

        // Sweep #1: claim → attempts=2, fallisce → pending.
        let claimed = q.claim(MAX);
        expect(claimed?.attempts).toBe(2);
        await finalizePrintJob(q.client, "j1", { ok: false, error: "offline" }, claimed!.attempts, MAX);
        expect(q.job.status).toBe("pending");

        // Sweep #2: claim → attempts=3 (= MAX), fallisce → failed (terminale).
        claimed = q.claim(MAX);
        expect(claimed?.attempts).toBe(3);
        await finalizePrintJob(q.client, "j1", { ok: false, error: "offline" }, claimed!.attempts, MAX);
        expect(q.job.status).toBe("failed");
        expect(q.job.last_error).toBe("offline");
        expect(typeof q.job.processed_at).toBe("string");

        // Sweep #3..N: non piu' eleggibile, attempts non cresce.
        for (let i = 0; i < 5; i++) expect(q.claim(MAX)).toBeNull();
        expect(q.job.attempts).toBe(3);
    });

    it("finalizePrintJob non riapre un job gia' failed (guard status=processing)", async () => {
        const q = fakeQueue({ id: "j1", status: "failed", attempts: 3, last_error: "offline", processed_at: "x" });
        await finalizePrintJob(q.client, "j1", { ok: false, error: "again" }, 1, 3);
        expect(q.job.status).toBe("failed");
        expect(q.job.last_error).toBe("offline");
    });

    it("successo al secondo sweep → done e non piu' claimato", async () => {
        const MAX = 3;
        const q = fakeQueue({ id: "j1", status: "pending", attempts: 1, last_error: "offline", processed_at: null });
        const claimed = q.claim(MAX)!;
        await finalizePrintJob(q.client, "j1", { ok: true, duplicate: false }, claimed.attempts, MAX);
        expect(q.job.status).toBe("done");
        expect(q.job.last_error).toBeNull();
        expect(q.claim(MAX)).toBeNull();
    });
});
