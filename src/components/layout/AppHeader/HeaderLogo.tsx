import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Logo/Logo";
import { useTenant } from "@/context/useTenant";
import styles from "./AppHeader.module.scss";

export function HeaderLogo() {
    const { selectedTenantId } = useTenant();

    // globalHeader ha sfondo fisso #fff (non theme-aware) — color="flat" esplicito,
    // "auto" romperebbe in dark mode (logo bianco su sfondo bianco).
    const content = <Logo variant="icon" color="flat" size={24} alt="" className={styles.logoImage} />;

    if (!selectedTenantId) {
        return <div className={styles.logoLink}>{content}</div>;
    }

    return (
        // L'ingresso nell'azienda (§51.6): decide `BusinessHomeRedirect`.
        <Link
            to={`/business/${selectedTenantId}`}
            className={styles.logoLink}
            title="Vai all'inizio"
            aria-label="CataloGlobe — Vai all'inizio"
        >
            {content}
        </Link>
    );
}
