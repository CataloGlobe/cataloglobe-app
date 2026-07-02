import { type ReactNode, type CSSProperties, useMemo } from "react";
import { Search, X, Check, Minus, AlertTriangle, Trash2 } from "lucide-react";
import type { AiProduct } from "@/hooks/useAiImportSession";
import styles from "./importProductList.module.scss";

/** Slot opzionali iniettati dal ramo "catalogo esistente" (badge/levetta/selettore). */
export interface ImportProductRowConfig {
    /** Riga bloccata (es. "in_category"): checkbox disabilitata e deselezionata. */
    disabled?: boolean;
    /** Colore checkbox quando selezionata (es. verde per "già nel database"). */
    checkColor?: string;
    /** Badge inline dopo il nome. */
    badge?: ReactNode;
    /** Contenuto seconda riga, sotto la descrizione (levetta/selettore). */
    below?: ReactNode;
}

export interface ImportProductGroup {
    /** Chiave stabile della categoria (per toggle/rename). */
    categoryKey: string;
    /** Etichetta visibile (editabile nel ramo "nuovo"). */
    categoryLabel: string;
    products: AiProduct[];
}

export interface ImportProductListProps {
    groups: ImportProductGroup[];
    selectedIds: Set<string>;
    onToggleProduct: (id: string) => void;
    onToggleCategory: (categoryKey: string) => void;
    onToggleAll: () => void;
    /** Cestino (ramo "nuovo"). Assente → nessun cestino. */
    onRemoveProduct?: (id: string) => void;
    /** Rinomina categoria inline (ramo "nuovo"). Assente → etichetta statica. */
    onRenameCategory?: (categoryKey: string, name: string) => void;
    /** Rinomina prodotto inline (ramo "nuovo"). Assente → nome statico. */
    onRenameProduct?: (id: string, name: string) => void;
    foundCount: number;
    selectedCount: number;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    /** Config per-riga (ramo "esistente"). Assente → righe pulite. */
    getRowConfig?: (product: AiProduct) => ImportProductRowConfig;
}

/**
 * Lista prodotti condivisa dello step 3 import AI (stile canonico del ramo
 * "nuovo catalogo"). Solo presentazione: nessuna logica di dominio. Il ramo
 * "esistente" inietta badge/levetta/selettore via `getRowConfig` senza alterare
 * lo stile base.
 */
export function ImportProductList({
    groups,
    selectedIds,
    onToggleProduct,
    onToggleCategory,
    onToggleAll,
    onRemoveProduct,
    onRenameCategory,
    onRenameProduct,
    foundCount,
    selectedCount,
    searchQuery,
    onSearchChange,
    getRowConfig
}: ImportProductListProps) {
    const allSelected = selectedCount === foundCount && foundCount > 0;

    // Filtro ricerca applicato solo alla vista; i contatori stats restano sul
    // totale (passato dal parent).
    const visibleGroups = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return groups;
        return groups
            .map(g => ({
                ...g,
                products: g.products.filter(p => p.name.toLowerCase().includes(q))
            }))
            .filter(g => g.products.length > 0);
    }, [groups, searchQuery]);

    const hasResults = visibleGroups.length > 0;

    return (
        <div className={styles.list}>
            {/* Stats bar */}
            <div className={styles.statsBar}>
                <div className={styles.statItem}>
                    <span className={styles.statNumber}>{foundCount}</span>
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
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder="Cerca prodotto..."
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className={styles.searchClear}
                            onClick={() => onSearchChange("")}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Product list grouped by category */}
            {hasResults ? (
                <div className={styles.categoryList}>
                    {visibleGroups.map(group => {
                        const selInGroup = group.products.filter(p =>
                            selectedIds.has(p._id)
                        ).length;
                        const allInGroup =
                            selInGroup === group.products.length && group.products.length > 0;
                        const someInGroup = selInGroup > 0 && !allInGroup;

                        return (
                            <div key={group.categoryKey} className={styles.categoryGroup}>
                                <div className={styles.categoryHeader}>
                                    <ListCheckbox
                                        checked={allInGroup}
                                        indeterminate={someInGroup}
                                        onChange={() => onToggleCategory(group.categoryKey)}
                                    />
                                    {onRenameCategory ? (
                                        <input
                                            type="text"
                                            className={styles.categoryNameInput}
                                            value={group.categoryLabel}
                                            onChange={e =>
                                                onRenameCategory(group.categoryKey, e.target.value)
                                            }
                                        />
                                    ) : (
                                        <span className={styles.categoryNameStatic}>
                                            {group.categoryLabel}
                                        </span>
                                    )}
                                    <span className={styles.categoryBadge}>
                                        {selInGroup}/{group.products.length}
                                    </span>
                                </div>
                                <div className={styles.categoryProducts}>
                                    {group.products.map(product => (
                                        <ImportProductRow
                                            key={product._id}
                                            product={product}
                                            selected={selectedIds.has(product._id)}
                                            config={getRowConfig?.(product)}
                                            onToggle={() => onToggleProduct(product._id)}
                                            onRemove={
                                                onRemoveProduct
                                                    ? () => onRemoveProduct(product._id)
                                                    : undefined
                                            }
                                            onRename={
                                                onRenameProduct
                                                    ? (name: string) =>
                                                          onRenameProduct(product._id, name)
                                                    : undefined
                                            }
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
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

/* ── Riga prodotto ────────────────────────────────────────── */

interface ImportProductRowProps {
    product: AiProduct;
    selected: boolean;
    config?: ImportProductRowConfig;
    onToggle: () => void;
    onRemove?: () => void;
    onRename?: (name: string) => void;
}

function ImportProductRow({
    product,
    selected,
    config,
    onToggle,
    onRemove,
    onRename
}: ImportProductRowProps) {
    if (!product || typeof product.name !== "string") return null;

    const disabled = config?.disabled ?? false;
    const isLow = product.confidence === "low";
    const effectivelySelected = selected && !disabled;

    const rowClass = [
        styles.productRow,
        !effectivelySelected ? styles.productRowDeselected : "",
        isLow && effectivelySelected ? styles.productRowLowConf : ""
    ]
        .filter(Boolean)
        .join(" ");

    const priceDisplay =
        product.product_type === "simple" && product.base_price != null
            ? `€ ${product.base_price.toFixed(2)}`
            : null;

    return (
        <div className={rowClass}>
            <ListCheckbox
                checked={effectivelySelected}
                disabled={disabled}
                color={config?.checkColor}
                onChange={onToggle}
                className={styles.productCheckbox}
            />

            <div className={styles.productContent}>
                <div className={styles.productMainRow}>
                    <div className={styles.nameWrap}>
                        {onRename ? (
                            <input
                                type="text"
                                className={styles.productName}
                                value={product.name}
                                onChange={e => onRename(e.target.value)}
                            />
                        ) : (
                            <span className={styles.productNameStatic}>{product.name}</span>
                        )}
                        {config?.badge}
                    </div>
                    {priceDisplay && <span className={styles.productPrice}>{priceDisplay}</span>}
                    {isLow && (
                        <span className={styles.lowConfBadge}>
                            <AlertTriangle size={10} />
                            Verifica
                        </span>
                    )}
                </div>

                {product.description ? (
                    <div className={styles.productDescription}>{product.description}</div>
                ) : (
                    <div
                        className={`${styles.productDescription} ${styles.productDescriptionPlaceholder}`}
                    >
                        Nessuna descrizione
                    </div>
                )}

                {product.product_type === "formats" &&
                    Array.isArray(product.formats) &&
                    product.formats.length > 0 && (
                        <div className={styles.productFormats}>
                            {product.formats.map((f, i) => {
                                if (!f || typeof f.name !== "string") return null;
                                const priceStr = f.price != null ? f.price.toFixed(2) : null;
                                return (
                                    <span key={i} className={styles.formatTag}>
                                        {f.name}
                                        {priceStr ? ` €${priceStr}` : ""}
                                    </span>
                                );
                            })}
                        </div>
                    )}

                {config?.below && <div className={styles.productBelow}>{config.below}</div>}
            </div>

            {onRemove && (
                <button type="button" className={styles.productTrash} onClick={onRemove}>
                    <Trash2 size={15} />
                </button>
            )}
        </div>
    );
}

/* ── Checkbox (con colore/disabled) ───────────────────────── */

interface ListCheckboxProps {
    checked: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    color?: string;
    onChange: () => void;
    className?: string;
}

function ListCheckbox({
    checked,
    indeterminate,
    disabled,
    color,
    onChange,
    className
}: ListCheckboxProps) {
    const cls = [
        styles.checkbox,
        checked ? styles.checkboxChecked : "",
        indeterminate && !checked ? styles.checkboxIndeterminate : "",
        disabled ? styles.checkboxDisabled : "",
        className
    ]
        .filter(Boolean)
        .join(" ");

    // CSS var per colore custom (stesso pattern di Badge --badge-bg): non è CSS
    // di layout inline, solo passaggio di un token.
    const style =
        color && (checked || indeterminate)
            ? ({ "--check-color": color } as CSSProperties)
            : undefined;

    return (
        <button
            type="button"
            className={cls}
            style={style}
            disabled={disabled}
            onClick={disabled ? undefined : onChange}
            role="checkbox"
            aria-checked={indeterminate ? "mixed" : checked}
        >
            {checked && <Check size={12} strokeWidth={3} />}
            {indeterminate && !checked && <Minus size={12} strokeWidth={3} />}
        </button>
    );
}
