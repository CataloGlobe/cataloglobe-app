import { useEffect, useMemo, useRef, useState } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
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
    // true quando l'utente ha premuto "Cambia": mostra la ricerca pur avendo
    // già un prodotto collegato (che resta finché non se ne sceglie un altro).
    const [isChanging, setIsChanging] = useState(false);
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
                setIsChanging(false);
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

    if (selected && !isChanging) {
        return (
            <div className={styles.selectedRow} role="status" aria-label="Prodotto collegato">
                {selected.image_url ? (
                    <img src={selected.image_url} alt="" className={styles.thumb} />
                ) : (
                    <div className={styles.thumbPlaceholder}>
                        <Package size={16} strokeWidth={2} aria-hidden="true" />
                    </div>
                )}
                <div className={styles.meta}>
                    <span className={styles.name}>{selected.name}</span>
                    {selected.base_price != null && (
                        <span className={styles.price}>{selected.base_price.toFixed(2)} €</span>
                    )}
                </div>
                {!disabled && (
                    <div className={styles.rowActions}>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsChanging(true)}
                        >
                            Cambia
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onChange(null)}
                        >
                            Rimuovi
                        </Button>
                    </div>
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
                                setIsChanging(false);
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
