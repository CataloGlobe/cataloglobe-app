import { Link } from "react-router-dom";
import logoMark from "@/assets/brand/logo-mark.png";
import { useTenant } from "@/context/useTenant";
import styles from "./AppHeader.module.scss";

export function HeaderLogo() {
    const { selectedTenantId } = useTenant();

    const content = <img src={logoMark} alt="" height={24} className={styles.logoImage} />;

    if (!selectedTenantId) {
        return <div className={styles.logoLink}>{content}</div>;
    }

    return (
        <Link
            to={`/business/${selectedTenantId}/overview`}
            className={styles.logoLink}
            title="Vai alla panoramica"
            aria-label="CataloGlobe — Vai alla panoramica"
        >
            {content}
        </Link>
    );
}
