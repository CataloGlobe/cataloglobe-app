import { describe, it, expect } from "vitest";
import { extractBearerJwt, isTenantMember, parseTenantIds } from "./tenantMembership";

describe("tenantMembership — parseTenantIds", () => {
    it("accepts the flat string[] shape of a SETOF uuid RPC", () => {
        expect(parseTenantIds(["a", "b"])).toEqual(["a", "b"]);
    });
    it("accepts the row-object shape ({ get_my_tenant_ids })", () => {
        expect(parseTenantIds([{ get_my_tenant_ids: "a" }, { get_my_tenant_ids: "b" }])).toEqual(["a", "b"]);
    });
    it("ignores anything that is not a string id", () => {
        expect(parseTenantIds([1, null, { other: "x" }, { get_my_tenant_ids: 2 }])).toEqual([]);
        expect(parseTenantIds(null)).toEqual([]);
        expect(parseTenantIds("a")).toEqual([]);
    });
});

describe("tenantMembership — isTenantMember", () => {
    const clientReturning = (data: unknown, error: unknown = null) => ({
        rpc: async (fn: string) => {
            expect(fn).toBe("get_my_tenant_ids");
            return { data, error };
        }
    });

    it("true when the caller's tenant ids include the target", async () => {
        expect(await isTenantMember(clientReturning(["t1", "t2"]), "t2")).toBe(true);
    });
    it("false when the target tenant is not among the caller's", async () => {
        expect(await isTenantMember(clientReturning(["t1"]), "t2")).toBe(false);
    });
    it("fails closed on RPC error (invalid/expired JWT, DB error)", async () => {
        expect(await isTenantMember(clientReturning(null, { message: "JWT expired" }), "t1")).toBe(false);
    });
    it("fails closed when the RPC itself throws", async () => {
        const throwing = {
            rpc: async () => {
                throw new Error("network");
            }
        };
        expect(await isTenantMember(throwing, "t1")).toBe(false);
    });
});

describe("tenantMembership — extractBearerJwt", () => {
    const req = (value: string | null) => ({ headers: { get: () => value } });
    it("extracts the token, case-insensitive on the scheme", () => {
        expect(extractBearerJwt(req("Bearer abc"))).toBe("abc");
        expect(extractBearerJwt(req("bearer abc "))).toBe("abc");
    });
    it("null when missing, empty or not a Bearer scheme", () => {
        expect(extractBearerJwt(req(null))).toBeNull();
        expect(extractBearerJwt(req("Bearer "))).toBeNull();
        expect(extractBearerJwt(req("Basic abc"))).toBeNull();
    });
});
