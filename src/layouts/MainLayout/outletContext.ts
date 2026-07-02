import { useOutletContext } from "react-router-dom";
import type { TranslationCoverage } from "@/services/supabase/tenantLanguages";
import type { AiImportStatus, ImportOpenTarget } from "@/hooks/useAiImportSession";

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
     * Con `target` opzionale apre puntato su un catalogo (scorciatoia kebab, 2C-5).
     */
    openAiImport: (target?: ImportOpenTarget) => void;
    /**
     * Bumpato al successo di un import → le pagine che mostrano cataloghi/prodotti
     * ricaricano. Stesso pattern di `translationRefreshKey`.
     */
    importRefreshKey: number;
    /**
     * Status coarse della sessione import (cambia poche volte per import → il
     * bottone "Importa con AI" lo legge per la label/stato in corso). Il progresso
     * granulare NON passa di qui (resta sul path props verso il drawer).
     */
    importStatus: AiImportStatus;
}

/**
 * Accessor tipizzato del context dell'Outlet di MainLayout. Ritorna null se
 * usato fuori dall'area business (Outlet senza context) → i consumer fanno
 * optional-chaining su `wakeTranslations`.
 */
export function useBusinessOutletContext(): BusinessOutletContext | null {
    return useOutletContext<BusinessOutletContext | null>() ?? null;
}
