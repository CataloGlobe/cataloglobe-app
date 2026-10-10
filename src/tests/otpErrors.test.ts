import { describe, it, expect } from "vitest";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { readVerifyOtpError } from "@/utils/otpErrors";

// verify-otp risponde non-2xx con `{ error, attempts_left?, max_attempts? }`:
// supabase-js lo incapsula in FunctionsHttpError con un message generico e
// `data` null, quindi codice e tentativi vanno letti dalla Response.
function httpError(status: number, body: unknown): FunctionsHttpError {
    return new FunctionsHttpError(
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
    );
}

describe("readVerifyOtpError", () => {
    it("codice sbagliato: invalid_or_expired con i tentativi rimasti", async () => {
        const result = await readVerifyOtpError(
            httpError(400, { error: "invalid_or_expired", attempts_left: 3, max_attempts: 5 })
        );
        expect(result).toEqual({ code: "invalid_or_expired", response: { attempts_left: 3, max_attempts: 5 } });
    });

    it("codice scaduto o assente: invalid_or_expired senza tentativi", async () => {
        const result = await readVerifyOtpError(httpError(400, { error: "invalid_or_expired" }));
        expect(result).toEqual({ code: "invalid_or_expired", response: {} });
    });

    it("codice di lunghezza sbagliata conta come non valido", async () => {
        expect((await readVerifyOtpError(httpError(400, { error: "invalid_code" }))).code).toBe("invalid_or_expired");
    });

    it("bloccato dopo troppi tentativi", async () => {
        const result = await readVerifyOtpError(httpError(429, { error: "locked", attempts_left: 0, max_attempts: 5 }));
        expect(result.code).toBe("locked");
        expect(result.response?.attempts_left).toBe(0);
    });

    it("sessione non valida: unauthorized (anche solo dallo status)", async () => {
        expect((await readVerifyOtpError(httpError(401, { error: "unauthorized" }))).code).toBe("unauthorized");
        expect((await readVerifyOtpError(httpError(401, "non json"))).code).toBe("unauthorized");
    });

    it("guasto del server o rete: unknown", async () => {
        expect((await readVerifyOtpError(httpError(500, { error: "db_error" }))).code).toBe("unknown");
        expect((await readVerifyOtpError(new FunctionsFetchError(new Error("offline")))).code).toBe("unknown");
        expect((await readVerifyOtpError(null)).code).toBe("unknown");
    });
});
