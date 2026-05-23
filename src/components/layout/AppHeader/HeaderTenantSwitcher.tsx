import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { Avatar } from "@/components/ui/Avatar";
import styles from "./AppHeader.module.scss";

const TENANT_GRADIENT = "linear-gradient(135deg, #818CF8, #6366F1)";

export function HeaderTenantSwitcher() {
    const { tenants, selectedTenant, selectedTenantId, selectTenant } = useTenant();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const handleMouseDown = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open]);

    if (!selectedTenant) return null;

    const handleSelectTenant = (id: string) => {
        setOpen(false);
        if (id !== selectedTenantId) {
            selectTenant(id);
            navigate(`/business/${id}/overview`);
        }
    };

    const handleWorkspace = () => {
        setOpen(false);
        navigate("/workspace");
    };

    return (
        <div className={styles.tenantWrapper} ref={wrapperRef}>
            <button
                type="button"
                className={styles.tenantButton}
                aria-label={`Cambia tenant. Selezionato: ${selectedTenant.name}`}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen(v => !v)}
            >
                <Avatar name={selectedTenant.name} gradient={TENANT_GRADIENT} size="sm" />
                <span className={styles.tenantName}>{selectedTenant.name}</span>
                <ChevronsUpDown size={13} className={styles.tenantChevron} />
            </button>

            {open && (
                <div className={styles.tenantList} role="menu">
                    <div className={styles.tenantListHeader}>I tuoi tenant</div>
                    {tenants.map(t => {
                        const isSelected = t.id === selectedTenantId;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="menuitem"
                                className={styles.tenantRow}
                                onClick={() => handleSelectTenant(t.id)}
                            >
                                <span className={styles.checkSlot}>
                                    {isSelected && <Check size={14} />}
                                </span>
                                <span
                                    className={styles.tenantRowName}
                                    data-active={isSelected ? "true" : undefined}
                                >
                                    {t.name}
                                </span>
                            </button>
                        );
                    })}
                    <div className={styles.tenantListDivider} />
                    <button
                        type="button"
                        role="menuitem"
                        className={styles.tenantRow}
                        onClick={handleWorkspace}
                    >
                        <span className={styles.checkSlot}>
                            <ArrowLeft size={14} />
                        </span>
                        <span className={styles.tenantRowName}>Workspace</span>
                    </button>
                </div>
            )}
        </div>
    );
}
