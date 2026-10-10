import type { AppSidebarNavItem } from "./AppSidebar";

/** La voce è la pagina corrente: il suo indirizzo, sotto di lui, o uno dei suoi prefissi. */
export function isItemActive(item: AppSidebarNavItem, pathname: string): boolean {
    if (item.matchPrefixes?.some(p => pathname.startsWith(p))) return true;
    if (pathname === item.to) return true;
    return !item.end && pathname.startsWith(`${item.to}/`);
}
