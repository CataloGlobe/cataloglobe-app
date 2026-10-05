import { Search } from "lucide-react";
import { Logo } from "@/components/ui/Logo/Logo";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import styles from "./CrmShell.module.scss";

interface CrmNavBrandProps {
    collapsed: boolean;
    onSearch: () => void;
}

/** In cima alla barra (7A2): il marchio del CRM e Cerca ⌘K. Chiusa, solo le icone. */
export function CrmNavBrand({ collapsed, onSearch }: CrmNavBrandProps) {
    const searchButton = (
        <button type="button" className={styles.brandSearch} onClick={onSearch} aria-label="Cerca nel CRM (⌘K)">
            <Search size={16} aria-hidden="true" />
            {!collapsed && (
                <>
                    <Text as="span" variant="body-sm" className={styles.brandSearchText}>
                        Cerca
                    </Text>
                    <kbd className={styles.kbd}>⌘K</kbd>
                </>
            )}
        </button>
    );
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
            {collapsed ? (
                <Tooltip content="Cerca (⌘K)" side="right" sideOffset={12}>
                    <span>{searchButton}</span>
                </Tooltip>
            ) : (
                searchButton
            )}
        </div>
    );
}
