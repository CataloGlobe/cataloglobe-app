// =============================================================================
// TranslationProvider — interface comune (Edge-only)
// =============================================================================
//
// Implementabile da DeepL, Google (futuro v1.1), Mock. Frontend NON importa
// questo file: tutte le chiamate API esterne vivono nelle Edge Functions.
//
// Diversamente da scheduleResolver.ts (esistente in 2 copie frontend+shared),
// il provider abstraction è EDGE-ONLY: nessun gemello in src/services.
//
// Ref: docs/translations-architecture-v3.md sez. 5.1, 5.3.
// =============================================================================

export interface TranslationProvider {
    /** Identificatore del provider (es. 'deepl', 'google', 'mock'). */
    readonly name: string;

    /** Lingue supportate (codici ISO 639-1 lower-case: 'en', 'fr', 'de', ...). */
    readonly supportedLanguages: ReadonlyArray<string>;

    /**
     * Traduce un batch di testi da una lingua all'altra.
     *
     * Ordine output = ordine input (corrispondenza per index).
     * Implementazioni dovrebbero usare batching nativo del provider quando
     * possibile (DeepL accetta array, Google idem).
     *
     * @throws TranslationProviderError per errori del provider
     *         (5xx, rate limit, key invalida, ecc.).
     */
    translate(input: TranslateInput): Promise<TranslateOutput>;
}

export interface TranslateInput {
    /** Testi da tradurre. Array vuoto è valido (ritorna immediatamente). */
    texts: ReadonlyArray<string>;
    /** Codice lingua sorgente (es. 'it'). */
    sourceLang: string;
    /** Codice lingua target (es. 'en'). */
    targetLang: string;
    /**
     * Hint contestuale per migliorare qualità traduzione. Mappato a:
     * - DeepL: tag/formality (futuro v1.1).
     * - Google LLM: prompt prefix (futuro v1.1).
     *
     * In MVP è ignorato; documentato per estensioni future.
     */
    context?: TranslationContext;
}

export type TranslationContext =
    | "menu_item"
    | "promotional"
    | "category_label"
    | "allergen"
    | "characteristic"
    | "ingredient"
    | "option"
    | "attribute";

export interface TranslateOutput {
    /** Testi tradotti, stesso ordine di input.texts. */
    translations: ReadonlyArray<string>;
    /** Provider name (echo di provider.name). Utile per debugging. */
    provider: string;
    /** Metadata opzionali (es. caratteri usati per tier limit tracking). */
    metadata?: TranslateMetadata;
}

export interface TranslateMetadata {
    charsUsed?: number;
    /** Eventuale rate limit info ricevuta (es. headers DeepL). */
    rateLimitRemaining?: number;
}

/**
 * Categorie di errore esplicite per gestione retry differenziata in
 * process-translation-jobs (Prompt 7).
 *
 * - 'auth': key invalida/scaduta/wrong tier — NON retryable.
 * - 'quota': limit superato — retryable solo dopo reset.
 * - 'rate_limit': 429 — retryable con backoff.
 * - 'network': timeout/DNS/connection — retryable.
 * - 'server': 5xx — retryable.
 * - 'validation': input malformato — NON retryable.
 * - 'unknown': tutto il resto — retryable cautelativo.
 */
export type TranslationErrorCategory =
    | "auth"
    | "quota"
    | "rate_limit"
    | "network"
    | "server"
    | "validation"
    | "unknown";

/**
 * Errore tipizzato per provider failures.
 */
export class TranslationProviderError extends Error {
    constructor(
        message: string,
        public readonly category: TranslationErrorCategory,
        public readonly provider: string,
        public readonly retryable: boolean,
        public readonly originalError?: unknown
    ) {
        super(message);
        this.name = "TranslationProviderError";
    }
}
