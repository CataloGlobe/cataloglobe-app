import { useTenant } from "@/context/useTenant";
import { Avatar } from "@/components/ui/Avatar";
import styles from "./AppHeader.module.scss";

const TENANT_GRADIENT = "linear-gradient(135deg, #818CF8, #6366F1)";

/**
 * L'azienda in testata, al telefono: solo il nome. Si cambia dal menù
 * dell'account in fondo alla sidebar, come da computer (Alex 2026-10-09).
 */
export function HeaderTenantName() {
    const { selectedTenant } = useTenant();
    if (!selectedTenant) return null;
    return (
        <span className={styles.tenantLabel}>
            <Avatar name={selectedTenant.name} gradient={TENANT_GRADIENT} size="sm" />
            <span className={styles.tenantName}>{selectedTenant.name}</span>
        </span>
    );
}
