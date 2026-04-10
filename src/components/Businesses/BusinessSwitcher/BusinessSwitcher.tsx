import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Check, ArrowLeft } from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import styles from "./BusinessSwitcher.module.scss";

interface BusinessSwitcherProps {
    collapsed: boolean;
}

export default function BusinessSwitcher({ collapsed }: BusinessSwitcherProps) {
    const { tenants, selectedTenant, selectTenant } = useTenant();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const hasMultiple = tenants.length >= 1;
    const name = selectedTenant?.name ?? "Nessuna attività";
    const initial = name.charAt(0).toUpperCase();

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handleSelect = (id: string) => {
        selectTenant(id);
        setOpen(false);
        navigate(`/business/${id}/overview`);
    };

    const triggerButton = (
        <button
            className={[styles.trigger, collapsed ? styles.triggerCollapsed : ""].join(" ")}
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-haspopup="listbox"
        >
            {selectedTenant?.logo_url ? (
                <img
                    src={getTenantLogoPublicUrl(selectedTenant.logo_url)}
                    alt=""
                    className={styles.logo}
                />
            ) : (
                <span className={styles.initial}>{initial}</span>
            )}

            {!collapsed && (
                <>
                    <span className={styles.name}>{name}</span>
                    {hasMultiple && (
                        <ChevronDown
                            size={14}
                            className={[styles.chevron, open ? styles.chevronOpen : ""].join(" ")}
                        />
                    )}
                </>
            )}
        </button>
    );

    return (
        <div ref={wrapperRef} className={styles.wrapper}>
            {collapsed ? <Tooltip content={name}>{triggerButton}</Tooltip> : triggerButton}

            {open && (
                <div
                    role="listbox"
                    className={[styles.dropdown, collapsed ? styles.dropdownCollapsed : ""].join(
                        " "
                    )}
                >
                    {tenants.map(t => (
                        <button
                            key={t.id}
                            role="option"
                            aria-selected={t.id === selectedTenant?.id}
                            className={styles.dropdownItem}
                            onClick={() => handleSelect(t.id)}
                        >
                            <span className={styles.checkIcon}>
                                {t.id === selectedTenant?.id ? <Check size={13} /> : null}
                            </span>
                            <span className={styles.dropdownName}>{t.name}</span>
                        </button>
                    ))}

                    <div className={styles.dropdownDivider} />

                    <button
                        className={styles.dropdownItem}
                        onClick={() => {
                            setOpen(false);
                            navigate("/workspace");
                        }}
                    >
                        <span className={styles.checkIcon}>
                            <ArrowLeft size={13} />
                        </span>
                        <span className={styles.dropdownName}>Workspace</span>
                    </button>
                </div>
            )}
        </div>
    );
}
