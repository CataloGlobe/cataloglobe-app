import { TENANT_KEY } from "@/constants/storageKeys";

/**
 * L'ultima attività aperta resta in localStorage per riportarci chi rientra.
 * All'uscita si toglie: chi entra dopo sullo stesso browser non deve passare
 * da /business/<id> di un altro (DashboardRedirect la legge).
 */
export function forgetLastTenant(): void {
    try {
        localStorage.removeItem(TENANT_KEY);
    } catch {
        // storage non disponibile: niente da togliere
    }
}
