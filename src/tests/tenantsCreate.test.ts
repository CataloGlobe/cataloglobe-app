import { describe, it, expect, vi, beforeEach } from "vitest";

// Il service importa il client Supabase al top-level, che lancia senza env:
// si stubba il modulo. `from` riceve una coda di risultati, uno per chiamata.
const from = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: { from: (...args: unknown[]) => from(...args) }
}));
vi.mock("@services/publicCatalog/revalidatePublicCatalog", () => ({
    revalidatePublicCatalogForTenant: vi.fn()
}));

import { createTenant, updateTenantPlanSelection, type CreateTenantInput } from "@/services/supabase/tenants";

type Result = { data: unknown; error: unknown };

/** Builder PostgREST finto: metodi incatenabili, si risolve con `result`. */
function queryBuilder(result: Result) {
    const calls: Record<string, unknown[][]> = {};
    const builder: Record<string, unknown> = { calls };
    for (const method of ["insert", "update", "select", "eq"]) {
        builder[method] = (...args: unknown[]) => {
            (calls[method] ??= []).push(args);
            return builder;
        };
    }
    builder.single = () => Promise.resolve(result);
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return builder as Record<string, unknown> & { calls: Record<string, unknown[][]> };
}

function queue(...results: Result[]) {
    const builders = results.map(queryBuilder);
    let i = 0;
    from.mockImplementation(() => builders[i++]);
    return builders;
}

const input: CreateTenantInput = {
    ownerUserId: "user-1",
    name: "Trattoria",
    verticalType: "food_beverage",
    businessSubtype: "restaurant",
    idempotencyKey: "idem-1",
    billing: {
        legal_entity_type: "societa",
        legal_name: "Trattoria srl",
        vat_number: "12345678903",
        fiscal_code: null,
        first_name: null,
        last_name: null,
        pec: null,
        codice_destinatario: "ABC1234",
        address: "Via Roma",
        street_number: "1",
        postal_code: "20100",
        city: "Milano",
        province: "MI",
        country: "IT"
    }
};

beforeEach(() => {
    from.mockReset();
});

describe("createTenant", () => {
    it("inserisce owner, chiave e dati fiscali e ritorna l'id", async () => {
        const [insert] = queue({ data: { id: "t-1" }, error: null });

        await expect(createTenant(input)).resolves.toBe("t-1");
        expect(from).toHaveBeenCalledWith("tenants");
        const row = insert.calls.insert[0][0] as Record<string, unknown>;
        expect(row).toMatchObject({
            owner_user_id: "user-1",
            name: "Trattoria",
            vertical_type: "food_beverage",
            business_subtype: "restaurant",
            creation_idempotency_key: "idem-1",
            vat_number: "12345678903",
            codice_destinatario: "ABC1234",
            country: "IT"
        });
    });

    it("23505 sulla chiave: rilegge il tenant esistente con stessa chiave e owner", async () => {
        const [, recover] = queue(
            { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"tenants_creation_idempotency_key_uidx\"" } },
            { data: { id: "t-existing" }, error: null }
        );

        await expect(createTenant(input)).resolves.toBe("t-existing");
        expect(recover.calls.eq).toEqual([
            ["creation_idempotency_key", "idem-1"],
            ["owner_user_id", "user-1"]
        ]);
    });

    it("23505 e recupero fallito: tenant_create_failed col SQLSTATE dell'insert", async () => {
        queue(
            { data: null, error: { code: "23505", message: "duplicate key" } },
            { data: null, error: { code: "PGRST116", message: "no rows" } }
        );

        await expect(createTenant(input)).rejects.toMatchObject({ name: "tenant_create_failed", code: "23505" });
    });

    it("23514 dal CHECK sulla P.IVA → invalid_vat_number", async () => {
        queue({
            data: null,
            error: { code: "23514", message: "new row for relation \"tenants\" violates check constraint \"tenants_vat_number_valid\"" }
        });

        await expect(createTenant(input)).rejects.toMatchObject({ name: "invalid_vat_number", code: "23514" });
    });

    it("23514 da un altro CHECK non è un rifiuto della P.IVA", async () => {
        queue({
            data: null,
            error: { code: "23514", message: "violates check constraint \"tenants_business_subtype_check\"" }
        });

        await expect(createTenant(input)).rejects.toMatchObject({ name: "tenant_create_failed", code: "23514" });
    });

    it("22023 dal trigger del recapito → missing_einvoice_recipient", async () => {
        queue({ data: null, error: { code: "22023", message: "missing_einvoice_recipient" } });

        await expect(createTenant(input)).rejects.toMatchObject({ name: "missing_einvoice_recipient", code: "22023" });
    });

    it("errore qualsiasi → tenant_create_failed col suo SQLSTATE, senza recupero", async () => {
        queue({ data: null, error: { code: "42501", message: "permission_denied" } });

        await expect(createTenant(input)).rejects.toMatchObject({ name: "tenant_create_failed", code: "42501" });
        expect(from).toHaveBeenCalledTimes(1);
    });
});

describe("updateTenantPlanSelection", () => {
    it("scrive plan, paid_seats e billing_interval sul tenant", async () => {
        const [update] = queue({ data: null, error: null });

        await updateTenantPlanSelection("t-1", { plan: "pro", paidSeats: 3, billingInterval: "year" });
        expect(update.calls.update[0][0]).toEqual({ plan: "pro", paid_seats: 3, billing_interval: "year" });
        expect(update.calls.eq[0]).toEqual(["id", "t-1"]);
    });

    it("errore → tenant_align_failed col SQLSTATE", async () => {
        queue({ data: null, error: { code: "42501", message: "permission_denied" } });

        await expect(
            updateTenantPlanSelection("t-1", { plan: "pro", paidSeats: 1, billingInterval: "month" })
        ).rejects.toMatchObject({ name: "tenant_align_failed", code: "42501" });
    });
});
