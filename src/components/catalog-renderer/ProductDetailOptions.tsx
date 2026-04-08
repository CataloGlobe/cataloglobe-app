import React from "react";
import type { ResolvedOptionGroup } from "@/types/resolvedCollections";

// ─── Types ──────────────────────────────────────────────────────────────────

type Props = {
    optionGroups: ResolvedOptionGroup[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDelta(modifier: number | null): string | null {
    if (modifier === null || modifier === 0) return null;
    return modifier > 0 ? `+${modifier.toFixed(2)} €` : `${modifier.toFixed(2)} €`;
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Read-only display of product option groups.
 * Purely informative — no selection, no price calculation, no cart.
 */
export default function ProductDetailOptions({ optionGroups }: Props) {
    if (optionGroups.length === 0) return null;

    const primaryGroups = optionGroups.filter(g => g.group_kind === "PRIMARY_PRICE");
    const addonGroups = optionGroups.filter(g => g.group_kind === "ADDON");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* ── PRIMARY_PRICE groups ───────────────────────────────────── */}
            {primaryGroups.map(group => (
                <div key={group.id}>
                    <p
                        style={{
                            margin: "0 0 10px",
                            fontSize: 14,
                            fontWeight: 700,
                            color: "var(--color-gray-900, #111)"
                        }}
                    >
                        {group.name}
                    </p>

                    <ul
                        style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6
                        }}
                    >
                        {group.values.map(val => (
                            <li
                                key={val.id}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "9px 12px",
                                    borderRadius: 8,
                                    border: "1px solid var(--color-gray-200, #e5e7eb)",
                                    backgroundColor: "var(--color-gray-50, #f9fafb)"
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 14,
                                        color: "var(--color-gray-800, #1f2937)"
                                    }}
                                >
                                    {val.name}
                                </span>
                                {val.absolute_price !== null && (
                                    <span
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: "var(--color-gray-900, #111)"
                                        }}
                                    >
                                        {val.absolute_price.toFixed(2)} €
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}

            {/* ── ADDON groups ───────────────────────────────────────────── */}
            {addonGroups.map(group => (
                <div key={group.id}>
                    <p
                        style={{
                            margin: "0 0 10px",
                            fontSize: 14,
                            fontWeight: 700,
                            color: "var(--color-gray-900, #111)"
                        }}
                    >
                        {group.name}
                        {group.is_required && (
                            <span
                                style={{
                                    marginLeft: 8,
                                    backgroundColor: "var(--color-warning-100, #fef3c7)",
                                    color: "var(--color-warning-700, #b45309)",
                                    padding: "1px 6px",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600
                                }}
                            >
                                Obbligatorio
                            </span>
                        )}
                    </p>

                    <ul
                        style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6
                        }}
                    >
                        {group.values.map(val => {
                            const delta = formatDelta(val.price_modifier);
                            return (
                                <li
                                    key={val.id}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "9px 12px",
                                        borderRadius: 8,
                                        border: "1px solid var(--color-gray-200, #e5e7eb)",
                                        backgroundColor: "var(--color-gray-50, #f9fafb)"
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 14,
                                            color: "var(--color-gray-800, #1f2937)"
                                        }}
                                    >
                                        {val.name}
                                    </span>
                                    {delta && (
                                        <span
                                            style={{
                                                fontSize: 13,
                                                color: "var(--color-gray-500, #6b7280)"
                                            }}
                                        >
                                            {delta}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </div>
    );
}
