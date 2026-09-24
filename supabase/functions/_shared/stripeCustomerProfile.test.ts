import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    buildCustomerAddress,
    buildCustomerDescription,
    buildCustomerMetadata,
    buildCustomerName,
    buildCustomerProfileUpdate,
    buildEuVatValue,
    buildStripeCustomerProfile,
    syncCustomerTaxId,
    syncStripeCustomerProfile,
    type StripeCustomersApi,
    type TenantFiscal
} from "./stripeCustomerProfile.ts";

afterEach(() => vi.restoreAllMocks());

const TENANT = "11111111-1111-1111-1111-111111111111";

const COMPANY: TenantFiscal = {
    legal_entity_type: "societa",
    legal_name: "  Trattoria Da Mario S.r.l. ",
    vat_number: "12345678911",
    fiscal_code: "",
    codice_destinatario: "ABC1234",
    pec: null,
    address: "Via Roma",
    street_number: "10",
    postal_code: "20100",
    city: "Milano",
    province: "MI",
    country: "IT"
};

describe("builders", () => {
    it("name: legal_name trimmed, else first + last, else undefined", () => {
        expect(buildCustomerName(COMPANY)).toBe("Trattoria Da Mario S.r.l.");
        expect(buildCustomerName({ first_name: "Anna", last_name: " Rossi " })).toBe("Anna Rossi");
        expect(buildCustomerName({ first_name: " ", last_name: null })).toBeUndefined();
    });

    it("address: line1 = street + number, country default IT, undefined when empty", () => {
        expect(buildCustomerAddress(COMPANY)).toEqual({
            country: "IT",
            line1: "Via Roma 10",
            postal_code: "20100",
            city: "Milano",
            state: "MI"
        });
        expect(buildCustomerAddress({ city: "Roma" })).toEqual({ country: "IT", city: "Roma" });
        expect(buildCustomerAddress({ country: "IT" })).toBeUndefined();
    });

    it("eu vat: country-prefixed, uppercase, no spaces, null when absent", () => {
        expect(buildEuVatValue("123 456 789 11", "IT")).toBe("IT12345678911");
        expect(buildEuVatValue("it12345678911", null)).toBe("IT12345678911");
        expect(buildEuVatValue("12345678911", null)).toBe("IT12345678911");
        expect(buildEuVatValue("  ", "IT")).toBeNull();
        expect(buildEuVatValue(null, "IT")).toBeNull();
    });

    it("metadata: tenant_id + non-empty fiscal keys only", () => {
        expect(buildCustomerMetadata(TENANT, COMPANY)).toEqual({
            tenant_id: TENANT,
            legal_entity_type: "societa",
            legal_name: "Trattoria Da Mario S.r.l.",
            vat_number: "12345678911",
            codice_destinatario: "ABC1234"
        });
    });

    it("description: name · city (type)", () => {
        expect(buildCustomerDescription(COMPANY)).toBe("Trattoria Da Mario S.r.l. · Milano (societa)");
        expect(buildCustomerDescription({})).toBeUndefined();
    });

    it("profile clamps name to the Stripe limit", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const profile = buildStripeCustomerProfile(TENANT, { legal_name: "x".repeat(700) });
        expect(Array.from(profile.name ?? "")).toHaveLength(256);
        expect(profile.euVatValue).toBeNull();
        warn.mockRestore();
    });

    it("profile update: empty fields unset on Stripe, never email / user_id", () => {
        const update = buildCustomerProfileUpdate(TENANT, { first_name: "Anna", last_name: "Rossi" });
        expect(update.name).toBe("Anna Rossi");
        expect(update.address).toBe("");
        expect(update.preferred_locales).toEqual(["it"]);
        expect(update.metadata.tenant_id).toBe(TENANT);
        expect(update.metadata.first_name).toBe("Anna");
        expect(update.metadata.vat_number).toBe("");
        expect(update.metadata.pec).toBe("");
        expect(update).not.toHaveProperty("email");
        expect(update.metadata).not.toHaveProperty("user_id");
    });
});

type TaxId = { id: string; type: string; value: string };

function fakeStripe(taxIds: TaxId[], overrides: Partial<StripeCustomersApi["customers"]> = {}) {
    const customers = {
        update: vi.fn(async () => ({})),
        listTaxIds: vi.fn(async () => ({ data: [...taxIds] })),
        createTaxId: vi.fn(async () => ({})),
        deleteTaxId: vi.fn(async () => ({})),
        ...overrides
    };
    return { customers } as unknown as StripeCustomersApi & { customers: typeof customers };
}

function stripeError(code: string) {
    return Object.assign(new Error("Stripe says IT12345678911 is bad"), { code, type: "StripeInvalidRequestError", statusCode: 400 });
}

describe("syncCustomerTaxId", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("unchanged when the only eu_vat already matches", async () => {
        const stripe = fakeStripe([{ id: "txi_1", type: "eu_vat", value: "IT12345678911" }]);
        expect(await syncCustomerTaxId(stripe, "cus_1", "IT12345678911")).toBe("unchanged");
        expect(stripe.customers.createTaxId).not.toHaveBeenCalled();
        expect(stripe.customers.deleteTaxId).not.toHaveBeenCalled();
    });

    it("creates the new eu_vat, deletes the stale one, leaves other types alone", async () => {
        const stripe = fakeStripe([
            { id: "txi_old", type: "eu_vat", value: "IT01234567897" },
            { id: "txi_gb", type: "gb_vat", value: "GB123456789" }
        ]);
        expect(await syncCustomerTaxId(stripe, "cus_1", "IT12345678911")).toBe("updated");
        expect(stripe.customers.createTaxId).toHaveBeenCalledWith("cus_1", { type: "eu_vat", value: "IT12345678911" });
        expect(stripe.customers.deleteTaxId).toHaveBeenCalledTimes(1);
        expect(stripe.customers.deleteTaxId).toHaveBeenCalledWith("cus_1", "txi_old");
    });

    it("creates before deleting", async () => {
        const order: string[] = [];
        const stripe = fakeStripe([{ id: "txi_old", type: "eu_vat", value: "IT01234567897" }], {
            createTaxId: vi.fn(async () => { order.push("create"); return {}; }),
            deleteTaxId: vi.fn(async () => { order.push("delete"); return {}; })
        });
        await syncCustomerTaxId(stripe, "cus_1", "IT12345678911");
        expect(order).toEqual(["create", "delete"]);
    });

    it("keeps a matching eu_vat and deletes duplicates of other values", async () => {
        const stripe = fakeStripe([
            { id: "txi_ok", type: "eu_vat", value: "it12345678911" },
            { id: "txi_old", type: "eu_vat", value: "IT01234567897" }
        ]);
        expect(await syncCustomerTaxId(stripe, "cus_1", "IT12345678911")).toBe("updated");
        expect(stripe.customers.createTaxId).not.toHaveBeenCalled();
        expect(stripe.customers.deleteTaxId).toHaveBeenCalledWith("cus_1", "txi_old");
    });

    it("removes every eu_vat when the P.IVA is empty", async () => {
        const stripe = fakeStripe([
            { id: "txi_a", type: "eu_vat", value: "IT01234567897" },
            { id: "txi_b", type: "eu_vat", value: "IT12345678911" }
        ]);
        expect(await syncCustomerTaxId(stripe, "cus_1", null)).toBe("removed");
        expect(stripe.customers.deleteTaxId).toHaveBeenCalledTimes(2);
        expect(stripe.customers.createTaxId).not.toHaveBeenCalled();
    });

    it("unchanged when the P.IVA is empty and there is no eu_vat", async () => {
        const stripe = fakeStripe([]);
        expect(await syncCustomerTaxId(stripe, "cus_1", null)).toBe("unchanged");
    });

    it("customer_missing when Stripe no longer has the customer", async () => {
        const stripe = fakeStripe([], { listTaxIds: vi.fn(async () => { throw stripeError("resource_missing"); }) });
        expect(await syncCustomerTaxId(stripe, "cus_gone", "IT12345678911")).toBe("customer_missing");
    });

    it("rejected create: still removes the stale value, returns error, never throws", async () => {
        const stripe = fakeStripe([{ id: "txi_old", type: "eu_vat", value: "IT01234567897" }], {
            createTaxId: vi.fn(async () => { throw stripeError("tax_id_invalid"); })
        });
        expect(await syncCustomerTaxId(stripe, "cus_1", "IT12345678911")).toBe("error");
        expect(stripe.customers.deleteTaxId).toHaveBeenCalledWith("cus_1", "txi_old");
    });

    it("logs never contain the VAT value or the Stripe message", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const stripe = fakeStripe([], { createTaxId: vi.fn(async () => { throw stripeError("tax_id_invalid"); }) });
        await syncCustomerTaxId(stripe, "cus_1", "IT12345678911");
        const logged = warn.mock.calls.flat().join(" ");
        expect(logged).toContain("tax_id_invalid");
        expect(logged).not.toContain("12345678911");
    });
});

describe("syncStripeCustomerProfile", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("updates profile without email / user_id, then aligns tax id", async () => {
        const stripe = fakeStripe([{ id: "txi_old", type: "eu_vat", value: "IT01234567897" }]);
        expect(await syncStripeCustomerProfile(stripe, "cus_1", TENANT, COMPANY)).toBe("updated");
        const params = stripe.customers.update.mock.calls[0][1] as Record<string, unknown>;
        expect(params).not.toHaveProperty("email");
        expect(params.metadata).not.toHaveProperty("user_id");
        expect(params.name).toBe("Trattoria Da Mario S.r.l.");
        expect(stripe.customers.createTaxId).toHaveBeenCalledWith("cus_1", { type: "eu_vat", value: "IT12345678911" });
        expect(stripe.customers.deleteTaxId).toHaveBeenCalledWith("cus_1", "txi_old");
    });

    it("customer_missing on update skips the tax id step", async () => {
        const stripe = fakeStripe([], { update: vi.fn(async () => { throw stripeError("resource_missing"); }) });
        expect(await syncStripeCustomerProfile(stripe, "cus_gone", TENANT, COMPANY)).toBe("customer_missing");
        expect(stripe.customers.listTaxIds).not.toHaveBeenCalled();
    });

    it("error on update still aligns tax id, returns error", async () => {
        const stripe = fakeStripe([], { update: vi.fn(async () => { throw stripeError("api_error"); }) });
        expect(await syncStripeCustomerProfile(stripe, "cus_1", TENANT, COMPANY)).toBe("error");
        expect(stripe.customers.createTaxId).toHaveBeenCalled();
    });
});
