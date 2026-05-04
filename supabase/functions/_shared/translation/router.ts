// =============================================================================
// Provider router (Edge-only)
// =============================================================================
//
// Selezione provider per lingua target. MVP logic:
//   - Mock provider se env var TRANSLATION_PROVIDER='mock' (CI / dev locale).
//   - Altrimenti DeepL per tutte le lingue supportate.
//
// v1.1 logic: Google fallback per lingue non DeepL (hindi, vietnamita
// extended, ecc.). Hook strutturato sotto come placeholder commentato.
//
// Singleton pattern: provider instanziati lazy alla prima richiesta. La
// DeepL key viene letta UNA SOLA VOLTA dall'env (Deno.env.get) — restart
// edge function richiesto se la key cambia in produzione.
//
// Ref: docs/translations-architecture-v3.md sez. 5.2, 5.4.
// =============================================================================

import type { TranslationProvider } from "./TranslationProvider.ts";
import { DeepLProvider } from "./DeepLProvider.ts";
import { MockProvider } from "./MockProvider.ts";

/**
 * Restituisce il provider per la lingua target richiesta.
 *
 * @throws Error se la lingua non è supportata da nessun provider attivo,
 *               o se la DEEPL_API_KEY non è configurata e non c'è override mock.
 */
export function getProviderForLanguage(targetLang: string): TranslationProvider {
    const providerOverride = Deno.env.get("TRANSLATION_PROVIDER");
    if (providerOverride === "mock") {
        return getMockProvider();
    }

    const deepl = getDeepLProvider();
    if (deepl.supportedLanguages.includes(targetLang.toLowerCase())) {
        return deepl;
    }

    // v1.1: Google fallback
    // const google = getGoogleProvider();
    // if (google.supportedLanguages.includes(targetLang.toLowerCase())) return google;

    throw new Error(`Lingua non supportata da nessun provider: ${targetLang}`);
}

// Singleton instances (lazy) ---------------------------------------------------

let deepLInstance: DeepLProvider | null = null;
function getDeepLProvider(): DeepLProvider {
    if (deepLInstance === null) {
        const apiKey = Deno.env.get("DEEPL_API_KEY");
        if (!apiKey) {
            throw new Error(
                "DEEPL_API_KEY non impostata. Configurare nel Supabase Edge Function " +
                "secrets (Settings → Edge Functions → Secrets) prima di chiamare il " +
                "job processor."
            );
        }
        deepLInstance = new DeepLProvider(apiKey);
    }
    return deepLInstance;
}

let mockInstance: MockProvider | null = null;
function getMockProvider(): MockProvider {
    if (mockInstance === null) {
        mockInstance = new MockProvider();
    }
    return mockInstance;
}

/**
 * Reset singleton instances. Usato solo nei test per swappare provider tra
 * casi. NON chiamare in produzione: il fetch della key dall'env riavviene
 * solo al successivo getProviderForLanguage.
 */
export function _resetProviders(): void {
    deepLInstance = null;
    mockInstance = null;
}
