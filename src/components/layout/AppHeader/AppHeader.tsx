import { Menu } from "lucide-react";
import { HeaderLogo } from "./HeaderLogo";
import { HeaderTenantSwitcher } from "./HeaderTenantSwitcher";
import { HeaderNotifications } from "./HeaderNotifications";
import { HeaderUserMenu } from "./HeaderUserMenu";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { useBreadcrumb } from "@/context/useBreadcrumb";
import styles from "./AppHeader.module.scss";

interface AppHeaderProps {
    onOpenMobileSidebar?: () => void;
}

export function AppHeader({ onOpenMobileSidebar }: AppHeaderProps) {
    const { items: breadcrumbItems } = useBreadcrumb();

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
                {breadcrumbItems.length > 0 && (
                    <>
                        <span className={styles.separator} aria-hidden="true">/</span>
                        <div className={styles.headerBreadcrumb}>
                            <Breadcrumb items={breadcrumbItems} />
                        </div>
                    </>
                )}
            </div>
            <div className={styles.right}>
                <HeaderNotifications />
                <HeaderUserMenu />
            </div>
        </div>
    );
}
