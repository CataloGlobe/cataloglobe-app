import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    checkPublicMenu,
    combineDashboard,
    PUBLIC_MENU_STALE_ERROR,
    type CheckResult,
    type CheckStatus
} from "../../../api/_lib/statusServices";
import { DATABASE_PROBE_TIMEOUT_MS, probeDatabase } from "../../../api/_lib/statusSupabase";

function result(serviceKey: CheckResult["serviceKey"], status: CheckStatus, error: string | null = null): CheckResult {
    return { serviceKey, status, responseTimeMs: 120, error };
}

describe("combineDashboard", () => {
    it("tutto su → up, nessun errore, tempo dell'HTML", () => {
        const d = combineDashboard(result("dashboard", "up"), result("database", "up"), {
            status: "up",
            error: null
        });
        expect(d).toEqual({ serviceKey: "dashboard", status: "up", responseTimeMs: 120, error: null });
    });

    it("HTML su ma database giù → down, l'errore nomina il database", () => {
        const d = combineDashboard(
            result("dashboard", "up"),
            result("database", "down", "Timeout >10s"),
            { status: "up", error: null }
        );
        expect(d.status).toBe("down");
        expect(d.error).toContain("Database non disponibile");
        expect(d.error).toContain("Timeout >10s");
    });

    it("auth giù → down anche con HTML e database su", () => {
        const d = combineDashboard(result("dashboard", "up"), result("database", "up"), {
            status: "down",
            error: "Autenticazione: HTTP 503"
        });
        expect(d.status).toBe("down");
        expect(d.error).toBe("Autenticazione: HTTP 503");
    });

    it("vince il peggiore: database lento (degraded) + auth giù → down, entrambi nell'errore", () => {
        const d = combineDashboard(result("dashboard", "up"), result("database", "degraded"), {
            status: "down",
            error: "Autenticazione: HTTP 500"
        });
        expect(d.status).toBe("down");
        expect(d.error).toContain("Database lento");
        expect(d.error).toContain("Autenticazione: HTTP 500");
    });

    it("solo database lento → degraded", () => {
        const d = combineDashboard(result("dashboard", "up"), result("database", "degraded"), {
            status: "up",
            error: null
        });
        expect(d.status).toBe("degraded");
    });
});

describe("checkPublicMenu", () => {
    beforeEach(() => {
        vi.stubEnv("STATUS_TARGET_BASE_URL", "https://staging.example.test");
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    function stubMenuResponse(headers: Record<string, string>) {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                new Response(JSON.stringify({ business: { id: "x" } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", ...headers }
                })
            )
        );
    }

    it("risposta live → up", async () => {
        stubMenuResponse({ "X-Cataloglobe-Source": "live" });
        const r = await checkPublicMenu();
        expect(r.status).toBe("up");
        expect(r.error).toBeNull();
    });

    it("snapshot di riserva (X-Cataloglobe-Source: stale) → degraded con errore che lo spiega", async () => {
        stubMenuResponse({ "X-Cataloglobe-Source": "stale" });
        const r = await checkPublicMenu();
        expect(r.status).toBe("degraded");
        expect(r.error).toBe(PUBLIC_MENU_STALE_ERROR);
    });
});

describe("probeDatabase", () => {
    beforeEach(() => {
        vi.stubEnv("SUPABASE_URL", "https://db.example.test");
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("passa un tetto alla richiesta e su timeout dà ok:false «Timeout >10s», senza lanciare", async () => {
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            expect(init?.signal).toBeInstanceOf(AbortSignal);
            throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
        });
        vi.stubGlobal("fetch", fetchMock);
        const r = await probeDatabase();
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(r.ok).toBe(false);
        expect(r.error).toBe(`Timeout >${DATABASE_PROBE_TIMEOUT_MS / 1000}s`);
    });

    it("risposta 200 → ok", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
        const r = await probeDatabase();
        expect(r.ok).toBe(true);
    });
});
