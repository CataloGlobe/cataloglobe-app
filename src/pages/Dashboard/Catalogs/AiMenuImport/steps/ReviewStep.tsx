import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import type { AiProduct } from "../AiMenuImportWizard";
import { CategoryGroup } from "../components/CategoryGroup";
import styles from "../aiMenuImport.module.scss";

interface ReviewStepProps {
    menuName: string;
    onMenuNameChange: (name: string) => void;
    products: AiProduct[];
    categoryNames: Record<string, string>;
    onCategoryNameChange: (key: string, name: string) => void;
    onUpdateProduct: (id: string, updates: Partial<AiProduct>) => void;
    onRemoveProduct: (id: string) => void;
    onToggleCategory: (categoryKey: string) => void;
    onToggleAll: () => void;
}

export function ReviewStep({
    menuName,
    onMenuNameChange,
    products,
    categoryNames,
    onCategoryNameChange,
    onUpdateProduct,
    onRemoveProduct,
    onToggleCategory,
    onToggleAll
}: ReviewStepProps) {
    const [search, setSearch] = useState("");

    const totalCount = products.length;
    const selectedCount = products.filter(p => p._selected).length;
    const allSelected = selectedCount === totalCount && totalCount > 0;

    // Group products by category, applying search filter
    const groupedCategories = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();

        let filtered = products;
        if (normalizedSearch) {
            filtered = filtered.filter(p => p.name.toLowerCase().includes(normalizedSearch));
        }

        const groups = new Map<string, AiProduct[]>();
        for (const p of filtered) {
            const key = p._category;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(p);
        }

        return groups;
    }, [products, search]);

    const hasResults = groupedCategories.size > 0;

    return (
        <div className={styles.reviewContainer}>
            {/* Menu name */}
            <div className={styles.menuNameSection}>
                <TextInput
                    label="Nome del menù"
                    required
                    value={menuName}
                    onChange={e => onMenuNameChange(e.target.value)}
                    placeholder="Es: Menu Pranzo, Menu Cena..."
                />
            </div>

            {/* Stats bar */}
            <div className={styles.statsBar}>
                <div className={styles.statItem}>
                    <span className={styles.statNumber}>{totalCount}</span>
                    <span className={styles.statLabel}>Trovati</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                    <span className={`${styles.statNumber} ${styles.statNumberAccent}`}>
                        {selectedCount}
                    </span>
                    <span className={styles.statLabel}>Selezionati</span>
                </div>
                <button type="button" className={styles.selectAllBtn} onClick={onToggleAll}>
                    {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
                </button>
            </div>

            {/* Search */}
            <div className={styles.searchBar}>
                <div className={styles.searchInputWrap}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Cerca prodotto..."
                    />
                    {search && (
                        <button
                            type="button"
                            className={styles.searchClear}
                            onClick={() => setSearch("")}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Product list grouped by category */}
            {hasResults ? (
                <div className={styles.categoryList}>
                    {Array.from(groupedCategories.entries()).map(([catKey, catProducts]) => (
                        <CategoryGroup
                            key={catKey}
                            categoryKey={catKey}
                            displayName={categoryNames[catKey] ?? catKey}
                            products={catProducts}
                            onCategoryNameChange={onCategoryNameChange}
                            onToggleCategory={onToggleCategory}
                            onUpdateProduct={onUpdateProduct}
                            onRemoveProduct={onRemoveProduct}
                        />
                    ))}
                </div>
            ) : (
                <div className={styles.emptySearch}>
                    <Search size={32} />
                    <div className={styles.emptySearchText}>Nessun prodotto trovato</div>
                    <div className={styles.emptySearchHint}>Prova con un termine diverso</div>
                </div>
            )}
        </div>
    );
}
