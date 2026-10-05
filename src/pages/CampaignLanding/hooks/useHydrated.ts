import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const getSnapshot = () => true;
// L'HTML prerenderizzato e l'idratazione leggono `false`; subito dopo React
// ripassa col valore del client. Senza idratazione (createRoot) è subito `true`.
const getServerSnapshot = () => false;

/** `false` nell'HTML prerenderizzato finché React non ha idratato, poi `true`. */
export function useHydrated(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
