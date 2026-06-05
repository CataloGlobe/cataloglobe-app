import React, { createContext, useContext, useEffect, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import styles from "./Tabs.module.scss";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

export type TabsValue = string | number;
export type TabsVariant = "primary" | "secondary" | "line";

/**
 * Context NON generico
 */
interface TabsContextValue {
    value: TabsValue;
    setValue: (value: TabsValue) => void;
    variant?: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
    const ctx = useContext(TabsContext);
    if (!ctx) {
        throw new Error("Tabs components must be used inside <Tabs>");
    }
    return ctx;
}

/* ------------------------------------------------------------------ */
/* Tabs (root) */
/* ------------------------------------------------------------------ */

interface TabsProps<T extends TabsValue> {
    value: T;
    onChange: (value: T) => void;
    variant?: TabsVariant;
    children: React.ReactNode;
}

export function Tabs<T extends TabsValue>({ value, onChange, variant, children }: TabsProps<T>) {
    /**
     * Wrapper che rende onChange compatibile con TabsValue
     */
    const setValue = React.useCallback(
        (next: TabsValue) => {
            onChange(next as T);
        },
        [onChange]
    );

    const rootClassName = `${styles.root} ${styles[`variant_${variant ?? "default"}`]}`;

    return (
        <TabsContext.Provider value={{ value, setValue, variant }}>
            <div className={rootClassName}>{children}</div>
        </TabsContext.Provider>
    );
}

/* ------------------------------------------------------------------ */
/* Tabs.List */
/* ------------------------------------------------------------------ */

interface TabsListProps {
    children: React.ReactNode;
}

function TabsList({ children }: TabsListProps) {
    return (
        <div className={styles.list} role="tablist">
            {children}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Tabs.Tab */
/* ------------------------------------------------------------------ */

interface TabProps<T extends TabsValue> {
    value: T;
    children: React.ReactNode;
    disabled?: boolean;
    disabledTooltip?: React.ReactNode;
    badge?: React.ReactNode;
}

function Tab<T extends TabsValue>({ value, children, disabled = false, disabledTooltip, badge }: TabProps<T>) {
    const { value: active, setValue } = useTabsContext();
    const isActive = active === value;

    const className = [
        styles.tab,
        isActive ? styles.active : "",
        disabled ? styles.disabled : ""
    ].filter(Boolean).join(" ");

    // Niente attributo `disabled` nativo: Radix Tooltip non rileva hover su
    // trigger nativamente disabilitato. Usiamo solo `aria-disabled` + guard onClick.
    const button = (
        <button
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={disabled || undefined}
            tabIndex={isActive ? 0 : -1}
            className={className}
            onClick={disabled ? undefined : () => setValue(value)}
        >
            {children}
            {badge !== undefined && badge !== null && badge !== false && (
                <span className={styles.tabBadge}>{badge}</span>
            )}
        </button>
    );

    if (disabled && disabledTooltip) {
        return <Tooltip content={disabledTooltip}>{button}</Tooltip>;
    }
    return button;
}

/* ------------------------------------------------------------------ */
/* Tabs.Panel (lazy support) */
/* ------------------------------------------------------------------ */

interface PanelProps<T extends TabsValue> {
    value: T;
    children: React.ReactNode;
    lazy?: boolean;
}

function TabsPanel<T extends TabsValue>({ value, children, lazy = false }: PanelProps<T>) {
    const { value: active } = useTabsContext();
    const [mounted, setMounted] = useState(false);

    const isActive = active === value;

    useEffect(() => {
        if (isActive) setMounted(true);
    }, [isActive]);

    if (lazy && !mounted) return null;
    if (!isActive) return null;

    return (
        <div role="tabpanel" className={styles.panel}>
            {children}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Compound exports */
/* ------------------------------------------------------------------ */

Tabs.List = TabsList;
Tabs.Tab = Tab;
Tabs.Panel = TabsPanel;
