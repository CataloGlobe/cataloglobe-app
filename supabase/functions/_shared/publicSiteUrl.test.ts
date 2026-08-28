import { describe, it, expect, afterEach, vi } from "vitest";

// `publicSiteUrl.ts` reads `Deno.env` and keeps a module-level warn-once
// latch, so each case stubs the global and re-imports the module fresh.
type EnvStub = Record<string, string | undefined>;

const TENANT_ID = "11111111-2222-3333-4444-555555555555";

async function loadWithEnv(env: EnvStub) {
    vi.resetModules();
    (globalThis as { Deno?: unknown }).Deno = {
        env: { get: (key: string) => env[key] }
    };
    return await import("./publicSiteUrl.ts");
}

afterEach(() => {
    delete (globalThis as { Deno?: unknown }).Deno;
    vi.restoreAllMocks();
});

describe("getPublicSiteUrl", () => {
    it("returns the configured URL", async () => {
        const { getPublicSiteUrl } = await loadWithEnv({
            APP_URL: "https://cataloglobe.com"
        });
        expect(getPublicSiteUrl()).toBe("https://cataloglobe.com");
    });

    it("strips trailing slashes and surrounding whitespace", async () => {
        const { getPublicSiteUrl } = await loadWithEnv({
            APP_URL: "  https://staging.cataloglobe.com///  "
        });
        expect(getPublicSiteUrl()).toBe("https://staging.cataloglobe.com");
    });

    it("accepts http as well as https", async () => {
        const { getPublicSiteUrl } = await loadWithEnv({
            APP_URL: "http://localhost:5173"
        });
        expect(getPublicSiteUrl()).toBe("http://localhost:5173");
    });

    it("returns null when the variable is absent", async () => {
        const { getPublicSiteUrl } = await loadWithEnv({});
        expect(getPublicSiteUrl()).toBeNull();
    });

    it("returns null when the variable is blank", async () => {
        const { getPublicSiteUrl } = await loadWithEnv({ APP_URL: "   " });
        expect(getPublicSiteUrl()).toBeNull();
    });

    it("rejects a javascript: URL", async () => {
        const { getPublicSiteUrl } = await loadWithEnv({
            APP_URL: "javascript:alert(1)"
        });
        expect(getPublicSiteUrl()).toBeNull();
    });

    it("rejects a data: URL", async () => {
        const { getPublicSiteUrl } = await loadWithEnv({
            APP_URL: "data:text/html,<script>alert(1)</script>"
        });
        expect(getPublicSiteUrl()).toBeNull();
    });

    it("returns null on an unparsable value", async () => {
        const { getPublicSiteUrl } = await loadWithEnv({ APP_URL: "not a url" });
        expect(getPublicSiteUrl()).toBeNull();
    });

    it("returns null instead of throwing when env access is denied", async () => {
        vi.resetModules();
        (globalThis as { Deno?: unknown }).Deno = {
            env: {
                get: () => {
                    throw new Error("permission denied");
                }
            }
        };
        const { getPublicSiteUrl } = await import("./publicSiteUrl.ts");
        expect(getPublicSiteUrl()).toBeNull();
    });

    it("warns only once across repeated calls", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { getPublicSiteUrl } = await loadWithEnv({});
        getPublicSiteUrl();
        getPublicSiteUrl();
        getPublicSiteUrl();
        expect(warn).toHaveBeenCalledTimes(1);
        // No configuration value and no personal data in the log line.
        expect(String(warn.mock.calls[0]?.[0])).toBe(
            "[publicSiteUrl] APP_URL is not set. Emails will be sent without links."
        );
    });
});

describe("buildReservationsDashboardUrl", () => {
    it("builds the /business/:tenantId/reservations URL", async () => {
        const { buildReservationsDashboardUrl } = await loadWithEnv({
            APP_URL: "https://cataloglobe.com"
        });
        expect(buildReservationsDashboardUrl(TENANT_ID)).toBe(
            `https://cataloglobe.com/business/${TENANT_ID}/reservations`
        );
    });

    it("builds on top of a base URL that had a trailing slash", async () => {
        const { buildReservationsDashboardUrl } = await loadWithEnv({
            APP_URL: "https://staging.cataloglobe.com/"
        });
        expect(buildReservationsDashboardUrl(TENANT_ID)).toBe(
            `https://staging.cataloglobe.com/business/${TENANT_ID}/reservations`
        );
    });

    it("returns null when the base URL is unconfigured", async () => {
        const { buildReservationsDashboardUrl } = await loadWithEnv({});
        expect(buildReservationsDashboardUrl(TENANT_ID)).toBeNull();
    });

    it("returns null instead of throwing on a null tenant id", async () => {
        const { buildReservationsDashboardUrl } = await loadWithEnv({
            APP_URL: "https://cataloglobe.com"
        });
        expect(() => buildReservationsDashboardUrl(null)).not.toThrow();
        expect(buildReservationsDashboardUrl(null)).toBeNull();
        expect(buildReservationsDashboardUrl(undefined)).toBeNull();
        expect(buildReservationsDashboardUrl("   ")).toBeNull();
    });

    it("percent-encodes the tenant id", async () => {
        const { buildReservationsDashboardUrl } = await loadWithEnv({
            APP_URL: "https://cataloglobe.com"
        });
        expect(buildReservationsDashboardUrl("a b/../c")).toBe(
            "https://cataloglobe.com/business/a%20b%2F..%2Fc/reservations"
        );
    });
});

describe("buildReservationCancelUrl", () => {
    const TOKEN = "v1.eyJyaWQiOiJ4In0.c2ln";

    it("builds the /:slug/prenotazione/annulla URL with the token in query", async () => {
        const { buildReservationCancelUrl } = await loadWithEnv({
            APP_URL: "https://cataloglobe.com"
        });
        expect(buildReservationCancelUrl("trattoria-da-ciro", TOKEN)).toBe(
            `https://cataloglobe.com/trattoria-da-ciro/prenotazione/annulla?token=${TOKEN}`
        );
    });

    it("builds on top of a base URL that had a trailing slash", async () => {
        const { buildReservationCancelUrl } = await loadWithEnv({
            APP_URL: "https://staging.cataloglobe.com/"
        });
        expect(buildReservationCancelUrl("ciro", TOKEN)).toBe(
            `https://staging.cataloglobe.com/ciro/prenotazione/annulla?token=${TOKEN}`
        );
    });

    it("returns null when the base URL is unconfigured", async () => {
        const { buildReservationCancelUrl } = await loadWithEnv({});
        expect(buildReservationCancelUrl("ciro", TOKEN)).toBeNull();
    });

    it("returns null instead of throwing on missing arguments", async () => {
        const { buildReservationCancelUrl } = await loadWithEnv({
            APP_URL: "https://cataloglobe.com"
        });
        for (const [slug, token] of [
            [null, TOKEN],
            [undefined, TOKEN],
            ["   ", TOKEN],
            ["ciro", null],
            ["ciro", undefined],
            ["ciro", "  "]
        ] as const) {
            expect(() => buildReservationCancelUrl(slug, token)).not.toThrow();
            expect(buildReservationCancelUrl(slug, token)).toBeNull();
        }
    });

    it("percent-encodes slug and token", async () => {
        const { buildReservationCancelUrl } = await loadWithEnv({
            APP_URL: "https://cataloglobe.com"
        });
        expect(buildReservationCancelUrl("a b/../c", "x y&z=1")).toBe(
            "https://cataloglobe.com/a%20b%2F..%2Fc/prenotazione/annulla?token=x%20y%26z%3D1"
        );
    });
});
