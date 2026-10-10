// ============================================================
// <NavbarBreadcrumb>
//
// L'ultimo segmento del percorso a cartelle dell'header (§51.8):
// logo / azienda / sede / **pagina**. Azienda e sede hanno i loro
// posti (il nome in testata, HeaderTenantName; la sede in alto a destra, SediInAlto); qui resta
// la pagina, e sotto 768 sparisce (è il titolo sotto).
//
// Strategia override per i nomi-record nelle detail route:
//  - REUSE dell'esistente `useBreadcrumb()` (BreadcrumbProvider già
//    montato in MainLayout). Le pagine di dettaglio che chiamano
//    `useBreadcrumbItems([...])` registrano i loro segmenti e
//    NavbarBreadcrumb li usa.
//  - In assenza di items registrati: deriviamo dalla route un singolo
//    segmento col label di pagina. Dentro una sede il nome è quello
//    della voce di sidebar (`navModel`); sulle detail route in attesa di
//    registrazione, il segmento è LINK al list-root.
// ============================================================

import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import Breadcrumb, { type BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";
import { useBreadcrumb } from "@/context/useBreadcrumb";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { navEntryForSedeSegment } from "@/utils/navModel";
import { businessRouteLabel, resolveBusinessRoute } from "./navbarBreadcrumbRoutes";
import styles from "./NavbarBreadcrumb.module.scss";

/** `/business/:businessId/locations/:activityId/:segment` — una pagina di sede. */
const SEDE_PAGE_PATH = /^\/business\/[^/]+\/locations\/[^/]+\/([^/]+)/;

interface NavbarBreadcrumbProps {
    /** Nella barra bianca sopra la pagina (Officina): niente «/» davanti
     *  (azienda e sede stanno nella sidebar) e visibile anche sotto 768. */
    inBar?: boolean;
}

export function NavbarBreadcrumb({ inBar = false }: NavbarBreadcrumbProps) {
    const { pathname } = useLocation();
    const { businessId } = useParams<{ businessId: string }>();
    const { items: registeredItems } = useBreadcrumb();
    const { catalogLabel } = useVerticalConfig();

    const routeInfo = useMemo(() => resolveBusinessRoute(pathname, businessId), [pathname, businessId]);
    const sedeSegment = SEDE_PAGE_PATH.exec(pathname)?.[1] ?? null;

    const items = useMemo<BreadcrumbItem[]>(() => {
        // Se una pagina di dettaglio ha registrato i propri segmenti,
        // usali tal quali: la pagina sa già come mostrare la propria chain.
        if (registeredItems.length > 0) return registeredItems;

        // Dentro una sede la sede è già nel suo selettore: resta la pagina.
        if (sedeSegment) {
            const entry = navEntryForSedeSegment(sedeSegment);
            return entry ? [{ label: entry.label }] : [];
        }

        if (!routeInfo.key || !routeInfo.basePath) return [];

        const label = businessRouteLabel(routeInfo.key, { catalogLabel });

        // Le tab di Impostazioni sono la stessa pagina (§51.12).
        if (routeInfo.isDetail && routeInfo.key !== "settings") {
            // Detail route senza items registrati (fase di caricamento iniziale):
            // solo il segmento intermedio col link al list-root. Il leaf
            // comparirà quando la pagina chiamerà `useBreadcrumbItems`.
            return [{ label, to: routeInfo.basePath }];
        }

        return [{ label }];
    }, [registeredItems, sedeSegment, routeInfo, catalogLabel]);

    if (items.length === 0) return null;

    return (
        <div className={inBar ? styles.inBar : styles.row}>
            {!inBar && (
                <span className={styles.separator} aria-hidden="true">
                    /
                </span>
            )}
            <Breadcrumb items={items} />
        </div>
    );
}
