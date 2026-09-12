import { describe, it, expect, vi, beforeEach } from "vitest";

// Il service importa il client Supabase al top-level (`export const supabase`),
// che lancia senza env: si stubba il modulo e si controlla cosa restituisce.
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: {
        rpc: (...args: unknown[]) => rpc(...args),
        from: (...args: unknown[]) => from(...args)
    }
}));

import {
    openSeatingForReservation,
    closeSeating,
    undoSeating,
    setSeatingTables,
    getSeatingForReservation
} from "@/services/supabase/seatings";

/**
 * Builder PostgREST finto: ogni metodo incatenabile ritorna `this`, e la
 * catena si risolve con `result` su `maybeSingle()` o su `await`.
 */
function queryBuilder(result: { data: unknown; error: unknown }) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit"]) {
        builder[method] = () => builder;
    }
    builder.maybeSingle = () => Promise.resolve(result);
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
}

beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
});

describe("mapping degli errori RPC", () => {
    // 42501 è l'errore uniforme delle RPC: significa sia "non esiste" sia
    // "non è tua", e il frontend non deve provare a distinguerli — è proprio
    // la distinzione che il server rifiuta di fare per non fare da oracolo di
    // esistenza di uuid altrui.
    it("42501 diventa un messaggio di autorizzazione, non il testo del server", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { code: "42501", message: "FORBIDDEN: reservation not accessible" }
        });

        await expect(openSeatingForReservation("r1", "t1")).rejects.toMatchObject({
            message: "Operazione non autorizzata",
            code: "42501"
        });
    });

    it("42501 conserva il testo originale in `details`", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { code: "42501", message: "FORBIDDEN: seating not accessible" }
        });

        const err = await undoSeating("s1", "t1").then(
            () => null,
            (e: unknown) => e as Error & { details?: string }
        );
        expect(err?.details).toBe("FORBIDDEN: seating not accessible");
    });

    it("22023 tiene il messaggio DEL SERVER", async () => {
        // Le RPC usano 22023 per dire cose diverse fra loro; sostituirle tutte
        // con "Richiesta non valida" toglierebbe all'operatore l'unica
        // informazione utile che riceve.
        rpc.mockResolvedValue({
            data: null,
            error: {
                code: "22023",
                message: "Reservation must be confirmed before seating (status pending)"
            }
        });

        await expect(openSeatingForReservation("r1", "t1")).rejects.toMatchObject({
            message: "Reservation must be confirmed before seating (status pending)",
            code: "22023"
        });
    });

    it("22023 senza messaggio ha comunque una frase leggibile", async () => {
        rpc.mockResolvedValue({ data: null, error: { code: "22023" } });
        await expect(undoSeating("s1", "t1")).rejects.toMatchObject({
            message: "Richiesta non valida"
        });
    });

    it("un codice sconosciuto passa con il suo messaggio", async () => {
        rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
        await expect(closeSeating("s1", "operator", "t1")).rejects.toMatchObject({
            message: "connection failure",
            code: "08006"
        });
    });

    it("lo stesso mapping vale per tutte le scritture", async () => {
        rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "nope" } });
        for (const call of [
            () => openSeatingForReservation("r1", "t1"),
            () => closeSeating("s1", "operator", "t1"),
            () => undoSeating("s1", "t1"),
            () => setSeatingTables("s1", [], "t1")
        ]) {
            await expect(call()).rejects.toMatchObject({ message: "Operazione non autorizzata" });
        }
    });
});

describe("closeSeating — il motivo viaggia fino alla RPC", () => {
    it("dalla dashboard è sempre 'operator'", async () => {
        rpc.mockResolvedValue({ data: { id: "s1", status: "closed" }, error: null });
        await closeSeating("s1", "operator", "t1");
        expect(rpc).toHaveBeenCalledWith("close_seating", {
            p_seating_id: "s1",
            p_reason: "operator"
        });
    });
});

describe("setSeatingTables — filtro difensivo sul tenant", () => {
    it("scarta le righe di un altro tenant", async () => {
        rpc.mockResolvedValue({
            data: [
                { id: "st1", tenant_id: "t1", table_id: "tb1" },
                { id: "st2", tenant_id: "ALTRO", table_id: "tb2" }
            ],
            error: null
        });

        const rows = await setSeatingTables("s1", ["tb1", "tb2"], "t1");
        expect(rows.map(r => r.id)).toEqual(["st1"]);
    });

    it("l'array vuoto è ammesso e arriva alla RPC come tale", async () => {
        // A differenza di `setReservationTables`, dove l'array vuoto è un
        // errore: una tavolata senza tavoli è uno stato legittimo.
        rpc.mockResolvedValue({ data: [], error: null });
        await setSeatingTables("s1", [], "t1");
        expect(rpc).toHaveBeenCalledWith("set_seating_tables", {
            p_seating_id: "s1",
            p_table_ids: []
        });
    });
});

describe("getSeatingForReservation", () => {
    it("ritorna null invece di lanciare quando non c'è tavolata", async () => {
        // È il caso NORMALE: la stragrande maggioranza delle prenotazioni non
        // ha nessuno seduto. Lanciare costringerebbe ogni apertura di drawer a
        // un try/catch per un esito previsto.
        from.mockReturnValue(queryBuilder({ data: null, error: null }));
        await expect(getSeatingForReservation("r1", "t1")).resolves.toBeNull();
    });

    it("ritorna la tavolata senza l'embed usato per filtrare", async () => {
        from.mockReturnValue(
            queryBuilder({
                data: {
                    id: "s1",
                    tenant_id: "t1",
                    status: "open",
                    seating_reservations: [{ reservation_id: "r1" }]
                },
                error: null
            })
        );

        const seating = await getSeatingForReservation("r1", "t1");
        expect(seating).toEqual({ id: "s1", tenant_id: "t1", status: "open" });
        expect(seating).not.toHaveProperty("seating_reservations");
    });

    it("un errore vero continua a propagarsi", async () => {
        // "Nessuna tavolata" e "la query è fallita" non vanno collassati: il
        // secondo va visto, non trattato come assenza.
        from.mockReturnValue(
            queryBuilder({ data: null, error: { code: "PGRST301", message: "JWT expired" } })
        );
        await expect(getSeatingForReservation("r1", "t1")).rejects.toMatchObject({
            code: "PGRST301"
        });
    });
});
