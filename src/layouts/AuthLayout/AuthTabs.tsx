import { Link } from "react-router-dom";
import styles from "./AuthTabs.module.scss";

type AuthTabsProps = {
    active: "login" | "signup";
    /** Prima di andare alla registrazione (per esempio per salvare l'invito). */
    onSignupClick?: () => void;
};

/** Interruttore Accedi | Registrati in cima alla scheda. Sono due pagine, quindi due link. */
export function AuthTabs({ active, onSignupClick }: AuthTabsProps) {
    return (
        <nav className={styles.tabs} aria-label="Accedi o registrati">
            <Link
                to="/login"
                className={`${styles.tab} ${active === "login" ? styles.active : ""}`}
                aria-current={active === "login" ? "page" : undefined}
            >
                Accedi
            </Link>
            <Link
                to="/sign-up"
                className={`${styles.tab} ${active === "signup" ? styles.active : ""}`}
                aria-current={active === "signup" ? "page" : undefined}
                onClick={onSignupClick}
            >
                Registrati
            </Link>
        </nav>
    );
}
