import { HeaderLogo } from "./HeaderLogo";
import { HeaderTenantSwitcher } from "./HeaderTenantSwitcher";
import { HeaderNotifications } from "./HeaderNotifications";
import { HeaderUserMenu } from "./HeaderUserMenu";
import styles from "./AppHeader.module.scss";

export function AppHeader() {
    return (
        <div className={styles.appHeader}>
            <div className={styles.left}>
                <HeaderLogo />
                <span className={styles.separator} aria-hidden="true">/</span>
                <HeaderTenantSwitcher />
            </div>
            <div className={styles.right}>
                <HeaderNotifications />
                <HeaderUserMenu />
            </div>
        </div>
    );
}
