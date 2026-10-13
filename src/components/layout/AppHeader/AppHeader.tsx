import { Menu } from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { HeaderLogo } from "./HeaderLogo";
import { HeaderTenantName } from "./HeaderTenantName";
import { HeaderNotifications } from "./HeaderNotifications";
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
                {/* Percorso a cartelle (§51.8): logo / azienda / pagina. La sede
                    sta in alto a destra nella pagina (D152), l'azienda si
                    cambia dal menù dell'account. */}
                <span className={styles.wideOnly}>
                    <HeaderLogo />
                </span>
                <span className={`${styles.separator} ${styles.wideOnly}`} aria-hidden="true">/</span>
                <HeaderTenantName />
                <NavbarBreadcrumb />
            </div>
            <div className={styles.right}>
                <AiUsagePill usage={aiUsage} />
                <HeaderNotifications scope="tenant" tenantId={selectedTenantId} />
                {/* L'account sta in fondo alla sidebar (Officina): qui solo le notifiche. */}
            </div>
        </div>
    );
}
