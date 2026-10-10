import type { ReactNode } from "react";
import {
    BookUser,
    CalendarClock,
    CalendarDays,
    CalendarRange,
    ChartColumn,
    ChefHat,
    ClipboardList,
    ConciergeBell,
    CreditCard,
    Eye,
    History,
    LayoutDashboard,
    Languages,
    LifeBuoy,
    Megaphone,
    Palette,
    ScrollText,
    Settings,
    Star,
    Store,
    Users,
    Utensils,
    UtensilsCrossed
} from "lucide-react";
import {
    ACCOUNT_ENTRIES,
    canSeeNavEntry,
    entryPath,
    type NavEntry,
    type NavGroupKey,
    type NavKey,
    type NavModel
} from "@/utils/navModel";
import type { SidebarNavGroup, SidebarNavItem } from "./sidebarItems";

/**
 * Dal modello di navigazione (`utils/navModel`) alle voci di sidebar: qui si
 * aggiungono icone, indirizzi e segnali. Voci, ordine e gate stanno nel
 * modello; il filtro per permessi e piano in `buildSidebarGroups`.
 */

// Allegato B delle correzioni UI: un'icona per concetto, Lucide a 20 px; lo
// stesso oggetto ha la stessa icona ovunque (Sedi = `Store`, come il selettore
// della sede; Menù, Storie e Recensioni come la barra della pagina pubblica).
// `Sparkles` resta all'AI.
const ICONS: Record<NavKey, ReactNode> = {
    overview: <LayoutDashboard size={20} />,
    locations: <Store size={20} />,
    anagrafica: <Store size={20} />,
    "cosa-vedono": <Eye size={20} />,
    catalogs: <Utensils size={20} />,
    products: <ChefHat size={20} />,
    scheduling: <CalendarClock size={20} />,
    calendario: <CalendarRange size={20} />,
    programmazione: <CalendarClock size={20} />,
    styles: <Palette size={20} />,
    featured: <Megaphone size={20} />,
    stories: <ScrollText size={20} />,
    languages: <Languages size={20} />,
    servizio: <ConciergeBell size={20} />,
    sala: <UtensilsCrossed size={20} />,
    prenotazioni: <CalendarDays size={20} />,
    comande: <ClipboardList size={20} />,
    storico: <History size={20} />,
    analytics: <ChartColumn size={20} />,
    reviews: <Star size={20} />,
    analitiche: <ChartColumn size={20} />,
    recensioni: <Star size={20} />,
    guests: <BookUser size={20} />,
    settings: <Settings size={20} />,
    team: <Users size={20} />,
    billing: <CreditCard size={20} />,
    support: <LifeBuoy size={20} />
};

// Le sei sezioni, con le icone dell'artifact v4 (Alex, 2026-10-09).
const GROUP_ICONS: Record<NavGroupKey, ReactNode> = {
    overview: <LayoutDashboard size={20} />,
    crea: <Utensils size={20} />,
    calendario: <CalendarClock size={20} />,
    servizio: <ConciergeBell size={20} />,
    numeri: <ChartColumn size={20} />,
    sedi: <Store size={20} />
};

export interface NavSidebarOptions {
    businessId: string;
    /** La sede in vista: quella del path, o l'unica leggibile. */
    activityId: string | null;
    /**
     * La sede delle parti che ne chiedono una (Servizio, Cosa vedono i
     * clienti) quando nessuna è in vista: l'ultima usata, o la prima.
     */
    defaultActivityId?: string | null;
    catalogLabel: string;
}

function toItem(entry: NavEntry, options: NavSidebarOptions): SidebarNavItem {
    const { businessId, catalogLabel } = options;
    // Le parti di sede vanno nella sede in vista, o in quella di ripiego; le
    // parti con la gemella solo nella sede in vista (senza: tutte le sedi).
    const activityId =
        entry.level === "sede" ? (options.activityId ?? options.defaultActivityId ?? null) : options.activityId;
    const base = `/business/${businessId}/locations/${activityId ?? ""}`;
    return {
        id: entry.key,
        search: entry.search,
        to: entryPath(entry, businessId, activityId),
        label: entry.verticalLabel ? catalogLabel : entry.label,
        icon: ICONS[entry.key],
        end: entry.end,
        permission: perms => canSeeNavEntry(entry, perms, activityId),
        requiresFeature: entry.requiresFeature,
        matchPrefixes: activityId ? entry.matchSegments?.map(s => `${base}/${s}`) : undefined,
        showTranslationBadge: entry.signal === "translations",
        showImportBadge: entry.signal === "import",
        showUnreadDot: entry.signal === "supportUnread"
    };
}

/**
 * Gruppi del contesto e voci del menù dell'account, nella forma di
 * `buildSidebarGroups`. Le voci dell'account sono dell'azienda: niente sede.
 */
export function navSidebarGroups(
    model: NavModel,
    options: NavSidebarOptions
): { groups: SidebarNavGroup[]; account: SidebarNavGroup[] } {
    return {
        groups: model.groups.map(g => ({
            key: g.key,
            title: g.title,
            icon: GROUP_ICONS[g.key],
            items: g.entries.map(e => toItem(e, options))
        })),
        account: [{ title: null, items: ACCOUNT_ENTRIES.map(e => toItem(e, { ...options, activityId: null })) }]
    };
}
