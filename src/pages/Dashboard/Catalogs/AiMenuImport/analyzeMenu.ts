/**
 * La lettura del menù con l'AI (edge `menu-ai-import`), da sola: niente stato,
 * niente scritture. La usano il drawer dell'import (`useAiImportSession`) e il
 * tunnel «Crea menù» al passo «Da dove parti» (D165, D172), che scrive solo al
 * Salva.
 */
import { supabase } from "@/services/supabase/client";
import { compressImage } from "@/utils/compressImage";
import { aiBlockMessage } from "@/utils/aiUsage";
import { MAX_IMAGE_SIZE } from "./aiImportLimits";

/** Un piatto come lo legge l'AI. */
export type AiMenuItem = {
    name: string;
    description: string | null;
    base_price: number | null;
    product_type: "simple" | "formats";
    confidence: "high" | "medium" | "low";
    // `price` nullable: l'AI può estrarre un formato senza prezzo.
    formats?: { name: string; price: number | null }[];
};

export type AiMenuCategory = { name: string; items: AiMenuItem[] };

/** `null` quando la lettura è stata annullata: chi chiama esce in silenzio. */
export type AnalyzeMenuResult = { ok: true; categories: AiMenuCategory[] } | { ok: false; error: string } | null;

type ImagePayload = {
    data: string;
    mime_type: string;
};

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getAiErrorMessage(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand"))
        return "Il servizio AI è temporaneamente sovraccarico. Riprova tra qualche secondo.";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("network"))
        return "Errore di connessione. Verifica la tua connessione internet e riprova.";
    if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("JWT"))
        return "Sessione scaduta. Ricarica la pagina e riprova.";
    if (msg.includes("413") || msg.includes("too large") || msg.includes("payload"))
        return "Le immagini sono troppo grandi. Prova con file più leggeri.";
    if (msg.includes("500") || msg.includes("Internal"))
        return "Errore del server. Riprova tra qualche secondo.";
    if (msg.includes("timeout") || msg.includes("Timeout"))
        return "L'analisi ha impiegato troppo tempo. Riprova con meno immagini.";

    return "Si è verificato un errore durante l'analisi. Riprova.";
}

/**
 * Manda foto e PDF all'AI e restituisce sezioni e piatti letti. `onConsumed`
 * parte quando l'edge ha risposto (successo o errore): la quota è cambiata.
 */
export async function analyzeMenuFiles(
    tenantId: string,
    files: File[],
    signal: AbortSignal,
    onConsumed?: () => void
): Promise<AnalyzeMenuResult> {
    try {
        // Foto compresse (con l'originale se la compressione non riesce), PDF così come sono.
        const imagePayloads: ImagePayload[] = await Promise.all(
            files.map(async file => {
                if (file.type.startsWith("image/")) {
                    try {
                        const compressed = await compressImage(file, 1200, 0.8, MAX_IMAGE_SIZE);
                        return { data: await fileToBase64(compressed), mime_type: "image/jpeg" };
                    } catch {
                        return { data: await fileToBase64(file), mime_type: file.type || "image/jpeg" };
                    }
                }
                return { data: await fileToBase64(file), mime_type: file.type || "application/pdf" };
            })
        );

        const { data: response, error } = await supabase.functions.invoke("menu-ai-import", {
            body: {
                images: imagePayloads,
                tenant_id: tenantId,
                language_hint: "it"
            },
            signal
        });

        // Annullata: niente errore, niente stato (anti risposta-zombie). Copre
        // sia il path `{ error }` (FunctionsFetchError con l'AbortError) sia il throw.
        if (signal.aborted) return null;

        onConsumed?.();

        // Non-2xx: supabase-js mette la Response in `error.context`; il suo JSON
        // ha il messaggio in italiano dell'edge, e per la quota (402) il motivo.
        if (error) {
            let apiMessage: string | null = null;
            let quotaReason: string | undefined;
            let quotaResetAt: string | null = null;
            try {
                const ctx = (error as { context?: Response }).context;
                if (ctx && typeof ctx.json === "function") {
                    const errBody = await ctx.json();
                    if (errBody && typeof errBody.error === "string" && errBody.error.length > 0) {
                        apiMessage = errBody.error;
                    }
                    if (errBody && typeof errBody.reason === "string") quotaReason = errBody.reason;
                    if (errBody && typeof errBody.reset_at === "string") quotaResetAt = errBody.reset_at;
                }
            } catch {
                // corpo illeggibile: si ripiega sotto
            }
            console.error("[AiMenuImport] analyze edge error:", error);
            if (quotaReason === "quota_exhausted" || quotaReason === "not_eligible") {
                return { ok: false, error: aiBlockMessage(quotaReason, quotaResetAt) };
            }
            return { ok: false, error: apiMessage ?? getAiErrorMessage(error) };
        }

        // 2xx con success: false → il messaggio è già in italiano.
        if (!response?.success) {
            console.error("[AiMenuImport] analyze response not successful:", response);
            return {
                ok: false,
                error:
                    typeof response?.error === "string" && response.error.length > 0
                        ? response.error
                        : "Errore nell'analisi del menu"
            };
        }

        const result = response.data;
        if (!result || !Array.isArray(result.categories) || result.categories.length === 0) {
            return { ok: false, error: "L'AI non ha trovato prodotti nel menù. Prova con un'immagine più nitida." };
        }
        return { ok: true, categories: result.categories as AiMenuCategory[] };
    } catch (err: unknown) {
        if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return null;
        console.error("[AiMenuImport] analyze error:", err);
        return { ok: false, error: getAiErrorMessage(err) };
    }
}
