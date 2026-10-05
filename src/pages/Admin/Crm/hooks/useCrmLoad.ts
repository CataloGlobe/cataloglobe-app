import { useEffect, useState } from "react";
import { CRM_NOT_YET_ACTIVE, isMissingOnDatabase } from "@/utils/crm/stages";

export interface CrmLoad<T> {
    data: T | null;
    /** Frase italiana pronta; null se è andata bene. */
    error: string | null;
    loading: boolean;
}

/**
 * Una lettura sola, che sta da sola: se fallisce si spegne solo il pezzo che
 * la usa (riquadro della Home, scheda di Agenti). Una tabella che manca sul
 * database dice «Non ancora attivo», mai il testo grezzo dell'errore.
 * `reloadKey` la rifà (dopo un'azione o «Riprova").
 */
export function useCrmLoad<T>(load: () => Promise<T>, reloadKey: unknown): CrmLoad<T> {
    const [state, setState] = useState<CrmLoad<T>>({ data: null, error: null, loading: true });
    useEffect(() => {
        let cancelled = false;
        setState(s => ({ ...s, loading: true }));
        load().then(
            data => {
                if (!cancelled) setState({ data, error: null, loading: false });
            },
            (err: unknown) => {
                if (!cancelled) {
                    setState({
                        data: null,
                        error: isMissingOnDatabase(err) ? CRM_NOT_YET_ACTIVE : "Non si è caricato. Riprova tra poco.",
                        loading: false
                    });
                }
            }
        );
        return () => {
            cancelled = true;
        };
        // `load` è una funzione nuova a ogni render: conta solo la chiave.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reloadKey]);
    return state;
}
