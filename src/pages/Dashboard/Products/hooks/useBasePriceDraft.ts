import { useCallback, useEffect, useMemo, useState } from "react";
import { updateProduct, type V2Product } from "@/services/supabase/products";

/**
 * Il campo come lo scrive l'utente: «22,5» o «22.50». Si apre coi centesimi
 * («2.90», non «2.9»), se non cambiano il prezzo (la colonna non ha scala fissa).
 */
function toInput(price: number | null): string {
    if (price === null) return "";
    const cents = price.toFixed(2);
    return Number(cents) === price ? cents : String(price);
}

function parse(input: string): number | null | "invalid" {
    const trimmed = input.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

/**
 * Prezzo unico nella bozza della pagina (Officina 3, D103 A): si scrive nel
 * riquadro e parte col «Salva» in alto, insieme al resto. Vuoto = nessun
 * prezzo (per una variante: quello del padre).
 */
export function useBasePriceDraft(product: V2Product | null, tenantId: string, onUpdated: (p: V2Product) => void) {
    const saved = product?.base_price ?? null;
    const [input, setInput] = useState(toInput(saved));
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setInput(toInput(saved));
    }, [saved, product?.id]);

    const parsed = useMemo(() => parse(input), [input]);
    const error = parsed === "invalid" ? "Scrivi un prezzo, per esempio 12,50." : null;
    const isDirty = parsed === "invalid" ? input.trim() !== toInput(saved) : parsed !== saved;

    const save = useCallback(async (): Promise<boolean> => {
        if (!product || !isDirty) return true;
        if (parsed === "invalid") return false;
        setIsSaving(true);
        try {
            const updated = await updateProduct(product.id, tenantId, { base_price: parsed });
            onUpdated(updated);
            return true;
        } catch {
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [product, isDirty, parsed, tenantId, onUpdated]);

    const discard = useCallback(() => setInput(toInput(saved)), [saved]);

    return { input, setInput, error, isDirty, isSaving, save, discard };
}

export type BasePriceDraft = ReturnType<typeof useBasePriceDraft>;
