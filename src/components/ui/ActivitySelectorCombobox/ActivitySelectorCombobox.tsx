import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

import Text from "@/components/ui/Text/Text";
import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";

import styles from "./ActivitySelectorCombobox.module.scss";

export interface ActivitySelectorComboboxProps {
    tenantId: string;
    value: string | null;
    onChange: (activityId: string) => void;
    /** localStorage key per persist selezione (es. "cataloglobe:orders:lastActivityId"). */
    storageKey?: string;
    className?: string;
}

type ActivityStatus = "active-ordering" | "active-no-ordering" | "inactive";

function getActivityStatus(a: V2Activity): ActivityStatus {
    if (a.status !== "active") return "inactive";
    return a.ordering_enabled ? "active-ordering" : "active-no-ordering";
}

const STATUS_DOT_CLASS: Record<ActivityStatus, string> = {
    "active-ordering": styles.dotGreen,
    "active-no-ordering": styles.dotAmber,
    inactive: styles.dotGray
};

export function ActivitySelectorCombobox({
    tenantId,
    value,
    onChange,
    storageKey,
    className
}: ActivitySelectorComboboxProps) {
    const [activities, setActivities] = useState<V2Activity[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);

    const loadActivities = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await getActivities(tenantId);
            const sorted = [...data].sort((a, b) =>
                a.name.localeCompare(b.name, "it")
            );
            setActivities(sorted);

            // Default selection: localStorage > prima sede alfabetica
            if (!value && sorted.length > 0) {
                const stored = storageKey ? localStorage.getItem(storageKey) : null;
                const valid =
                    stored && sorted.some(a => a.id === stored) ? stored : sorted[0].id;
                onChange(valid);
            }
        } catch {
            /* silent: parent gestisce errori globali via toast */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, storageKey]);

    useEffect(() => {
        void loadActivities();
    }, [loadActivities]);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current?.contains(target) ||
                dropdownRef.current?.contains(target)
            ) {
                return;
            }
            setIsOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isOpen]);

    // Focus search input on open
    useEffect(() => {
        if (isOpen) {
            setSearchQuery("");
            requestAnimationFrame(() => searchRef.current?.focus());
        }
    }, [isOpen]);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return activities;
        return activities.filter(
            a =>
                a.name.toLowerCase().includes(q) ||
                (a.city?.toLowerCase().includes(q) ?? false)
        );
    }, [activities, searchQuery]);

    const selected = useMemo(
        () => activities.find(a => a.id === value) ?? null,
        [activities, value]
    );

    const handleSelect = (a: V2Activity) => {
        onChange(a.id);
        if (storageKey) {
            try {
                localStorage.setItem(storageKey, a.id);
            } catch {
                /* localStorage failure: non bloccante */
            }
        }
        setIsOpen(false);
    };

    return (
        <div className={`${styles.wrapper} ${className ?? ""}`}>
            <button
                ref={triggerRef}
                type="button"
                className={styles.trigger}
                onClick={() => setIsOpen(o => !o)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                {selected ? (
                    <>
                        <span
                            className={`${styles.dot} ${STATUS_DOT_CLASS[getActivityStatus(selected)]}`}
                            aria-hidden
                        />
                        <span className={styles.triggerLabel}>{selected.name}</span>
                    </>
                ) : (
                    <span className={styles.triggerPlaceholder}>Seleziona sede</span>
                )}
                <ChevronDown size={14} className={styles.chevron} aria-hidden />
            </button>

            {isOpen && (
                <div
                    ref={dropdownRef}
                    className={styles.dropdown}
                    role="listbox"
                >
                    <div className={styles.searchWrap}>
                        <Search size={14} className={styles.searchIcon} aria-hidden />
                        <input
                            ref={searchRef}
                            type="search"
                            className={styles.searchInput}
                            placeholder="Cerca sede o citta..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <ul className={styles.list}>
                        {filtered.length === 0 ? (
                            <li className={styles.emptyRow}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessuna sede trovata
                                </Text>
                            </li>
                        ) : (
                            filtered.map(a => {
                                const status = getActivityStatus(a);
                                const isSelected = a.id === value;
                                return (
                                    <li key={a.id}>
                                        <button
                                            type="button"
                                            role="option"
                                            aria-selected={isSelected}
                                            className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                                            onClick={() => handleSelect(a)}
                                        >
                                            <span
                                                className={`${styles.dot} ${STATUS_DOT_CLASS[status]}`}
                                                aria-hidden
                                            />
                                            <span className={styles.optionMain}>
                                                <span className={styles.optionName}>{a.name}</span>
                                                {a.city && (
                                                    <span className={styles.optionCaption}>
                                                        {a.city}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })
                        )}
                    </ul>

                    <div className={styles.footer}>
                        <Text variant="body-sm" colorVariant="muted">
                            {activities.length} {activities.length === 1 ? "sede" : "sedi"} · digita per filtrare
                        </Text>
                    </div>
                </div>
            )}
        </div>
    );
}
