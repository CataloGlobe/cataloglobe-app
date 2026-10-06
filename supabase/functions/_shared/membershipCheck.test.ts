import { describe, it, expect, vi } from "vitest";
import { hasActivityPermission, isMemberOfTenant } from "./membershipCheck";

type RpcResult = { data: unknown; error: { message: string } | null };

function fakeClient(result: RpcResult) {
    const rpc = vi.fn(async () => result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { client: { rpc } as any, rpc };
}

describe("isMemberOfTenant", () => {
    it("riconosce il tenant in entrambe le forme della risposta", async () => {
        expect(await isMemberOfTenant(fakeClient({ data: ["t1", "t2"], error: null }).client, "t2"))
            .toEqual({ kind: "ok", member: true });
        expect(await isMemberOfTenant(
            fakeClient({ data: [{ get_my_tenant_ids: "t1" }], error: null }).client,
            "t1"
        )).toEqual({ kind: "ok", member: true });
    });

    it("nega un tenant diverso e riporta l'errore del DB", async () => {
        expect(await isMemberOfTenant(fakeClient({ data: ["t1"], error: null }).client, "t9"))
            .toEqual({ kind: "ok", member: false });
        expect(await isMemberOfTenant(fakeClient({ data: null, error: { message: "boom" } }).client, "t1"))
            .toEqual({ kind: "db_error", message: "boom" });
    });
});

describe("hasActivityPermission", () => {
    it("chiede il permesso sulla sede giusta", async () => {
        const { client, rpc } = fakeClient({ data: true, error: null });
        expect(await hasActivityPermission(client, "orders.manage", "a1", "test")).toBe(true);
        expect(rpc).toHaveBeenCalledWith("has_permission", {
            p_permission_id: "orders.manage",
            p_activity_id: "a1"
        });
    });

    it("nega se la RPC dice false, null o va in errore (fail-closed)", async () => {
        expect(await hasActivityPermission(fakeClient({ data: false, error: null }).client, "orders.manage", "a1", "t")).toBe(false);
        expect(await hasActivityPermission(fakeClient({ data: null, error: null }).client, "orders.manage", "a1", "t")).toBe(false);
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await hasActivityPermission(fakeClient({ data: true, error: { message: "x" } }).client, "orders.manage", "a1", "t")).toBe(false);
        spy.mockRestore();
    });
});
