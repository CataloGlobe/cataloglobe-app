import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    LayoutDashboard,
    Store,
    ClipboardList,
    CalendarCheck,
    LifeBuoy,
    Settings,
    Calendar,
    BookOpen,
    BookOpenText,
    Pin,
    Palette,
    BarChart3,
    MessageSquare,
    Users,
    BookUser,
    CreditCard,
    Languages,
    Archive
} from "lucide-react";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnTenant, canDoOnAnyActivity } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { businessRouteLabel } from "@/components/layout/AppHeader/navbarBreadcrumbRoutes";
import { AppSidebar } from "@/components/layout/AppSidebar/AppSidebar";
import { buildSidebarGroups, type SidebarNavGroup } from "./sidebarItems";

/**
 * TenantSidebar — il costruttore delle voci del contesto **azienda** (scheda
 * «AppSidebar»): dichiara le voci con la loro etichetta da
 * `businessRouteLabel` (fonte unica dei nomi di pagina) e il permesso che le
 * merita; il filtro per permessi, piano e segnali è condiviso con la sidebar
 * di sede (`buildSidebarGroups`). Il markup è tutto di `AppSidebar`.
 */

function buildGroups(businessId: string, catalogLabel: string): SidebarNavGroup[] {
    const b = `/business/${businessId}`;
    return [
        {
            title: null,
            items: [
                {
                    to: `${b}/overview`,
                    label: businessRouteLabel("overview"),
                    icon: <LayoutDashboard size={18} />,
                    end: true
                }
            ]
        },
        {
            title: "Operatività",
            items: [
                { to: `${b}/locations`, label: businessRouteLabel("locations"), icon: <Store size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "activity.read") },
                { to: `${b}/orders`, label: businessRouteLabel("orders"), icon: <ClipboardList size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "orders.read"),
                  requiresFeature: "table_ordering" },
                { to: `${b}/reservations`, label: businessRouteLabel("reservations"), icon: <CalendarCheck size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "reservations.read"),
                  requiresFeature: "table_reservation" },
                { to: `${b}/scheduling`, label: businessRouteLabel("scheduling"), icon: <Calendar size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "scheduling.read") }
            ]
        },
        {
            title: "Contenuti",
            items: [
                { to: `${b}/catalogs`, label: businessRouteLabel("catalogs", { catalogLabel }), icon: <BookOpen size={18} />,
                  permission: perms => canDoOnTenant(perms, "catalogs.read"),
                  showImportBadge: true },
                { to: `${b}/products`, label: businessRouteLabel("products"), icon: <Archive size={18} />,
                  permission: perms => canDoOnTenant(perms, "products.read") },
                {
                    to: `${b}/featured`,
                    label: businessRouteLabel("featured"),
                    icon: <Pin size={18} />,
                    permission: perms => canDoOnAnyActivity(perms, "featured.read")
                },
                {
                    to: `${b}/stories`,
                    label: businessRouteLabel("stories"),
                    icon: <BookOpenText size={18} />,
                    permission: perms => canDoOnAnyActivity(perms, "stories.read")
                },
                { to: `${b}/styles`, label: businessRouteLabel("styles"), icon: <Palette size={18} />,
                  permission: perms => canDoOnTenant(perms, "styles.read") },
                { to: `${b}/languages`, label: businessRouteLabel("languages"), icon: <Languages size={18} />,
                  permission: perms => canDoOnTenant(perms, "catalogs.read"),
                  showTranslationBadge: true }
            ]
        },
        {
            title: "Insight",
            items: [
                { to: `${b}/analytics`, label: businessRouteLabel("analytics"), icon: <BarChart3 size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "analytics.read") },
                { to: `${b}/reviews`, label: businessRouteLabel("reviews"), icon: <MessageSquare size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "reviews.read") },
                // Sta in Insight e non in Operatività: nessuno compila la
                // rubrica: si popola da sola dall'interazione con gli
                // avventori, come analitiche e recensioni. Il gate di piano
                // resta `table_reservation` finché le prenotazioni sono
                // l'unica sorgente dei profili — quando arriveranno anche
                // dagli ordini al tavolo andrà allargato, non spostato.
                { to: `${b}/guests`, label: businessRouteLabel("guests"), icon: <BookUser size={18} />,
                  permission: perms => canDoOnAnyActivity(perms, "guests.read"),
                  requiresFeature: "table_reservation" }
            ]
        },
        {
            title: "Sistema",
            items: [
                { to: `${b}/team`, label: businessRouteLabel("team"), icon: <Users size={18} />,
                  permission: perms => canDoOnTenant(perms, "team.read") },
                { to: `${b}/subscription`, label: businessRouteLabel("subscription"), icon: <CreditCard size={18} />,
                  permission: perms => canDoOnTenant(perms, "billing.read") },
                {
                    to: `${b}/settings`,
                    label: businessRouteLabel("settings"),
                    icon: <Settings size={18} />,
                    end: true
                },
                // "Assistenza" e non "Aiuto": "Aiuto" fa pensare alla
                // documentazione, questo è un canale verso una persona.
                //
                // Gate su `canDoOnTenant` e non su `canDoOnAnyActivity`,
                // deliberatamente più largo di RLS: un manager senza sedi
                // assegnate possiede support.read ma has_permission_any_activity
                // non lo ammette, quindi la lista gli tornerà vuota. Deve
                // comunque poter raggiungere la pagina — è lì che trova
                // l'indirizzo email con cui chiedere aiuto lo stesso.
                {
                    to: `${b}/support`,
                    label: businessRouteLabel("support"),
                    icon: <LifeBuoy size={18} />,
                    permission: perms => canDoOnTenant(perms, "support.read"),
                    showUnreadDot: true
                }
            ]
        }
    ];
}

export interface TenantSidebarProps {
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
    /** Pending traduzioni tenant-wide (fonte unica: MainLayout). 0 = nessun badge. */
    translationPendingCount?: number;
    /** Import AI in volo (analyzing|creating). Accende lo spinner su Cataloghi. */
    importInProgress?: boolean;
    /**
     * Almeno una richiesta di supporto ha una risposta non letta. Calcolato una
     * volta in MainLayout (fonte unica, come translationPendingCount): la
     * sidebar è montata su ogni pagina e non deve interrogare il DB da sé.
     */
    supportUnread?: boolean;
}

export default function TenantSidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse,
    translationPendingCount = 0,
    importInProgress = false,
    supportUnread = false
}: TenantSidebarProps) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { t } = useTranslation("admin");
    const { catalogLabel } = useVerticalConfig();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const groups = buildSidebarGroups(buildGroups(businessId, catalogLabel), {
        permissions,
        hasFeature,
        signals: {
            translationPendingCount,
            translationLabel: t("sidebar.translations_in_progress"),
            importInProgress,
            supportUnread
        }
    });

    return (
        <AppSidebar
            groups={groups}
            isMobile={isMobile}
            mobileOpen={mobileOpen}
            collapsed={collapsed}
            onRequestClose={onRequestClose}
            onToggleCollapse={onToggleCollapse}
        />
    );
}
