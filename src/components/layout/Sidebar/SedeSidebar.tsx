import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { AppSidebar } from "@/components/layout/AppSidebar/AppSidebar";
import { NAV_MODELS } from "@/utils/navModel";
import { buildSidebarGroups } from "./sidebarItems";
import { navSidebarGroups } from "./navSidebarGroups";
import type { SidebarSignalProps } from "./TenantSidebar";
import styles from "./SedeSidebar.module.scss";

/**
 * SedeSidebar — il costruttore delle voci **dentro una sede**, quando chi
 * guarda ne legge più di una (§51.4): il locale, Operatività, Andamento
 * della sede. In testa solo «← Tutte le sedi»: nome e stato della sede
 * stanno nell'header (§51.7).
 *
 * I permessi si chiedono **su questa sede** (`canDoOnActivity`): dentro il
 * contesto la domanda è «posso qui», non «posso da qualche parte».
 */

export interface SedeSidebarProps extends SidebarSignalProps {
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
}

const BACK_LABEL = "Tutte le sedi";

export default function SedeSidebar({
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse,
    translationPendingCount = 0,
    importInProgress = false,
    supportUnread = false
}: SedeSidebarProps) {
    const { businessId = "", activityId = "" } = useParams<{ businessId: string; activityId: string }>();
    const { t } = useTranslation("admin");
    const { catalogLabel } = useVerticalConfig();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const { groups, footer } = navSidebarGroups(NAV_MODELS.sede, {
        businessId,
        activityId,
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

    const backTo = `/business/${businessId}/locations`;
    const collapsedDesktop = !isMobile && collapsed;

    // Stessa riga aperta e chiusa: chiusa resta la freccia, il nome passa al
    // tooltip (§51.15).
    const back = (
        <Link to={backTo} className={styles.back} onClick={() => isMobile && onRequestClose()}>
            <ArrowLeft size={18} aria-hidden="true" />
            <Text as="span" variant="body-sm" className={styles.backLabel}>
                {BACK_LABEL}
            </Text>
        </Link>
    );
    const header = collapsedDesktop ? (
        <Tooltip content={BACK_LABEL} side="right" sideOffset={12}>
            {back}
        </Tooltip>
    ) : (
        back
    );

    return (
        <AppSidebar
            groups={buildSidebarGroups(groups, options)}
            footerItems={buildSidebarGroups(footer, options).flatMap(g => g.items)}
            isMobile={isMobile}
            mobileOpen={mobileOpen}
            collapsed={collapsed}
            onRequestClose={onRequestClose}
            onToggleCollapse={onToggleCollapse}
            headerSlot={header}
        />
    );
}
