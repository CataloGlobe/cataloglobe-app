import { useOutletContext } from "react-router-dom";

/**
 * Valore esposto da `AdminLayout` alle pagine `/admin/*` via `<Outlet context>`.
 * NON è un nuovo provider context: è il meccanismo nativo di React Router per
 * passare dati layout → pagina senza prop drilling. Stesso ruolo di
 * `BusinessOutletContext` per l'area business.
 */
export interface AdminOutletContext {
    /**
     * Rivaluta il pallino "richieste in attesa" sulla voce Supporto. Chiamato
     * dal dettaglio richiesta dopo l'invio di una risposta e dopo un cambio di
     * stato: sono i due soli eventi locali che spostano un ticket dentro o
     * fuori dalla coda di chi aspetta. Senza, il pallino resterebbe come al
     * mount dell'area admin — acceso anche dopo aver risposto.
     *
     * Stabile fra i render (`useCallback` nel layout). Finisce nelle dipendenze
     * degli `useCallback` a valle: una funzione nuova a ogni render le
     * invaliderebbe tutte, che è il difetto da cui è nato il loop di
     * `usePageHeader`.
     */
    refreshSupportPending: () => void;
}

/**
 * Accessor tipizzato del context dell'Outlet di AdminLayout. Ritorna null se
 * usato fuori dall'area admin (Outlet senza context) → i consumer fanno
 * optional-chaining su `refreshSupportPending`.
 */
export function useAdminOutletContext(): AdminOutletContext | null {
    return useOutletContext<AdminOutletContext | null>() ?? null;
}
