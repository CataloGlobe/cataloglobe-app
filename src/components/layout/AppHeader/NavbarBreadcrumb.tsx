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
// Segmento sede: montato SOLO sulle route che consumano `useSedeScope`
// (vedi `SEDE_NAVBAR_ROUTES` in `navbarBreadcrumbRoutes`). Auto-hide
// se l'utente ha una sola sede o nessuna sede leggibile.
// ============================================================

import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import Breadcrumb, { type BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";
import { useBreadcrumb } from "@/context/useBreadcrumb";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useSedeScope } from "@/hooks/useSedeScope";
import { SedeScopeSelect } from "@/components/ui/SedeScopeSelect/SedeScopeSelect";
import {
    ROUTE_LABELS,
    SEDE_NAVBAR_ROUTES,
    resolveBusinessRoute
} from "./navbarBreadcrumbRoutes";
import styles from "./NavbarBreadcrumb.module.scss";

/**
 * Segmento sede + separator di chiusura. Renderizzato solo se l'utente
 * ha più di una sede leggibile (altrimenti il selettore non aggiunge
 * valore). Il check viene fatto qui via useSedeScope per evitare
 * separator orfano quando SedeScopeSelect auto-nasconde.
 */
function NavbarSedeSegment() {
    const { readableActivities, isForcedSingleSite } = useSedeScope();
    if (isForcedSingleSite || readableActivities.length === 0) return null;
    return (
        <>
            <SedeScopeSelect />
            <span className={styles.separator} aria-hidden="true">/</span>
        </>
    );
}

export function NavbarBreadcrumb() {
    const { pathname } = useLocation();
    const { businessId } = useParams<{ businessId: string }>();
    const { items: registeredItems } = useBreadcrumb();
    const { catalogLabel } = useVerticalConfig();

    const routeInfo = useMemo(
        () => resolveBusinessRoute(pathname, businessId),
        [pathname, businessId]
    );

    const items = useMemo<BreadcrumbItem[]>(() => {
        // Se una pagina di dettaglio ha registrato i propri segmenti,
        // usali tal quali: la pagina sa già come mostrare la propria chain.
        if (registeredItems.length > 0) return registeredItems;

        if (!routeInfo.key || !routeInfo.basePath) return [];

        const label =
            routeInfo.key === "catalogs" ? catalogLabel : ROUTE_LABELS[routeInfo.key];

        if (routeInfo.isDetail) {
            // Detail route senza items registrati (fase di caricamento iniziale,
            // o pagine di dettaglio non ancora migrate): rendi solo il segmento
            // intermedio col link al list-root. Il leaf comparirà quando la
            // pagina chiamerà `useBreadcrumbItems`.
            return [{ label, to: routeInfo.basePath }];
        }

        return [{ label }];
    }, [registeredItems, routeInfo, catalogLabel]);

    const showSedeSelector = routeInfo.key
        ? SEDE_NAVBAR_ROUTES.has(routeInfo.key)
        : false;

    if (items.length === 0 && !showSedeSelector) return null;

    // Layout: [separator] [SedeScopeSegment] [Breadcrumb]
    // Il NavbarSedeSegment include il suo separator di chiusura, così
    // separator + select scompaiono insieme quando auto-hidden.
    return (
        <div className={styles.row}>
            <span className={styles.separator} aria-hidden="true">/</span>
            {showSedeSelector && <NavbarSedeSegment />}
            {items.length > 0 && <Breadcrumb items={items} />}
        </div>
    );
}
