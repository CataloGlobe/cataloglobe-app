// =============================================================================
// DeepLProvider — implementazione concreta (Edge-only)
// =============================================================================
//
// Auto-detect Free/Pro tier dal suffix della API key:
//   Free key formato: `xxx-xxx-xxx:fx`  → endpoint api-free.deepl.com
//   Pro key formato:  `xxx-xxx-xxx`     → endpoint api.deepl.com
//
// Mapping ISO 639-1 → DeepL codes: 'en'→'EN-US', 'pt'→'PT-PT', 'zh'→'ZH-HANS',
// altri uppercase del codice ISO. Source NON ha varianti regionali (DeepL
// detect: 'EN' senza suffix US/GB).
//
// Ref: docs/translations-architecture-v3.md sez. 5.4.
// =============================================================================

import type {
    TranslationProvider,
    TranslateInput,
    TranslateOutput
} from "./TranslationProvider.ts";
import { TranslationProviderError } from "./TranslationProvider.ts";

interface DeepLTranslationItem {
    text: string;
    detected_source_language?: string;
}

interface DeepLResponseShape {
    translations?: DeepLTranslationItem[];
}

export class DeepLProvider implements TranslationProvider {
    readonly name = "deepl";
    readonly supportedLanguages: ReadonlyArray<string> = [
        "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr",
        "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "nb", "nl",
        "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "zh",
        "ar", "he", "vi"
    ];

    private readonly apiKey: string;
    private readonly endpoint: string;

    constructor(apiKey: string) {
        if (!apiKey || apiKey.length < 10) {
            throw new TranslationProviderError(
                "DeepL API key mancante o invalida",
                "auth",
                this.name,
                false
            );
        }
        this.apiKey = apiKey;
        const isFreeTier = apiKey.endsWith(":fx");
        this.endpoint = isFreeTier
            ? "https://api-free.deepl.com/v2/translate"
            : "https://api.deepl.com/v2/translate";
    }

    async translate(input: TranslateInput): Promise<TranslateOutput> {
        if (input.texts.length === 0) {
            return { translations: [], provider: this.name };
        }

        const targetLang = this.mapToDeepLCode(input.targetLang);
        const sourceLang = this.mapToDeepLSourceCode(input.sourceLang);

        const body = new URLSearchParams();
        for (const text of input.texts) {
            body.append("text", text);
        }
        body.append("source_lang", sourceLang);
        body.append("target_lang", targetLang);
        body.append("preserve_formatting", "1");
        // tag_handling, formality, glossary_id sono v1.1 — non in MVP

        let response: Response;
        try {
            response = await fetch(this.endpoint, {
                method: "POST",
                headers: {
                    "Authorization": `DeepL-Auth-Key ${this.apiKey}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: body.toString()
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new TranslationProviderError(
                `Network error chiamando DeepL: ${message}`,
                "network",
                this.name,
                true,
                err
            );
        }

        if (!response.ok) {
            throw this.mapHttpError(response);
        }

        let json: DeepLResponseShape;
        try {
            json = await response.json() as DeepLResponseShape;
        } catch (err) {
            throw new TranslationProviderError(
                "DeepL response non parseable come JSON",
                "unknown",
                this.name,
                true,
                err
            );
        }

        if (!json.translations || !Array.isArray(json.translations)) {
            throw new TranslationProviderError(
                "DeepL response shape inattesa (manca array translations)",
                "unknown",
                this.name,
                false
            );
        }

        if (json.translations.length !== input.texts.length) {
            throw new TranslationProviderError(
                `DeepL ha ritornato ${json.translations.length} traduzioni per ${input.texts.length} input`,
                "unknown",
                this.name,
                false
            );
        }

        const translations = json.translations.map(t => t.text);
        const charsUsed = input.texts.reduce((sum, t) => sum + t.length, 0);

        return {
            translations,
            provider: this.name,
            metadata: { charsUsed }
        };
    }

    /**
     * Mappa codice ISO 639-1 → DeepL target code.
     * DeepL accetta uppercase + alcuni codici regionali specifici per target
     * (en/pt/zh hanno varianti).
     */
    private mapToDeepLCode(iso: string): string {
        const lower = iso.toLowerCase();
        const overrides: Record<string, string> = {
            "en": "EN-US",
            "pt": "PT-PT",
            "zh": "ZH-HANS"
        };
        return overrides[lower] ?? lower.toUpperCase();
    }

    /**
     * Mappa codice ISO 639-1 → DeepL source code.
     * Il source NON ha varianti regionali (es. source 'EN' senza US/GB).
     */
    private mapToDeepLSourceCode(iso: string): string {
        return iso.toUpperCase();
    }

    private mapHttpError(response: Response): TranslationProviderError {
        const status = response.status;
        if (status === 401 || status === 403) {
            return new TranslationProviderError(
                `DeepL auth error (status ${status})`,
                "auth",
                this.name,
                false
            );
        }
        if (status === 429) {
            return new TranslationProviderError(
                "DeepL rate limit superato (429)",
                "rate_limit",
                this.name,
                true
            );
        }
        if (status === 456) {
            // 456 = quota exceeded (specifico DeepL)
            return new TranslationProviderError(
                "DeepL quota mensile superata (456)",
                "quota",
                this.name,
                false
            );
        }
        if (status >= 500) {
            return new TranslationProviderError(
                `DeepL server error (status ${status})`,
                "server",
                this.name,
                true
            );
        }
        if (status >= 400) {
            return new TranslationProviderError(
                `DeepL validation error (status ${status})`,
                "validation",
                this.name,
                false
            );
        }
        return new TranslationProviderError(
            `DeepL unexpected status ${status}`,
            "unknown",
            this.name,
            true
        );
    }
}
