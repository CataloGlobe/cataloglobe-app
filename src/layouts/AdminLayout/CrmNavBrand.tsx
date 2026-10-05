import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo/Logo";
import Text from "@/components/ui/Text/Text";
import styles from "./CrmShell.module.scss";

interface CrmNavBrandProps {
    collapsed: boolean;
    /** Il Cerca (CrmSearch): campo con la barra aperta, icona con la barra chiusa. */
    search: ReactNode;
}

/** In cima alla barra (7A2): il marchio del CRM e il Cerca. Chiusa, solo le icone. */
export function CrmNavBrand({ collapsed, search }: CrmNavBrandProps) {
    return (
        <div className={styles.brand} data-collapsed={collapsed}>
            <div className={styles.brandMark}>
                <Logo variant="icon" color="mono-white" size={22} alt="" />
                {!collapsed && (
                    <Text as="span" variant="body-sm" weight={600} className={styles.brandName}>
                        CataloGlobe <span className={styles.brandTag}>CRM</span>
                    </Text>
                )}
            </div>
            {search}
        </div>
    );
}
