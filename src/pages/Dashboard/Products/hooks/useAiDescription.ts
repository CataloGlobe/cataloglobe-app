import { useState } from "react";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { generateProductDescription } from "@/services/supabase/products";
import { aiBlockMessage } from "@/utils/aiUsage";

/**
 * Lifecycle of the AI-generated description, used to drive the chip:
 * - "none": never generated (or pristine)
 * - "generated": just produced by the AI, untouched
 * - "edited": the user manually changed the AI text
 */
export type AiDescriptionState = "none" | "generated" | "edited";

export interface UseAiDescriptionParams {
    /** Current product name — the only required generator input. */
    name: string;
    tenantId: string | null;
    /** Called with the generated text so the caller can set its field state. */
    onDescriptionGenerated: (text: string) => void;
    /**
     * Opzionale (FASE 5): invocato dopo ogni tentativo di generazione (successo,
     * blocco quota o errore) così il chiamante può aggiornare lo stato quota AI
     * (es. la pill dell'header). Best-effort — se assente, la quota si aggiorna
     * comunque al prossimo fetch (cambio tenant / apertura Abbonamento).
     */
    onConsumed?: () => void;
}

export interface UseAiDescriptionResult {
    isGenerating: boolean;
    aiState: AiDescriptionState;
    /** name is non-empty and not currently generating. */
    canGenerate: boolean;
    generate: () => Promise<void>;
    /** Wire into the field onChange: flips "generated" → "edited". */
    markManualEdit: () => void;
}

/**
 * Shared affordance logic for "Genera con AI" on a product description field.
 * Resolves the tenant vertical_type internally via useTenant() (both call sites
 * live under /business/* so TenantProvider is guaranteed). Reuses the shared
 * `generateProductDescription` service; no client-side retry (the edge function
 * already retries transient failures).
 */
export function useAiDescription({
    name,
    tenantId,
    onDescriptionGenerated,
    onConsumed
}: UseAiDescriptionParams): UseAiDescriptionResult {
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiState, setAiState] = useState<AiDescriptionState>("none");

    const canGenerate = name.trim() !== "" && !isGenerating;

    const generate = async () => {
        if (!tenantId || !name.trim() || isGenerating) return;
        setIsGenerating(true);
        try {
            const generated = await generateProductDescription(tenantId, {
                name: name.trim(),
                verticalType: selectedTenant?.vertical_type ?? undefined
            });
            onDescriptionGenerated(generated);
            setAiState("generated");
        } catch (err) {
            const { code, resetAt } = err as { code?: string; resetAt?: string | null };
            // Blocco quota (FASE 5): spiega e dà la data, NON invita a riprovare.
            const isQuotaBlock = code === "quota_exhausted" || code === "not_eligible";
            const isRateLimit =
                code === "rate_limit_rpd" || code === "rate_limit_rpm_tpm" || code === "rate_limit";
            const message = isQuotaBlock
                ? aiBlockMessage(code, resetAt ?? null)
                : isRateLimit
                    ? "Troppe richieste verso il servizio AI. Riprova tra qualche istante."
                    : "Generazione della descrizione non riuscita. Riprova.";
            showToast({ message, type: "error" });
        } finally {
            setIsGenerating(false);
            // Aggiorna lo stato quota (successo o blocco): la pill/sezione riflettono
            // il consumo o il blocco appena avvenuto.
            onConsumed?.();
        }
    };

    const markManualEdit = () => {
        setAiState(prev => (prev === "generated" ? "edited" : prev));
    };

    return { isGenerating, aiState, canGenerate, generate, markManualEdit };
}
