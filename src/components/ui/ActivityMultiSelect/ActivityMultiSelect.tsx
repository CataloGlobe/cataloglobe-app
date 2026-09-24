import { useCallback, useEffect, useMemo, useState } from "react";
import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { Loader } from "@/components/ui/Loader/Loader";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { ACTIVITY_SEARCH_THRESHOLD, filterActivityOptions } from "./activityFilter";
import styles from "./ActivityMultiSelect.module.scss";

interface ActivityMultiSelectProps {
    tenantId: string;
    /** Activity_ids del caller (vuoto se tenant-wide). */
    callerScopedActivityIds: string[];
    /** True se caller è owner o admin (vede tutte le sedi). */
    callerIsTenantWide: boolean;
    value: string[];
    onChange: (activityIds: string[]) => void;
    disabled?: boolean;
    error?: string;
    /**
     * Le sedi già caricate dalla pagina: niente fetch. Assente, il
     * componente le legge da sé con `getActivities` (Team, inviti).
     */
    activities?: ActivityOption[];
    /** Senza asterisco quando le sedi non sono obbligatorie (una regola senza sedi è una bozza). */
    required?: boolean;
}

interface ActivityOption {
    id: string;
    name: string;
}

/**
 * Multi-select con checkbox delle sedi del tenant.
 *
 * - Fetch on-mount via getActivities(tenantId)
 * - Se caller NON è tenant-wide → intersect con callerScopedActivityIds
 *   (replica vincolo backend: manager può assegnare solo le sue sedi)
 * - Toolbar "Seleziona tutte" / "Deseleziona tutte" (sempre su tutte, anche
 *   con una ricerca in corso)
 * - Sopra le 8 sedi, una ricerca sopra la lista (nome, senza accenti)
 * - Counter "X / Y selezionate"
 * - Error visivo se `error` prop set
 */
export function ActivityMultiSelect({
    tenantId,
    callerScopedActivityIds,
    callerIsTenantWide,
    value,
    onChange,
    disabled,
    error,
    activities: givenActivities,
    required = true
}: ActivityMultiSelectProps) {
    const [fetched, setFetched] = useState<V2Activity[]>([]);
    const [loading, setLoading] = useState(!givenActivities);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const activities: ActivityOption[] = givenActivities ?? fetched;

    useEffect(() => {
        if (givenActivities) return;
        let cancelled = false;
        setLoading(true);
        setFetchError(null);
        getActivities(tenantId)
            .then(rows => {
                if (cancelled) return;
                setFetched(rows);
                setLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                console.error("[ActivityMultiSelect] fetch failed:", err);
                setFetchError("Impossibile caricare le sedi.");
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, givenActivities]);

    const options: ActivityOption[] = useMemo(() => {
        const filtered = callerIsTenantWide
            ? activities
            : activities.filter(a => callerScopedActivityIds.includes(a.id));
        return filtered.map(a => ({ id: a.id, name: a.name }));
    }, [activities, callerIsTenantWide, callerScopedActivityIds]);

    const selectedSet = useMemo(() => new Set(value), [value]);
    const searchable = options.length > ACTIVITY_SEARCH_THRESHOLD;
    const visibleOptions = useMemo(
        () => (searchable ? filterActivityOptions(options, query) : options),
        [options, query, searchable]
    );

    const toggleOne = useCallback(
        (id: string) => {
            const next = new Set(selectedSet);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            onChange(Array.from(next));
        },
        [selectedSet, onChange]
    );

    const handleSelectAll = () => onChange(options.map(o => o.id));
    const handleDeselectAll = () => onChange([]);

    const allSelected = options.length > 0 && options.every(o => selectedSet.has(o.id));
    const noneSelected = value.length === 0;

    if (loading) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.label}>Sedi</div>
                <div className={styles.loadingState}>
                    <Loader size="sm" />
                </div>
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.label}>Sedi</div>
                <div className={styles.errorState}>
                    <Text variant="body-sm" colorVariant="muted">
                        {fetchError}
                    </Text>
                </div>
            </div>
        );
    }

    if (options.length === 0) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.label}>Sedi</div>
                <div className={styles.emptyState}>
                    <Text variant="body-sm" colorVariant="muted">
                        {callerIsTenantWide
                            ? "Nessuna sede creata in questa azienda."
                            : "Non gestisci nessuna sede in questa azienda."}
                    </Text>
                </div>
            </div>
        );
    }

    return (
        <div className={`${styles.wrapper} ${error ? styles.hasError : ""}`}>
            <div className={styles.headerRow}>
                <div className={styles.label}>
                    Sedi {required && <span className={styles.required}>*</span>}
                </div>
                <div className={styles.toolbar}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={allSelected ? handleDeselectAll : handleSelectAll}
                        disabled={disabled}
                    >
                        {allSelected ? "Deseleziona tutte" : "Seleziona tutte"}
                    </Button>
                </div>
            </div>

            {searchable && (
                <SearchInput
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    onClear={() => setQuery("")}
                    placeholder="Cerca una sede…"
                    aria-label="Cerca una sede"
                    disabled={disabled}
                />
            )}

            <div className={styles.list} role="group" aria-label="Sedi disponibili">
                {visibleOptions.length === 0 && (
                    <Text variant="body-sm" colorVariant="muted" className={styles.noMatch}>
                        Nessuna sede con «{query.trim()}».
                    </Text>
                )}
                {visibleOptions.map(opt => {
                    const checked = selectedSet.has(opt.id);
                    return (
                        <label
                            key={opt.id}
                            className={`${styles.option} ${checked ? styles.checked : ""}`}
                        >
                            <input
                                type="checkbox"
                                className={styles.checkbox}
                                checked={checked}
                                onChange={() => toggleOne(opt.id)}
                                disabled={disabled}
                            />
                            <span className={styles.optionLabel}>{opt.name}</span>
                        </label>
                    );
                })}
            </div>

            <div className={styles.footerRow}>
                <Text variant="caption" colorVariant="muted">
                    {value.length} / {options.length} selezionate
                </Text>
                {error && noneSelected && (
                    <Text variant="caption" colorVariant="error">
                        {error}
                    </Text>
                )}
            </div>
        </div>
    );
}
