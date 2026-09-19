import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// FASE 5.2a — nessuna SELECT su `reservations` senza intervallo di date né
// tetto. PostgREST tronca a 1000 righe in silenzio, e l'ordine crescente fa
// sparire il futuro. Questi test esistono per impedire il ritorno di una
// `select("*")` illimitata, non per dimostrare il fix.

const from = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: {
        from: (...args: unknown[]) => from(...args)
    }
}));

import {
    listPendingReservations,
    listReservations,
    PENDING_QUEUE_LIMIT,
    searchReservations
} from "@/services/supabase/reservations";
import { SEARCH_RESULTS_LIMIT } from "@/utils/reservationSearch";

interface Recorded {
    method: string;
    args: unknown[];
}

/**
 * Builder PostgREST finto che REGISTRA la catena: quando la query si risolve
 * (`await`), se è una lettura di `reservations` senza `gte`+`lte` sulla data
 * né `limit`, lancia. È la rete di sicurezza: una nuova `list*` illimitata
 * fallisce qui prima che arrivi in staging.
 */
function guardedBuilder(table: string, result: { data: unknown; error: unknown }) {
    const calls: Recorded[] = [];
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "gte", "lte", "lt", "or", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
            calls.push({ method, args });
            return builder;
        };
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
        if (table === "reservations") {
            const has = (m: string, col?: string) =>
                calls.some(c => c.method === m && (col === undefined || c.args[0] === col));
            const bounded =
                (has("gte", "reservation_date") && has("lte", "reservation_date")) ||
                has("limit") ||
                has("eq", "id");
            if (!bounded) {
                throw new Error(
                    "SELECT su reservations senza intervallo di date né limit: " +
                        calls.map(c => c.method).join(".")
                );
            }
        }
        return Promise.resolve(result).then(resolve);
    };
    return { builder, calls };
}

function row(id: string, date: string, status = "confirmed") {
    return { id, reservation_date: date, reservation_time: "20:00:00", status };
}

function phoneRow(id: string, date: string, phone: string, e164: string | null) {
    return { ...row(id, date), customer_phone: phone, customer_phone_e164: e164 };
}

beforeEach(() => {
    from.mockReset();
});

describe("listReservations", () => {
    it("applica l'intervallo lato server, inclusivo, sulla colonna reservation_date", async () => {
        const { builder, calls } = guardedBuilder("reservations", {
            data: [row("a", "2026-09-14")],
            error: null
        });
        from.mockReturnValue(builder);

        const rows = await listReservations("t1", { from: "2026-09-14", to: "2026-09-20" });

        expect(from).toHaveBeenCalledWith("reservations");
        expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", "t1"] });
        expect(calls).toContainEqual({ method: "gte", args: ["reservation_date", "2026-09-14"] });
        expect(calls).toContainEqual({ method: "lte", args: ["reservation_date", "2026-09-20"] });
        expect(rows).toHaveLength(1);
    });

    it("con un intervallo rovesciato non tocca la rete", async () => {
        const rows = await listReservations("t1", { from: "2026-09-20", to: "2026-09-14" });
        expect(rows).toEqual([]);
        expect(from).not.toHaveBeenCalled();
    });

    it("il builder di guardia lancia davvero su una query senza intervallo", async () => {
        const { builder } = guardedBuilder("reservations", { data: [], error: null });
        type Chain = { select: (s: string) => Chain; eq: (c: string, v: string) => Chain };
        const unbounded = builder as unknown as Chain;
        await expect(
            (async () => await unbounded.select("*").eq("tenant_id", "t1"))()
        ).rejects.toThrow(/senza intervallo/);
    });
});

describe("listPendingReservations", () => {
    it("filtra pending lato server, dalla più vecchia, con tetto esplicito", async () => {
        const { builder, calls } = guardedBuilder("reservations", {
            data: [row("a", "2026-09-01", "pending")],
            error: null
        });
        from.mockReturnValue(builder);

        const page = await listPendingReservations("t1");

        expect(calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
        expect(calls).toContainEqual({
            method: "order",
            args: ["reservation_date", { ascending: true }]
        });
        expect(calls).toContainEqual({ method: "limit", args: [PENDING_QUEUE_LIMIT + 1] });
        expect(page).toEqual({ rows: [row("a", "2026-09-01", "pending")], truncated: false });
    });

    it("una riga oltre il tetto → truncated=true e si restituisce solo il tetto", async () => {
        const data = Array.from({ length: PENDING_QUEUE_LIMIT + 1 }, (_, i) =>
            row(`p${i}`, "2026-09-01", "pending")
        );
        from.mockReturnValue(guardedBuilder("reservations", { data, error: null }).builder);

        const page = await listPendingReservations("t1");

        expect(page.rows).toHaveLength(PENDING_QUEUE_LIMIT);
        expect(page.truncated).toBe(true);
    });
});

describe("il sorgente del service non contiene SELECT illimitate su reservations", () => {
    // Lettura statica del file: ogni blocco `.from("reservations")` che fa
    // `.select(` deve, prima del punto e virgola che lo chiude, avere un
    // intervallo di date, un `limit`, o un filtro per id/singola riga.
    it("ogni .from(\"reservations\").select(...) è limitata", () => {
        const src = readFileSync(
            resolve(__dirname, "../services/supabase/reservations.ts"),
            "utf8"
        );
        const blocks = src.split('.from("reservations")').slice(1).map(b => b.split(";")[0]);
        const selects = blocks.filter(b => b.includes(".select("));
        expect(selects.length).toBeGreaterThan(0);
        for (const b of selects) {
            const bounded =
                (b.includes('.gte("reservation_date"') && b.includes('.lte("reservation_date"')) ||
                b.includes(".limit(") ||
                b.includes('.eq("id"') ||
                b.includes(".single()") ||
                b.includes(".maybeSingle()");
            expect(bounded, `blocco illimitato:\n${b}`).toBe(true);
        }
    });
});

// FASE 5.2b — la ricerca è una query sua, su tutte le date, con tetto.
describe("searchReservations", () => {
    const TODAY = "2026-09-17";

    it("due query con tetto: futuro dalla più vicina, passato dal più recente", async () => {
        const future = guardedBuilder("reservations", { data: [row("f", "2027-03-12")], error: null });
        const past = guardedBuilder("reservations", { data: [row("p", "2025-11-03")], error: null });
        from.mockReturnValueOnce(future.builder).mockReturnValueOnce(past.builder);

        const page = await searchReservations("t1", "Rossi", TODAY);

        expect(from).toHaveBeenCalledTimes(2);
        expect(future.calls).toContainEqual({ method: "or", args: ["customer_name.ilike.%Rossi%"] });
        expect(future.calls).toContainEqual({ method: "gte", args: ["reservation_date", TODAY] });
        expect(future.calls).toContainEqual({ method: "order", args: ["reservation_date", { ascending: true }] });
        expect(future.calls).toContainEqual({ method: "limit", args: [SEARCH_RESULTS_LIMIT + 1] });
        expect(past.calls).toContainEqual({ method: "lt", args: ["reservation_date", TODAY] });
        expect(past.calls).toContainEqual({ method: "order", args: ["reservation_date", { ascending: false }] });
        expect(past.calls).toContainEqual({ method: "limit", args: [SEARCH_RESULTS_LIMIT + 1] });
        expect(page.rows.map(r => r.id)).toEqual(["f", "p"]);
        expect(page.truncated).toBe(false);
    });

    it("lo scope di sede va al server", async () => {
        const a = guardedBuilder("reservations", { data: [], error: null });
        const b = guardedBuilder("reservations", { data: [], error: null });
        from.mockReturnValueOnce(a.builder).mockReturnValueOnce(b.builder);
        await searchReservations("t1", "Rossi", TODAY, "act-1");
        expect(a.calls).toContainEqual({ method: "eq", args: ["activity_id", "act-1"] });
        expect(b.calls).toContainEqual({ method: "eq", args: ["activity_id", "act-1"] });
    });

    it("telefono: un solo like per suffisso su customer_phone_digits, nessun confronto sul client", async () => {
        // FASE 5.4 — la riga con spazi e senza e164 la trova il server: qui
        // torna già dal builder e deve restare, senza filtri a valle.
        const future = guardedBuilder("reservations", {
            data: [
                phoneRow("ok-e164", "2027-03-12", "+39 333 123 4567", "+393331234567"),
                phoneRow("ok-spazi", "2027-05-20", "+39 333 123 4567", null)
            ],
            error: null
        });
        const past = guardedBuilder("reservations", { data: [], error: null });
        from.mockReturnValueOnce(future.builder).mockReturnValueOnce(past.builder);

        const page = await searchReservations("t1", "+39 333 123 4567", TODAY);

        expect(future.calls).toContainEqual({ method: "or", args: ["customer_phone_digits.like.%393331234567"] });
        expect(page.rows.map(r => r.id)).toEqual(["ok-e164", "ok-spazi"]);
    });

    it("oltre il tetto → truncated, e si restituisce solo il tetto, dalla più vicina", async () => {
        const data = Array.from({ length: SEARCH_RESULTS_LIMIT + 1 }, (_, i) =>
            row(`f${i}`, `2027-01-${String((i % 28) + 1).padStart(2, "0")}`)
        );
        from.mockReturnValueOnce(guardedBuilder("reservations", { data, error: null }).builder)
            .mockReturnValueOnce(guardedBuilder("reservations", { data: [], error: null }).builder);

        const page = await searchReservations("t1", "Rossi", TODAY);

        expect(page.rows).toHaveLength(SEARCH_RESULTS_LIMIT);
        expect(page.truncated).toBe(true);
    });

    it("query troppo corta o vuota dopo la pulizia → [] senza rete", async () => {
        expect(await searchReservations("t1", "R", TODAY)).toEqual({ rows: [], truncated: false });
        expect(await searchReservations("t1", "%%", TODAY)).toEqual({ rows: [], truncated: false });
        expect(from).not.toHaveBeenCalled();
    });
});
