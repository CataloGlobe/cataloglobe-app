import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
    claimConfronto,
    getConfrontoQui,
    getSediVista,
    isConfrontoAttivo,
    setConfrontaVista,
    setSedeVista,
    subscribeSediVista,
    type SedeVista
} from "./sediVistaStore";

export type { SedeVista } from "./sediVistaStore";

export interface SediVista {
    /** null: nessuna scelta, vale l'indirizzo della pagina. */
    sede: SedeVista | null;
    /** Le sedi a confronto (mai la sede scelta); restano anche dove il confronto non vale. */
    confronta: ReadonlySet<string>;
    /** La sezione aperta permette il confronto (`useConfrontoQui`). */
    confrontoQui: boolean;
    /** Il confronto si vede: qui vale, si guarda una sede sola e ce n'è almeno un'altra. */
    confrontoAttivo: boolean;
    setSede: (sede: SedeVista | null, opts?: { confronta?: Iterable<string> }) => void;
    setConfronta: (ids: Iterable<string>) => void;
}

/**
 * Cosa si guarda e con chi si confronta (D152): lo stesso stato per la
 * barra in alto e per le pagine, una riga per azienda.
 */
export function useSediVista(tenantId: string | null | undefined): SediVista {
    const state = useSyncExternalStore(
        subscribeSediVista,
        () => getSediVista(tenantId),
        () => getSediVista(null)
    );
    const confrontoQui = useSyncExternalStore(subscribeSediVista, getConfrontoQui, () => false);

    const setSede = useCallback<SediVista["setSede"]>(
        (sede, opts) => {
            if (tenantId) setSedeVista(tenantId, sede, opts);
        },
        [tenantId]
    );
    const setConfronta = useCallback<SediVista["setConfronta"]>(
        ids => {
            if (tenantId) setConfrontaVista(tenantId, ids);
        },
        [tenantId]
    );
    const confronta = useMemo(() => new Set(state.confronta), [state.confronta]);

    return {
        sede: state.sede,
        confronta,
        confrontoQui,
        confrontoAttivo: isConfrontoAttivo(state, confrontoQui),
        setSede,
        setConfronta
    };
}

/** La pagina dichiara che qui il confronto vale (Calendario, Clienti e numeri). */
export function useConfrontoQui(enabled = true): void {
    useEffect(() => (enabled ? claimConfronto() : undefined), [enabled]);
}
