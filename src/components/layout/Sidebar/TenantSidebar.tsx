import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { AppSidebar } from "@/components/layout/AppSidebar/AppSidebar";
import { SidebarAccount } from "@/components/layout/AppSidebar/SidebarAccount";
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
    /**
     * Sedi non ancora arrivate: il contesto non si sa ancora (una o più
     * sedi), quindi niente voci invece di un contesto provvisorio che poi
     * cambia sotto gli occhi.
     */
    loading?: boolean;
}

export default function TenantSidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse,
    context = "azienda",
    activityId = null,
    loading = false,
    translationPendingCount = 0,
    importInProgress = false,
    supportUnread = false
}: TenantSidebarProps) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { t } = useTranslation("admin");
    const { catalogLabel } = useVerticalConfig();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const { groups, account } = navSidebarGroups(NAV_MODELS[context], {
        businessId,
        activityId: context === "unica" ? activityId : null,
        catalogLabel
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
            groups={loading ? [] : buildSidebarGroups(groups, options)}
            accountSlot={
                <SidebarAccount
                    items={loading ? [] : buildSidebarGroups(account, options).flatMap(g => g.items)}
                    collapsed={!isMobile && collapsed}
                    isMobile={isMobile}
                    onRequestClose={onRequestClose}
                />
            }
            isMobile={isMobile}
            mobileOpen={mobileOpen}
            collapsed={collapsed}
            onRequestClose={onRequestClose}
            onToggleCollapse={onToggleCollapse}
        />
    );
}
