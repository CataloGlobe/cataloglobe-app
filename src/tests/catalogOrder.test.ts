import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const revalidate = vi.fn();
const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    result: { data: null as unknown, error: null as unknown },
};
vi.mock("@/services/supabase/client", () => ({
    supabase: {
        rpc: (...args: unknown[]) => rpc(...args),
        from: () => query,
    },
}));
vi.mock("@services/publicCatalog/revalidatePublicCatalog", () => ({
    revalidatePublicCatalogForTenant: (...args: unknown[]) => revalidate(...args),
}));

import { listCatalogOrder, reorderCatalogs } from "@/services/supabase/catalogOrder";

beforeEach(() => {
    rpc.mockReset();
    revalidate.mockReset();
    query.select.mockReset().mockReturnValue(query);
    query.eq.mockReset().mockReturnValue(query);
    // la seconda `order` chiude la catena
    query.order
        .mockReset()
        .mockReturnValueOnce(query)
        .mockImplementationOnce(() => Promise.resolve(query.result));
});

describe("listCatalogOrder — l'ordine dei clienti", () => {
    it("per sort_order, poi il più nuovo", async () => {
        query.result = { data: [{ id: "bar", name: "Bar" }], error: null };
        await expect(listCatalogOrder("t1")).resolves.toEqual([{ id: "bar", name: "Bar" }]);
        expect(query.eq).toHaveBeenCalledWith("tenant_id", "t1");
        expect(query.order.mock.calls).toEqual([
            ["sort_order", { ascending: true }],
            ["created_at", { ascending: false }],
        ]);
    });

    it("rilancia l'errore del database", async () => {
        const error = { code: "42703", message: "column catalogs.sort_order does not exist" };
        query.result = { data: null, error };
        await expect(listCatalogOrder("t1")).rejects.toBe(error);
    });
});

describe("reorderCatalogs — una RPC con tutto l'elenco", () => {
    it("manda azienda ed elenco, poi rinfresca la pagina pubblica", async () => {
        rpc.mockResolvedValue({ data: null, error: null });
        await reorderCatalogs("t1", ["gelato", "bar", "cena"]);
        expect(rpc).toHaveBeenCalledWith("reorder_catalogs", {
            p_tenant_id: "t1",
            p_catalog_ids: ["gelato", "bar", "cena"],
        });
        expect(revalidate).toHaveBeenCalledWith("t1");
    });

    it("errore del database: rilancia e non rinfresca", async () => {
        const error = { code: "22023", message: "L'elenco non corrisponde ai menù dell'azienda" };
        rpc.mockResolvedValue({ data: null, error });
        await expect(reorderCatalogs("t1", ["bar"])).rejects.toBe(error);
        expect(revalidate).not.toHaveBeenCalled();
    });
});
