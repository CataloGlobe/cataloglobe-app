import { useOutletContext } from "react-router-dom";
import type { TranslationCoverage } from "@/services/supabase/tenantLanguages";

/**
 * Valore esposto da `MainLayout` alle pagine business via `<Outlet context>`.
 * NON è un nuovo provider context: è il meccanismo nativo di React Router per
 * passare dati layout → pagina senza prop drilling.
 *
 * Fonte unica della coverage traduzioni: `MainLayout` monta `useTranslationCoverage`
 * una sola volta (poll condizionato + toast di completamento). Le pagine leggono
 * il dato da qui invece di rimontare l'hook → un solo poll, un solo toast.
 */
export interface BusinessOutletContext {
    /** Copertura traduzioni tenant-wide. null finché il primo fetch non è arrivato. */
    translationCoverage: TranslationCoverage | null;
    /**
     * Forza un refetch immediato della coverage (ottimizzazione latenza dopo un
     * enqueue). Il poll condizionato la intercetterebbe comunque entro 5s.
     */
    wakeTranslations: () => void;
    /**
     * Apre il drawer import AI (sessione sollevata in MainLayout). Lo stato e la
     * richiesta vivono nel layout → sopravvivono all'unmount della pagina.
     */
    openAiImport: () => void;
    /**
     * Bumpato al successo di un import → le pagine che mostrano cataloghi/prodotti
     * ricaricano. Stesso pattern di `translationRefreshKey`.
     */
    importRefreshKey: number;
}

/**
 * Accessor tipizzato del context dell'Outlet di MainLayout. Ritorna null se
 * usato fuori dall'area business (Outlet senza context) → i consumer fanno
 * optional-chaining su `wakeTranslations`.
 */
export function useBusinessOutletContext(): BusinessOutletContext | null {
    return useOutletContext<BusinessOutletContext | null>() ?? null;
}
