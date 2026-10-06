import { describe, it, expect, vi } from "vitest";
import { claimStripeCustomer, type StripeCustomerClaimDeps } from "./stripeCustomerClaim";

function deps(over: Partial<StripeCustomerClaimDeps> = {}) {
    return {
        saveIfEmpty: vi.fn(async () => ({ saved: true, error: null })),
        readCurrent: vi.fn(async () => ({ customerId: null, error: null })),
        deleteCustomer: vi.fn(async () => {}),
        ...over
    };
}

describe("claimStripeCustomer", () => {
    it("primo checkout: salva il proprio customer e non cancella nulla", async () => {
        const d = deps();
        expect(await claimStripeCustomer("cus_new", d)).toEqual({ kind: "ok", customerId: "cus_new", lostRace: false });
        expect(d.readCurrent).not.toHaveBeenCalled();
        expect(d.deleteCustomer).not.toHaveBeenCalled();
    });

    it("checkout in parallelo: usa il customer del vincitore e cancella il proprio", async () => {
        const d = deps({
            saveIfEmpty: vi.fn(async () => ({ saved: false, error: null })),
            readCurrent: vi.fn(async () => ({ customerId: "cus_winner", error: null }))
        });
        expect(await claimStripeCustomer("cus_new", d)).toEqual({ kind: "ok", customerId: "cus_winner", lostRace: true });
        expect(d.deleteCustomer).toHaveBeenCalledWith("cus_new");
    });

    it("la cancellazione che fallisce non blocca il checkout", async () => {
        const d = deps({
            saveIfEmpty: vi.fn(async () => ({ saved: false, error: null })),
            readCurrent: vi.fn(async () => ({ customerId: "cus_winner", error: null })),
            deleteCustomer: vi.fn(async () => { throw new Error("stripe down"); })
        });
        expect(await claimStripeCustomer("cus_new", d)).toMatchObject({ kind: "ok", customerId: "cus_winner" });
    });

    it("errori del DB e stato inatteso fermano il checkout", async () => {
        expect(await claimStripeCustomer("cus_new", deps({
            saveIfEmpty: vi.fn(async () => ({ saved: false, error: "boom" }))
        }))).toEqual({ kind: "db_error", message: "boom" });
        expect(await claimStripeCustomer("cus_new", deps({
            saveIfEmpty: vi.fn(async () => ({ saved: false, error: null })),
            readCurrent: vi.fn(async () => ({ customerId: null, error: "read" }))
        }))).toEqual({ kind: "db_error", message: "read" });
        expect((await claimStripeCustomer("cus_new", deps({
            saveIfEmpty: vi.fn(async () => ({ saved: false, error: null }))
        }))).kind).toBe("db_error");
    });
});
