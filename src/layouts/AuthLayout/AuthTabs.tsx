import { Link, useNavigate } from "react-router-dom";
import styles from "./AuthTabs.module.scss";

type AuthTabsProps = {
    active: "login" | "signup";
    /** Prima di andare alla registrazione (per esempio per salvare l'invito). */
    onSignupClick?: () => void;
};

const PATHS = { login: "/login", signup: "/sign-up" } as const;

/**
 * Aspetta che la pagina nuova sia nel DOM (scheda attiva giusta), al massimo 800 ms.
 * Niente requestAnimationFrame: durante una View Transition il browser non disegna
 * e i rAF non partono finché questa promessa non si chiude.
 */
function waitForTab(path: string): Promise<void> {
    const selector = `[data-auth-tabs] a[href="${path}"][aria-current="page"]`;
    return new Promise((resolve) => {
        if (document.querySelector(selector)) return resolve();
        const done = () => {
            observer.disconnect();
            window.clearTimeout(timer);
            resolve();
        };
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) done();
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current"] });
        const timer = window.setTimeout(done, 800);
    });
}

/**
 * Interruttore Accedi | Registrati in cima alla scheda. Sono due pagine, quindi due
 * link; con le View Transitions del browser l'indicatore scorre e il modulo cambia
 * in dissolvenza (CSS in AuthLayout.module.scss). Senza, il cambio è secco come prima.
 */
export function AuthTabs({ active, onSignupClick }: AuthTabsProps) {
    const navigate = useNavigate();

    // Il cambio di pagina dentro una View Transition del browser, a mano: l'opzione
    // viewTransition dei Link non arriva al router con le Routes discendenti di App.
    const switchTo = (to: "login" | "signup") => (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (to === "signup") onSignupClick?.();
        const canAnimate =
            typeof document.startViewTransition === "function" &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (to === active || !canAnimate || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        // Verso dove scorre il modulo: lo legge il CSS delle transizioni.
        document.documentElement.dataset.authSwitch = to === "signup" ? "next" : "prev";
        document.startViewTransition(() => {
            navigate(PATHS[to]);
            return waitForTab(PATHS[to]);
        });
    };

    return (
        <nav className={styles.tabs} aria-label="Accedi o registrati" data-auth-tabs>
            <span className={`${styles.pill} ${active === "signup" ? styles.pillRight : ""}`} aria-hidden="true" />
            <Link
                to={PATHS.login}
                className={`${styles.tab} ${styles.tabLogin} ${active === "login" ? styles.active : ""}`}
                aria-current={active === "login" ? "page" : undefined}
                onClick={switchTo("login")}
            >
                Accedi
            </Link>
            <Link
                to={PATHS.signup}
                className={`${styles.tab} ${styles.tabSignup} ${active === "signup" ? styles.active : ""}`}
                aria-current={active === "signup" ? "page" : undefined}
                onClick={switchTo("signup")}
            >
                Registrati
            </Link>
        </nav>
    );
}
