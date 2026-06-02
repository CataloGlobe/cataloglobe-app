// ============================================================
// <NavbarBreadcrumb>
//
// Deriva i segmenti dalla route attiva. Segmento 1 = tenant è già
// presente in AppHeader (HeaderTenantSwitcher), il breadcrumb parte
// DOPO il tenant.
//
// Strategia override per i nomi-record nelle detail route:
//  - REUSE dell'esistente `useBreadcrumb()` (BreadcrumbProvider già
//    montato in MainLayout). Le 7 detail page che oggi chiamano
//    `useBreadcrumbItems([...])` continuano a funzionare:
//    quando registrano i segmenti, NavbarBreadcrumb li usa.
//  - In assenza di items registrati: deriviamo dalla route un singolo
//    segmento col label di pagina (top-level). Sulle detail route in
//    attesa di registrazione, il segmento è LINK al list-root
//    (cliccabile), il leaf comparirà appena la pagina si registra.
//
// NON include il segmento sede: arriverà col mount del SedeScopeSelect
// in una fase successiva del refactor header.
// ============================================================

import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import Breadcrumb, { type BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";
import { useBreadcrumb } from "@/context/useBreadcrumb";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { ROUTE_LABELS, resolveBusinessRoute } from "./navbarBreadcrumbRoutes";
import styles from "./NavbarBreadcrumb.module.scss";

export function NavbarBreadcrumb() {
    const { pathname } = useLocation();
    const { businessId } = useParams<{ businessId: string }>();
    const { items: registeredItems } = useBreadcrumb();
    const { catalogLabel } = useVerticalConfig();

    const items = useMemo<BreadcrumbItem[]>(() => {
        // Se una pagina di dettaglio ha registrato i propri segmenti,
        // usali tal quali: la pagina sa già come mostrare la propria chain.
        if (registeredItems.length > 0) return registeredItems;

        const info = resolveBusinessRoute(pathname, businessId);
        if (!info.key || !info.basePath) return [];

        const label = info.key === "catalogs" ? catalogLabel : ROUTE_LABELS[info.key];

        if (info.isDetail) {
            // Detail route senza items registrati (fase di caricamento iniziale,
            // o pagine di dettaglio non ancora migrate): rendi solo il segmento
            // intermedio col link al list-root. Il leaf comparirà quando la
            // pagina chiamerà `useBreadcrumbItems`.
            return [{ label, to: info.basePath }];
        }

        return [{ label }];
    }, [registeredItems, pathname, businessId, catalogLabel]);

    if (items.length === 0) return null;

    // Separator leading incluso QUI (non in AppHeader) per evitare orfani
    // quando il breadcrumb è vuoto: separator + Breadcrumb scompaiono insieme.
    return (
        <div className={styles.row}>
            <span className={styles.separator} aria-hidden="true">/</span>
            <Breadcrumb items={items} />
        </div>
    );
}
