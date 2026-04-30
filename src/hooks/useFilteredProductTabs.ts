import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import type { VerticalConfig } from "@/constants/verticalTypes";

/**
 * One tab definition, possibly gated on a vertical config flag.
 *
 * `gated` returns whether the tab should appear for the current vertical.
 * When omitted, the tab is always visible (universal).
 */
export type ProductTabDef<TValue extends string> = {
    value: TValue;
    label: string;
    gated?: (config: VerticalConfig) => boolean;
};

/**
 * Filters a list of tab definitions against the current vertical config and
 * synchronizes the URL `?tab=...` query when it points to a hidden tab.
 *
 * - Hides tabs whose `gated` predicate returns false.
 * - `legacyMap` lets a deprecated tab name map to a canonical visible one;
 *   the URL is rewritten to the canonical value (no history entry).
 * - If the URL `?tab` resolves to a hidden/unknown tab (and no legacy map
 *   match), the param is stripped and the initial active value falls back
 *   to `fallbackTab`.
 *
 * Returns the visible tab list and the validated initial active value.
 * Components own the `activeTab` state for in-page switches; this helper
 * only governs the initial mount + URL deep-link resolution.
 *
 * Used by both ProductPage (detail) and Products (list) so deep-linked URLs
 * (`?tab=attributes`) resolve sanely after `customAttributes` flips to false
 * in food_beverage.
 */
export function useFilteredProductTabs<TValue extends string>(
    allTabs: ProductTabDef<TValue>[],
    fallbackTab: TValue,
    legacyMap?: Partial<Record<string, TValue>>
): { visibleTabs: ProductTabDef<TValue>[]; initialTab: TValue } {
    const verticalConfig = useVerticalConfig();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    const visibleTabs = useMemo(
        () => allTabs.filter(tab => (tab.gated ? tab.gated(verticalConfig) : true)),
        [allTabs, verticalConfig]
    );

    const queryTab = searchParams.get("tab");
    const visibleValues = visibleTabs.map(t => t.value);
    const directMatch = queryTab !== null && visibleValues.includes(queryTab as TValue);
    const legacyTarget = !directMatch && queryTab && legacyMap ? legacyMap[queryTab] : undefined;
    const legacyMatch =
        legacyTarget !== undefined && visibleValues.includes(legacyTarget);

    const initialTab: TValue = directMatch
        ? (queryTab as TValue)
        : legacyMatch
        ? (legacyTarget as TValue)
        : fallbackTab;

    useEffect(() => {
        if (queryTab === null) return;
        if (directMatch) return;
        const params = new URLSearchParams(searchParams);
        if (legacyMatch && legacyTarget) {
            params.set("tab", legacyTarget);
        } else {
            params.delete("tab");
        }
        const search = params.toString();
        navigate(`${location.pathname}${search ? `?${search}` : ""}`, { replace: true });
        // searchParams is intentionally excluded: navigate replaces the
        // location synchronously, useSearchParams emits a fresh ref, and
        // including it here would cause a redirect loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryTab, directMatch, legacyMatch, legacyTarget, navigate, location.pathname]);

    return { visibleTabs, initialTab };
}
