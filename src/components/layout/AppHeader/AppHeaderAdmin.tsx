import { Menu } from "lucide-react";
import { HeaderLogo } from "./HeaderLogo";
import { HeaderUserMenu } from "./HeaderUserMenu";
import styles from "./AppHeader.module.scss";

interface AppHeaderAdminProps {
    onOpenMobileSidebar?: () => void;
}

/**
 * Header dell'area admin di piattaforma.
 *
 * Rispetto a `AppHeaderWorkspace`: niente tenant pill e niente notifiche —
 * sono entrambe tenant-scoped e qui non hanno un tenant a cui riferirsi.
 * Restano logo, etichetta di contesto e menu utente.
 */
export function AppHeaderAdmin({ onOpenMobileSidebar }: AppHeaderAdminProps) {
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
                <span className={styles.greeting}>Area admin</span>
            </div>
            <div className={styles.right}>
                <HeaderUserMenu />
            </div>
        </div>
    );
}
