import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { AppSidebar } from "@/components/layout/AppSidebar/AppSidebar";
import { NAV_MODELS } from "@/utils/navModel";
import { buildSidebarGroups } from "./sidebarItems";
import { navSidebarGroups } from "./navSidebarGroups";

/**
 * TenantSidebar — il costruttore delle voci fuori da una sede (§51): la
 * sidebar **unica** (una sede leggibile, un elenco solo) e quella
 * dell'**azienda** (più sedi). Voci, ordine e gate stanno in `navModel`; il
 * filtro per permessi, piano e segnali è condiviso con la sidebar di sede
 * (`buildSidebarGroups`). Il markup è tutto di `AppSidebar`.
 */

export interface SidebarSignalProps {
    /** Pending traduzioni tenant-wide (fonte unica: MainLayout). 0 = nessun badge. */
    translationPendingCount?: number;
    /** Import AI in volo (analyzing|creating). Accende lo spinner sul catalogo. */
    importInProgress?: boolean;
    /**
     * Almeno una richiesta di supporto ha una risposta non letta. Calcolato una
     * volta in MainLayout: la sidebar è montata su ogni pagina e non deve
     * interrogare il DB da sé.
     */
    supportUnread?: boolean;
    /**
     * Recensioni in attesa nel perimetro della voce Recensioni (§34.9/1,
     * §51.10): l'azienda fuori, la sede dentro. 0 a chi non ha `reviews.moderate`.
     */
    reviewsPendingCount?: number;
}

export interface TenantSidebarProps extends SidebarSignalProps {
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
    /** `unica` (una sede leggibile) o `azienda` (più sedi, o nessuna). */
    context?: "unica" | "azienda";
    /** Con la sidebar unica: la sola sede, a cui portano le voci di sede. */
    activityId?: string | null;
}

export default function TenantSidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse,
    context = "azienda",
    activityId = null,
    translationPendingCount = 0,
    importInProgress = false,
    supportUnread = false,
    reviewsPendingCount = 0
}: TenantSidebarProps) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { t } = useTranslation("admin");
    const { catalogLabel } = useVerticalConfig();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const { groups, footer } = navSidebarGroups(NAV_MODELS[context], {
        businessId,
        activityId: context === "unica" ? activityId : null,
        catalogLabel,
        reviewsPendingCount
    });
    const options = {
        permissions,
        hasFeature,
        signals: {
            translationPendingCount,
            translationLabel: t("sidebar.translations_in_progress"),
            importInProgress,
            supportUnread
        }
    };

    return (
        <AppSidebar
            groups={buildSidebarGroups(groups, options)}
            footerItems={buildSidebarGroups(footer, options).flatMap(g => g.items)}
            isMobile={isMobile}
            mobileOpen={mobileOpen}
            collapsed={collapsed}
            onRequestClose={onRequestClose}
            onToggleCollapse={onToggleCollapse}
        />
    );
}
