// Chi può aprire un tunnel: il permesso di lettura viene prima di ogni caricamento.
// `PageGate` lascia passare mentre i permessi arrivano, e il tunnel legge subito
// menù, stili e calendario: qui si aspetta.
import { canDoOnAnyActivity, type UserPermissions } from "@/lib/permissions";
import type { CreaKind } from "./creaModel";

export const CREA_READ: Record<CreaKind, string> = { menu: "catalogs.read", stile: "styles.read", evid: "featured.read", storia: "stories.read" };

/** «wait» finché i permessi non ci sono (anche se non si sono letti), poi «open» o «locked». */
export function creaAccess(kind: CreaKind, permissions: UserPermissions | null, loading: boolean): "wait" | "open" | "locked" {
    if (loading || !permissions) return "wait";
    return canDoOnAnyActivity(permissions, CREA_READ[kind]) ? "open" : "locked";
}
