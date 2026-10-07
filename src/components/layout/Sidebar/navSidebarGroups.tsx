import type { ReactNode } from "react";
import {
    BookUser,
    CalendarClock,
    CalendarDays,
    ChartColumn,
    ChefHat,
    ClipboardList,
    ConciergeBell,
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
    Utensils
} from "lucide-react";
import { canSeeNavEntry, entryPath, type NavEntry, type NavKey, type NavModel } from "@/utils/navModel";
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
    programmazione: <CalendarClock size={20} />,
    styles: <Palette size={20} />,
    featured: <Megaphone size={20} />,
    stories: <ScrollText size={20} />,
    languages: <Languages size={20} />,
    servizio: <ConciergeBell size={20} />,
    prenotazioni: <CalendarDays size={20} />,
    comande: <ClipboardList size={20} />,
    storico: <History size={20} />,
    analytics: <ChartColumn size={20} />,
    reviews: <Star size={20} />,
    analitiche: <ChartColumn size={20} />,
    recensioni: <Star size={20} />,
    guests: <BookUser size={20} />,
    settings: <Settings size={20} />,
    support: <LifeBuoy size={20} />
};

export interface NavSidebarOptions {
    businessId: string;
    /** La sede delle voci di sede: quella del path, o l'unica leggibile. */
    activityId: string | null;
    catalogLabel: string;
}

function toItem(entry: NavEntry, options: NavSidebarOptions): SidebarNavItem {
    const { businessId, activityId, catalogLabel } = options;
    const base = `/business/${businessId}/locations/${activityId ?? ""}`;
    return {
        to: entryPath(entry, businessId, activityId),
        label: entry.verticalLabel ? catalogLabel : entry.label,
        icon: ICONS[entry.key],
        end: entry.end,
        permission: perms => canSeeNavEntry(entry, perms, activityId),
        requiresFeature: entry.requiresFeature,
        matchPrefixes: entry.level === "sede" ? entry.matchSegments?.map(s => `${base}/${s}`) : undefined,
        showTranslationBadge: entry.signal === "translations",
        showImportBadge: entry.signal === "import",
        showUnreadDot: entry.signal === "supportUnread"
    };
}

/** Gruppi e piede del contesto, nella forma di `buildSidebarGroups`. */
export function navSidebarGroups(
    model: NavModel,
    options: NavSidebarOptions
): { groups: SidebarNavGroup[]; footer: SidebarNavGroup[] } {
    return {
        groups: model.groups.map(g => ({ title: g.title, items: g.entries.map(e => toItem(e, options)) })),
        footer: [{ title: null, items: model.footer.map(e => toItem(e, options)) }]
    };
}
