import { HeaderLogo } from "./HeaderLogo";
import { HeaderNotifications } from "./HeaderNotifications";
import { HeaderUserMenu } from "./HeaderUserMenu";
import styles from "./AppHeader.module.scss";

/**
 * Testata del Workspace: logo a sinistra, notifiche e avatar a destra. Il
 * saluto col nome sta in pagina (T17 WS1), non più qui.
 */
export function AppHeaderWorkspace() {
    return (
        <div className={styles.appHeader}>
            <div className={styles.left}>
                <HeaderLogo />
            </div>
            <div className={styles.right}>
                <HeaderNotifications scope="account" />
                <HeaderUserMenu />
            </div>
        </div>
    );
}
