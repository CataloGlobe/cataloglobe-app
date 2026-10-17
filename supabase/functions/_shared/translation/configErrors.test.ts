import { describe, it, expect, afterEach, vi } from "vitest";
import { TranslationProviderError } from "./TranslationProvider.ts";
import { DeepLProvider } from "./DeepLProvider.ts";

// Chiave DeepL mancante, malformata o rifiutata: stessa classe di errore
// ('config', non retryable) da router e provider. Il router legge `Deno.env` e
// tiene un singleton: ogni caso stubba il global e reimporta il modulo.
type EnvStub = Record<string, string | undefined>;

async function loadRouterWithEnv(env: EnvStub) {
    vi.resetModules();
    (globalThis as { Deno?: unknown }).Deno = {
        env: { get: (key: string) => env[key] }
    };
    return await import("./router.ts");
}

function catchError(fn: () => unknown): unknown {
    try {
        fn();
    } catch (err) {
        return err;
    }
    throw new Error("nessun errore lanciato");
}

// Per nome e non con instanceof: dopo vi.resetModules il router ha la sua
// copia della classe.
function expectConfigError(err: unknown) {
    const e = err as TranslationProviderError;
    expect(e.name).toBe("TranslationProviderError");
    expect(e.category).toBe("config");
    expect(e.retryable).toBe(false);
    expect(e.provider).toBe("deepl");
}

afterEach(() => {
    delete (globalThis as { Deno?: unknown }).Deno;
    vi.unstubAllGlobals();
});

describe("router: chiave DeepL", () => {
    it("chiave mancante -> errore config, non retryable", async () => {
        const { getProviderForLanguage, _resetProviders } = await loadRouterWithEnv({});
        _resetProviders();
        const err = catchError(() => getProviderForLanguage("en"));
        expectConfigError(err);
        expect((err as Error).message).toMatch(/DEEPL_API_KEY non impostata/);
    });

    it("chiave malformata -> stessa classe della chiave mancante", async () => {
        const { getProviderForLanguage, _resetProviders } = await loadRouterWithEnv({
            DEEPL_API_KEY: "corta"
        });
        _resetProviders();
        expectConfigError(catchError(() => getProviderForLanguage("en")));
    });

    it("override mock: nessuna chiave richiesta", async () => {
        const { getProviderForLanguage, _resetProviders } = await loadRouterWithEnv({
            TRANSLATION_PROVIDER: "mock"
        });
        _resetProviders();
        expect(getProviderForLanguage("en").name).toBe("mock");
    });
});

describe("DeepLProvider: chiave rifiutata", () => {
    it.each([401, 403])("status %i -> errore config, non retryable", async (status) => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status }))));
        const provider = new DeepLProvider("chiave-lunga-abbastanza:fx");
        const err = await provider
            .translate({ texts: ["Pasta"], sourceLang: "it", targetLang: "en" })
            .catch((e: unknown) => e);
        expectConfigError(err);
    });

    it("500 resta un errore del server, retryable", async () => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 500 }))));
        const provider = new DeepLProvider("chiave-lunga-abbastanza:fx");
        const err = await provider
            .translate({ texts: ["Pasta"], sourceLang: "it", targetLang: "en" })
            .catch((e: unknown) => e) as TranslationProviderError;
        expect(err.category).toBe("server");
        expect(err.retryable).toBe(true);
    });
});
