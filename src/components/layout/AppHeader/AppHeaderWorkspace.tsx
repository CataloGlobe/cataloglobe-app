import { Menu } from "lucide-react";
import { HeaderLogo } from "./HeaderLogo";
import { HeaderNotifications } from "./HeaderNotifications";
import { HeaderUserMenu } from "./HeaderUserMenu";
import styles from "./AppHeader.module.scss";

interface AppHeaderWorkspaceProps {
    onOpenMobileSidebar?: () => void;
}

export function AppHeaderWorkspace({ onOpenMobileSidebar }: AppHeaderWorkspaceProps) {
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
            </div>
            <div className={styles.right}>
                <HeaderNotifications />
                <HeaderUserMenu />
            </div>
        </div>
    );
}
