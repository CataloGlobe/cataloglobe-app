import { useCallback, useEffect, useState } from "react";
import {
    getStaleTranslations,
    type StaleTranslationItem
} from "@/services/supabase/tenantLanguages";

export interface UseStaleTranslationsResult {
    items: StaleTranslationItem[];
    isLoading: boolean;
    error: boolean;
    refetch: () => Promise<void>;
    /** Rimuove localmente un elemento risolto (es. dopo "Torna ad automatica"). */
    removeItem: (entityType: string, entityId: string, field: string) => void;
}

/**
 * Lista "da rivedere" per una lingua, fetch LAZY (no polling): si carica al mount
 * del drawer e quando cambia languageCode. Sorgente: RPC get_stale_translations.
 */
export function useStaleTranslations(
    tenantId: string | null | undefined,
    languageCode: string | null
): UseStaleTranslationsResult {
    const [items, setItems] = useState<StaleTranslationItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(false);

    const refetch = useCallback(async () => {
        if (!tenantId || !languageCode) return;
        setIsLoading(true);
        setError(false);
        try {
            const data = await getStaleTranslations(tenantId, languageCode);
            setItems(data);
        } catch (err) {
            console.error("[useStaleTranslations]", err);
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, languageCode]);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    const removeItem = useCallback(
        (entityType: string, entityId: string, field: string) => {
            setItems(prev =>
                prev.filter(
                    it =>
                        !(
                            it.entity_type === entityType &&
                            it.entity_id === entityId &&
                            it.field === field
                        )
                )
            );
        },
        []
    );

    return { items, isLoading, error, refetch, removeItem };
}
