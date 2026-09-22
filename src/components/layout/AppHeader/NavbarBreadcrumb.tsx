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
import { Store } from "lucide-react";
import Breadcrumb, { type BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";
import Text from "@/components/ui/Text/Text";
import { useActivitySummary } from "@/hooks/useActivitySummary";
import { useBreadcrumb } from "@/context/useBreadcrumb";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { useSedeScope } from "@/hooks/useSedeScope";
import { SedeScopeSelect } from "@/components/ui/SedeScopeSelect/SedeScopeSelect";
import {
    businessRouteLabel,
    SEDE_NAVBAR_ROUTES,
    SEDE_SINGLE_SITE_ROUTES,
    resolveBusinessRoute,
    type BusinessRouteKey
} from "./navbarBreadcrumbRoutes";
import styles from "./NavbarBreadcrumb.module.scss";

/** `/business/:businessId/locations/:activityId[/...]` — dentro una sede. */
const SEDE_CONTEXT_PATH = /^\/business\/[^/]+\/locations\/([^/]+)/;

/**
 * Dentro il contesto di sede la navbar dice **quale** sede, e basta: il
 * selettore di scope non compare (§46.1 g — due dichiarazioni di scope nella
 * stessa schermata sono una di troppo) e la briciola non ripete il nome, che
 * è già qui e nella sidebar.
 */
function NavbarSedePill({ activityId }: { activityId: string }) {
    const summary = useActivitySummary(activityId);
    if (!summary) return null;
    // Solo il nome: lo stato lo dice l'intestazione della sidebar, e sulla
    // scheda anche la testata della pagina. Tre volte nella stessa schermata
    // erano due di troppo.
    return (
        <span className={styles.sedePill}>
            <Store size={14} aria-hidden="true" />
            <Text as="span" variant="body-sm" weight={500} className={styles.sedeName}>
                {summary.name}
            </Text>
        </span>
    );
}

/**
 * Segmento sede + separator di chiusura. Renderizzato solo se l'utente
 * ha più di una sede leggibile (altrimenti il selettore non aggiunge
 * valore). Il check viene fatto qui via useSedeScope per evitare
 * separator orfano quando SedeScopeSelect auto-nasconde.
 */
function NavbarSedeSegment({ routeKey }: { routeKey: BusinessRouteKey }) {
    const { readableActivities, isForcedSingleSite } = useSedeScope({ routeKey });
    if (isForcedSingleSite || readableActivities.length === 0) return null;
    const allowAll = !SEDE_SINGLE_SITE_ROUTES.has(routeKey);
    return (
        <>
            <SedeScopeSelect allowAll={allowAll} routeKey={routeKey} />
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

    const sedeActivityId = SEDE_CONTEXT_PATH.exec(pathname)?.[1];

    const items = useMemo<BreadcrumbItem[]>(() => {
        // Se una pagina di dettaglio ha registrato i propri segmenti,
        // usali tal quali: la pagina sa già come mostrare la propria chain.
        if (registeredItems.length > 0) return registeredItems;

        if (!routeInfo.key || !routeInfo.basePath) return [];

        const label = businessRouteLabel(routeInfo.key, { catalogLabel });

        if (routeInfo.isDetail) {
            // Detail route senza items registrati (fase di caricamento iniziale,
            // o pagine di dettaglio non ancora migrate): rendi solo il segmento
            // intermedio col link al list-root. Il leaf comparirà quando la
            // pagina chiamerà `useBreadcrumbItems`.
            return [{ label, to: routeInfo.basePath }];
        }

        return [{ label }];
    }, [registeredItems, routeInfo, catalogLabel]);

    // Sede mostrata SOLO sulla list-root della route (non sui detail).
    // Es. `/scheduling` → sì; `/scheduling/:ruleId` → no.
    const showSedeSelector = routeInfo.key
        ? SEDE_NAVBAR_ROUTES.has(routeInfo.key) && !routeInfo.isDetail
        : false;

    if (sedeActivityId) {
        return (
            <div className={styles.row}>
                <span className={styles.separator} aria-hidden="true">/</span>
                <NavbarSedePill activityId={sedeActivityId} />
            </div>
        );
    }

    if (items.length === 0 && !showSedeSelector) return null;

    // Layout: [separator] [SedeScopeSegment] [Breadcrumb]
    // Il NavbarSedeSegment include il suo separator di chiusura, così
    // separator + select scompaiono insieme quando auto-hidden.
    return (
        <div className={styles.row}>
            <span className={styles.separator} aria-hidden="true">/</span>
            {showSedeSelector && routeInfo.key && (
                <NavbarSedeSegment routeKey={routeInfo.key} />
            )}
            {items.length > 0 && <Breadcrumb items={items} />}
        </div>
    );
}
