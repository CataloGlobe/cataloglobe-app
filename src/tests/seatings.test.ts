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
    openWalkinSeating,
    closeSeating,
    undoSeating,
    setSeatingTables,
    setSeatingPartySize,
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

    it("senza risposta alla domanda, p_action NON viaggia (il server usa il DEFAULT)", async () => {
        rpc.mockResolvedValue({ data: { id: "s1", status: "closed" }, error: null });
        await closeSeating("s1", "operator", "t1", undefined);
        expect(rpc).toHaveBeenCalledWith("close_seating", {
            p_seating_id: "s1",
            p_reason: "operator"
        });
    });

    it("con la risposta, p_action viaggia", async () => {
        rpc.mockResolvedValue({ data: { id: "s1", status: "closed" }, error: null });
        await closeSeating("s1", "operator", "t1", "cancel");
        expect(rpc).toHaveBeenCalledWith("close_seating", {
            p_seating_id: "s1",
            p_reason: "operator",
            p_action: "cancel"
        });
    });

    it("OPEN_ORDERS_NEED_ACTION non arriva grezzo: italiano, col numero", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { code: "22023", message: "OPEN_ORDERS_NEED_ACTION:2" }
        });
        await expect(closeSeating("s1", "operator", "t1")).rejects.toMatchObject({
            code: "22023",
            message:
                "Ci sono 2 ordini ancora aperti su questa tavolata: vanno chiusi dalle comande prima di concludere il servizio."
        });
    });

    it("GROUP_NOT_VERIFIED (P0001 dal trigger) in italiano", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { code: "P0001", message: "GROUP_NOT_VERIFIED: acknowledge the first order" }
        });
        await expect(closeSeating("s1", "operator", "t1", "deliver")).rejects.toMatchObject({
            code: "P0001",
            message: expect.stringContaining("non sono mai stati confermati dal locale")
        });
    });
});

describe("undoSeating — SEATING_HAS_BILLS dice il motivo vero", () => {
    it("in italiano: annullare lascerebbe i conti senza nessuno a cui attribuirli", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { code: "22023", message: "SEATING_HAS_BILLS: this seating produced orders" }
        });
        await expect(undoSeating("s1", "t1")).rejects.toMatchObject({
            code: "22023",
            message: expect.stringContaining("senza nessuno a cui attribuirli")
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

describe("openWalkinSeating — arriva gente senza prenotazione", () => {
    it("tavoli e coperti facoltativi arrivano alla RPC come sono, anche vuoti/null", async () => {
        rpc.mockResolvedValue({ data: { id: "s1", status: "open" }, error: null });
        await openWalkinSeating("a1", [], null, "t1");
        expect(rpc).toHaveBeenCalledWith("open_walkin_seating", {
            p_activity_id: "a1",
            p_table_ids: [],
            p_party_size: null
        });
    });

    it("42501 → 'Operazione non autorizzata' (sede non tua, o tavolo non di questa sede)", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { code: "42501", message: "FORBIDDEN: one or more tables not accessible" }
        });
        await expect(openWalkinSeating("a1", ["x"], 2, "t1")).rejects.toMatchObject({
            message: "Operazione non autorizzata",
            code: "42501"
        });
    });

    it("22023 tiene il messaggio del server (coperti non positivi, duplicati…)", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { code: "22023", message: "Duplicate table_id in p_table_ids" }
        });
        await expect(openWalkinSeating("a1", ["x", "x"], 2, "t1")).rejects.toMatchObject({
            message: "Duplicate table_id in p_table_ids",
            code: "22023"
        });
    });
});

describe("setSeatingPartySize — i coperti reali", () => {
    it("scrive sulla tavolata, non sulla prenotazione", async () => {
        rpc.mockResolvedValue({ data: { id: "s1", party_size: 5 }, error: null });
        const row = await setSeatingPartySize("s1", 5, "t1");
        expect(rpc).toHaveBeenCalledWith("set_seating_party_size", {
            p_seating_id: "s1",
            p_party_size: 5
        });
        expect(row).toMatchObject({ party_size: 5 });
    });

    it("42501 → 'Operazione non autorizzata'", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { code: "42501", message: "FORBIDDEN: seating not accessible" }
        });
        await expect(setSeatingPartySize("s1", 5, "t1")).rejects.toMatchObject({
            message: "Operazione non autorizzata",
            code: "42501"
        });
    });

    it("22023 tiene il messaggio del server: 'chiusa' e 'non positivo' sono cose diverse", async () => {
        rpc.mockResolvedValue({
            data: null,
            error: {
                code: "22023",
                message:
                    "Only an open seating can change party size (status closed). A closed seating is history."
            }
        });
        await expect(setSeatingPartySize("s1", 5, "t1")).rejects.toMatchObject({
            message:
                "Only an open seating can change party size (status closed). A closed seating is history.",
            code: "22023"
        });
    });
});
