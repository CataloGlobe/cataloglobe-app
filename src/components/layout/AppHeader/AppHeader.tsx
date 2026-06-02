import { Menu } from "lucide-react";
import { HeaderLogo } from "./HeaderLogo";
import { HeaderTenantSwitcher } from "./HeaderTenantSwitcher";
import { HeaderNotifications } from "./HeaderNotifications";
import { HeaderUserMenu } from "./HeaderUserMenu";
import { NavbarBreadcrumb } from "./NavbarBreadcrumb";
import styles from "./AppHeader.module.scss";

interface AppHeaderProps {
    onOpenMobileSidebar?: () => void;
}

export function AppHeader({ onOpenMobileSidebar }: AppHeaderProps) {
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
                <HeaderNotifications />
                <HeaderUserMenu />
            </div>
        </div>
    );
}
