import { useEffect, useMemo, useRef, useState } from "react";
import { Package, X } from "lucide-react";
import { listBaseProductsForPicker, ProductPickerItem } from "@/services/supabase/products";
import styles from "./StoryProductPicker.module.scss";

interface StoryProductPickerProps {
    tenantId: string | null;
    value: string | null;
    onChange: (productId: string | null) => void;
    disabled?: boolean;
}

export function StoryProductPicker({ tenantId, value, onChange, disabled }: StoryProductPickerProps) {
    const [products, setProducts] = useState<ProductPickerItem[]>([]);
    const [query, setQuery] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!tenantId) return;
        listBaseProductsForPicker(tenantId)
            .then(setProducts)
            .catch(err => console.error("[StoryProductPicker] fetch failed:", err));
    }, [tenantId]);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const selected = useMemo(() => products.find(p => p.id === value) ?? null, [products, value]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return products;
        return products.filter(p => p.name.toLowerCase().includes(q));
    }, [products, query]);

    if (selected) {
        return (
            <div className={styles.selectedPill} role="status" aria-label="Prodotto collegato">
                <Package size={15} strokeWidth={2} className={styles.pillIcon} aria-hidden="true" />
                <span className={styles.pillText}>{selected.name}</span>
                {!disabled && (
                    <button
                        type="button"
                        className={styles.pillClearBtn}
                        onClick={() => onChange(null)}
                        aria-label="Rimuovi prodotto collegato"
                    >
                        <X size={14} strokeWidth={2} />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div ref={dropdownRef} className={styles.dropdownAnchor}>
            <div className={styles.inputShell}>
                <Package size={15} strokeWidth={2} className={styles.icon} aria-hidden="true" />
                <input
                    type="text"
                    className={styles.input}
                    placeholder="Cerca un prodotto..."
                    value={query}
                    onChange={e => {
                        setQuery(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    disabled={disabled}
                    aria-label="Cerca un prodotto da collegare"
                    aria-haspopup="listbox"
                    aria-expanded={showDropdown}
                    autoComplete="off"
                />
            </div>

            {showDropdown && (
                <div className={styles.dropdown} role="listbox" aria-label="Risultati ricerca prodotto">
                    {filtered.length === 0 && (
                        <div className={styles.dropdownMessage}>Nessun prodotto trovato</div>
                    )}
                    {filtered.map(product => (
                        <div
                            key={product.id}
                            className={styles.dropdownItem}
                            role="option"
                            aria-selected={false}
                            onClick={() => {
                                onChange(product.id);
                                setQuery("");
                                setShowDropdown(false);
                            }}
                        >
                            <span className={styles.dropdownItemName}>{product.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
