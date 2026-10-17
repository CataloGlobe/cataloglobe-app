import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Con il solo `npm run dev` il proxy di Vite inoltra /api alla 3001 e, senza
// `vercel dev` dietro, risponde 500 con corpo vuoto. In sviluppo la pagina
// pubblica deve caricarsi lo stesso (edge chiamata direttamente); nella build
// il comportamento resta quello di prima.

const invoke = vi.fn();
vi.mock("@/services/supabase/client", () => ({
    supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } }
}));

import { fetchPublicCatalog } from "@/services/publicCatalog/fetchPublicCatalog";

const PAYLOAD = { activity: { slug: "trattoria" } };

function emptyProxyError(): Response {
    return new Response("", { status: 500, headers: { "Content-Type": "text/plain" } });
}

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    invoke.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("fetchPublicCatalog — proxy assente in sviluppo", () => {
    it("in dev, 500 senza corpo dal proxy di Vite → chiama l'edge direttamente", async () => {
        vi.stubEnv("DEV", true);
        fetchMock.mockResolvedValueOnce(emptyProxyError());
        invoke.mockResolvedValueOnce({ data: PAYLOAD, error: null });

        const result = await fetchPublicCatalog({ slug: "trattoria", lang: "en" });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toBe("/api/public-catalog?slug=trattoria&lang=en");
        expect(invoke).toHaveBeenCalledWith("resolve-public-catalog", {
            body: { slug: "trattoria", lang: "en" }
        });
        expect(result).toMatchObject({ kind: "success", payload: PAYLOAD, source: "unknown" });
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("npm run dev:full"));
    });

    it("in dev, un 503 JSON del proxy vero resta un errore di rete (niente scorciatoia)", async () => {
        vi.stubEnv("DEV", true);
        fetchMock.mockResolvedValueOnce(
            jsonResponse(503, { error: { code: "service_unavailable", messageKey: "page.loading_error" } })
        );

        const result = await fetchPublicCatalog({ slug: "trattoria" });

        expect(result.kind).toBe("network_error");
        expect(invoke).not.toHaveBeenCalled();
    });

    it("fuori dal dev (build), lo stesso 500 resta un errore di rete", async () => {
        vi.stubEnv("DEV", false);
        fetchMock.mockResolvedValueOnce(emptyProxyError());

        const result = await fetchPublicCatalog({ slug: "trattoria" });

        expect(result.kind).toBe("network_error");
        expect(invoke).not.toHaveBeenCalled();
    });

    it("in dev, con il proxy che risponde, si usa il proxy", async () => {
        vi.stubEnv("DEV", true);
        fetchMock.mockResolvedValueOnce(jsonResponse(200, PAYLOAD));

        const result = await fetchPublicCatalog({ slug: "trattoria" });

        expect(result).toMatchObject({ kind: "success", payload: PAYLOAD });
        expect(invoke).not.toHaveBeenCalled();
    });
});
