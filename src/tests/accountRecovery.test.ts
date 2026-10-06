import { describe, it, expect, vi, beforeEach } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

// Il service importa il client Supabase al top-level, che lancia senza env:
// si stubba il modulo. `invoke` risponde come `functions.invoke`.
const invoke = vi.fn();

vi.mock("@/services/supabase/client", () => ({
    supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } }
}));

import { confirmAccountRecovery } from "@/services/supabase/account";

describe("confirmAccountRecovery", () => {
    beforeEach(() => invoke.mockReset());

    it("risolve quando l'edge risponde success: true", async () => {
        invoke.mockResolvedValue({
            data: { success: true, tenants_unlocked: 1, subscriptions_reactivated: 1 },
            error: null
        });

        await expect(confirmAccountRecovery("a@b.it", "123456")).resolves.toBeUndefined();
    });

    // 207 è un 2xx: functions.invoke non lo tratta come errore. L'account è
    // sbloccato ma le aziende no, e il purge le cancella a 30 giorni dal blocco.
    it("lancia partial_success quando le aziende restano bloccate (207)", async () => {
        invoke.mockResolvedValue({
            data: { error: "partial_success", message: "account restored but tenants still locked" },
            error: null
        });

        await expect(confirmAccountRecovery("a@b.it", "123456")).rejects.toThrow("partial_success");
    });

    it("lancia quando un 2xx non dice success: true", async () => {
        invoke.mockResolvedValue({ data: {}, error: null });

        await expect(confirmAccountRecovery("a@b.it", "123456")).rejects.toThrow();
    });

    it("lancia recovery_window_expired sul 410", async () => {
        const error = new FunctionsHttpError(new Response(null, { status: 410 }));
        invoke.mockResolvedValue({ data: null, error });

        await expect(confirmAccountRecovery("a@b.it", "123456")).rejects.toThrow(
            "recovery_window_expired"
        );
    });
});
