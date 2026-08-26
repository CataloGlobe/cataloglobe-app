import { Menu } from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { HeaderLogo } from "./HeaderLogo";
import { HeaderTenantSwitcher } from "./HeaderTenantSwitcher";
import { HeaderNotifications } from "./HeaderNotifications";
import { HeaderUserMenu } from "./HeaderUserMenu";
import { NavbarBreadcrumb } from "./NavbarBreadcrumb";
import { AiUsagePill } from "./AiUsagePill";
import type { AiUsageCycle } from "@/types/aiUsage";
import styles from "./AppHeader.module.scss";

interface AppHeaderProps {
    onOpenMobileSidebar?: () => void;
    /** Stato quota AI (FASE 5). La pill compare solo in warning/blocked. */
    aiUsage?: AiUsageCycle | null;
}

export function AppHeader({ onOpenMobileSidebar, aiUsage = null }: AppHeaderProps) {
    const { selectedTenantId } = useTenant();
    return (
        <div className={styles.appHeader}>
            <div className={styles.left}>
                {onOpenMobileSidebar && (
                    <button
                        type="button"
                        className={styles.mobileMenuToggle}
                        onClick={onOpenMobileSidebar}
                        aria-label="Apri menù di navigazione"
                    >
                        <Menu size={20} />
                    </button>
                )}
                <HeaderLogo />
                <span className={styles.separator} aria-hidden="true">/</span>
                <HeaderTenantSwitcher />
                <NavbarBreadcrumb />
            </div>
            <div className={styles.right}>
                <AiUsagePill usage={aiUsage} />
                <HeaderNotifications scope="tenant" tenantId={selectedTenantId} />
                <HeaderUserMenu />
            </div>
        </div>
    );
}
