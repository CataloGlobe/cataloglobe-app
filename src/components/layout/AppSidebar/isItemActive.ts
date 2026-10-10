import type { AppSidebarNavItem } from "./AppSidebar";

/** L'indirizzo della voce senza la query. */
export function itemPath(item: Pick<AppSidebarNavItem, "to">): string {
    const at = item.to.indexOf("?");
    return at === -1 ? item.to : item.to.slice(0, at);
}

/** La query della voce (`vista=calendario`) è tutta dentro quella dell'indirizzo. */
function hasQuery(search: string, wanted: string): boolean {
    const current = new URLSearchParams(search);
    for (const [key, value] of new URLSearchParams(wanted)) {
        if (current.get(key) !== value) return false;
    }
    return true;
}

/**
 * La voce è la pagina corrente: il suo indirizzo, sotto di lui, o uno dei suoi
 * prefissi, a segmento intero (`prenotazioni` non accende
 * `prenotazioni-online`). Una voce con la query (`search`) chiede anche
 * quella: due parti sulla stessa pagina (Calendario e Regole).
 */
export function isItemActive(item: AppSidebarNavItem, pathname: string, search = ""): boolean {
    const path = itemPath(item);
    const onPath =
        item.matchPrefixes?.some(p => pathname === p || pathname.startsWith(`${p}/`)) ||
        pathname === path ||
        (!item.end && pathname.startsWith(`${path}/`));
    if (!onPath) return false;
    return !item.search || hasQuery(search, item.search);
}

/**
 * La voce accesa fra quelle di una sezione: quella con la query vince sulla
 * sorella senza (Sala su In servizio, Calendario su Regole).
 */
export function currentItem<T extends AppSidebarNavItem>(items: readonly T[], pathname: string, search = ""): T | null {
    const on = items.filter(item => isItemActive(item, pathname, search));
    return on.find(item => item.search) ?? on[0] ?? null;
}

/**
 * Siamo sulla pagina della parte, non dentro un suo dettaglio: le tab in
 * testa alla pagina si vedono qui, nel dettaglio restano le briciole.
 */
export function isItemRoot(item: AppSidebarNavItem, pathname: string): boolean {
    return pathname === itemPath(item) || !!item.matchPrefixes?.some(p => pathname === p);
}
