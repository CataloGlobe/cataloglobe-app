// =============================================================================
// MockProvider — provider per test/dev (Edge-only)
// =============================================================================
//
// Output: ogni testo prefissato con [LANG] (es. "Pasta al ragù" →
// "[EN] Pasta al ragù"). Idempotente, deterministico, niente network.
//
// NON usare in produzione. Selezionato dal router quando env var
// TRANSLATION_PROVIDER='mock' (CI o sviluppo locale).
//
// Ref: docs/translations-architecture-v3.md sez. 5.2.
// =============================================================================

import type {
    TranslationProvider,
    TranslateInput,
    TranslateOutput
} from "./TranslationProvider.ts";

export class MockProvider implements TranslationProvider {
    readonly name = "mock";
    readonly supportedLanguages: ReadonlyArray<string> = [
        // Tutte le 33 di DeepL — mock non ha veri limiti
        "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr",
        "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "nb", "nl",
        "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "zh",
        "ar", "he", "vi"
    ];

    translate(input: TranslateInput): Promise<TranslateOutput> {
        const prefix = `[${input.targetLang.toUpperCase()}]`;
        const translations = input.texts.map(t => `${prefix} ${t}`);
        const charsUsed = input.texts.reduce((sum, t) => sum + t.length, 0);
        return Promise.resolve({
            translations,
            provider: this.name,
            metadata: { charsUsed }
        });
    }
}
