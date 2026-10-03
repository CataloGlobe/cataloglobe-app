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
    supportUnread = false,
    reviewsPendingCount = 0
}: SedeSidebarProps) {
    const { businessId = "", activityId = "" } = useParams<{ businessId: string; activityId: string }>();
    const { t } = useTranslation("admin");
    const { catalogLabel } = useVerticalConfig();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const { groups, footer } = navSidebarGroups(NAV_MODELS.sede, {
        businessId,
        activityId,
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

    const backTo = `/business/${businessId}/locations`;
    const collapsedDesktop = !isMobile && collapsed;

    const header = collapsedDesktop ? (
        <div className={styles.headerCollapsed}>
            <Tooltip content={BACK_LABEL} side="right" sideOffset={28}>
                <Link to={backTo} className={styles.back} aria-label={BACK_LABEL}>
                    <ArrowLeft size={16} aria-hidden="true" />
                </Link>
            </Tooltip>
        </div>
    ) : (
        <div className={styles.header}>
            <Link to={backTo} className={styles.back} onClick={() => isMobile && onRequestClose()}>
                <ArrowLeft size={16} aria-hidden="true" />
                <Text as="span" variant="caption">
                    {BACK_LABEL}
                </Text>
            </Link>
        </div>
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
