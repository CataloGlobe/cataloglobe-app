import type { ReactNode } from "react";
import {
    Archive,
    BarChart3,
    BookOpen,
    BookOpenText,
    BookUser,
    Calendar,
    CalendarCheck,
    ClipboardList,
    Eye,
    History,
    LayoutDashboard,
    LayoutGrid,
    Languages,
    LifeBuoy,
    MessageSquare,
    Palette,
    Pin,
    Settings,
    Store
} from "lucide-react";
import { canSeeNavEntry, entryPath, type NavEntry, type NavKey, type NavModel } from "@/utils/navModel";
import type { SidebarNavGroup, SidebarNavItem } from "./sidebarItems";

/**
 * Dal modello di navigazione (`utils/navModel`) alle voci di sidebar: qui si
 * aggiungono icone, indirizzi e segnali. Voci, ordine e gate stanno nel
 * modello; il filtro per permessi e piano in `buildSidebarGroups`.
 */

const ICONS: Record<NavKey, ReactNode> = {
    overview: <LayoutDashboard size={18} />,
    locations: <Store size={18} />,
    anagrafica: <Store size={18} />,
    "cosa-vedono": <Eye size={18} />,
    catalogs: <BookOpen size={18} />,
    products: <Archive size={18} />,
    scheduling: <Calendar size={18} />,
    styles: <Palette size={18} />,
    featured: <Pin size={18} />,
    stories: <BookOpenText size={18} />,
    languages: <Languages size={18} />,
    servizio: <LayoutGrid size={18} />,
    prenotazioni: <CalendarCheck size={18} />,
    comande: <ClipboardList size={18} />,
    storico: <History size={18} />,
    analytics: <BarChart3 size={18} />,
    reviews: <MessageSquare size={18} />,
    analitiche: <BarChart3 size={18} />,
    recensioni: <MessageSquare size={18} />,
    guests: <BookUser size={18} />,
    settings: <Settings size={18} />,
    support: <LifeBuoy size={18} />
};

export interface NavSidebarOptions {
    businessId: string;
    /** La sede delle voci di sede: quella del path, o l'unica leggibile. */
    activityId: string | null;
    catalogLabel: string;
    /** Recensioni in attesa nel perimetro della voce (azienda o sede). */
    reviewsPendingCount?: number;
}

function toItem(entry: NavEntry, options: NavSidebarOptions): SidebarNavItem {
    const { businessId, activityId, catalogLabel, reviewsPendingCount = 0 } = options;
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
        showUnreadDot: entry.signal === "supportUnread",
        count: entry.signal === "reviewsPending" ? reviewsPendingCount : undefined
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
