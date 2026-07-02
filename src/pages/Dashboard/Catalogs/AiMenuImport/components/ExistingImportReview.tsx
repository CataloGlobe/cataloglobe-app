import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Select } from "@/components/ui/Select/Select";
import { Switch } from "@/components/ui/Switch/Switch";
import {
    listCatalogs,
    listCategories,
    listCategoryProducts,
    type V2Catalog,
    type V2CatalogCategory,
    type V2CatalogCategoryProduct
} from "@/services/supabase/catalogs";
import { listBaseProductsForPicker, type ProductPickerItem } from "@/services/supabase/products";
import {
    computeProductMatch,
    detectInScanDuplicates,
    findSimilarCategory,
    normalizeName,
    type MatchProduct,
    type ProductMatchResult
} from "@/utils/importMatching";
import type {
    AiProduct,
    ExistingImportPlan
} from "@/hooks/useAiImportSession";
import type {
    ProductImportDecision,
    ExistingManifestCategory,
    AiImportProductInput
} from "../buildImportManifest";
import { ProductMatchBadge, InScanDuplicateBadge } from "./ProductMatchBadge";
import {
    ImportProductList,
    type ImportProductGroup,
    type ImportProductRowConfig
} from "./ImportProductList";
import styles from "./existingImport.module.scss";

const CREATE_NEW = "__new__";
const CATEGORY_SEPARATOR = " — ";
/** Verde per la checkbox dei prodotti "già nel database" (riuso). */
const REUSE_CHECK_COLOR = "#16a34a";

interface ExistingImportReviewProps {
    tenantId: string | null;
    products: AiProduct[];
    categoryNames: Record<string, string>;
    onToggleSelected: (id: string) => void;
    onToggleCategory: (categoryKey: string) => void;
    onToggleAll: () => void;
    onRemoveProduct: (id: string) => void;
    onSetPlan: (plan: ExistingImportPlan | null) => void;
    // Scorciatoia kebab (FASE 2C-5): catalogo pre-selezionato e bloccato → il
    // dropdown "Catalogo di destinazione" è nascosto (il banner è nel ReviewStep).
    lockedCatalogId?: string | null;
    lockedCatalogName?: string | null;
}

/** Override utente per la decisione di un prodotto matchato. */
interface ProductDecisionOverride {
    mode: "create" | "reuse";
    reuseProductId: string | null;
}

interface ProductRow {
    product: AiProduct;
    destCategoryId: string | null;
    match: ProductMatchResult;
    isDuplicate: boolean;
    /** true se la checkbox è bloccata deselezionata (Salta forzato). */
    blocked: boolean;
}

export function ExistingImportReview({
    tenantId,
    products,
    categoryNames,
    onToggleSelected,
    onToggleCategory,
    onToggleAll,
    onRemoveProduct,
    onSetPlan,
    lockedCatalogId
}: ExistingImportReviewProps) {
    const [catalogs, setCatalogs] = useState<V2Catalog[]>([]);
    const [catalogId, setCatalogId] = useState<string>(lockedCatalogId ?? "");
    const [categories, setCategories] = useState<V2CatalogCategory[]>([]);
    const [categoryProducts, setCategoryProducts] = useState<V2CatalogCategoryProduct[]>([]);
    const [baseProducts, setBaseProducts] = useState<ProductPickerItem[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    // Destinazione per categoria AI: CREATE_NEW oppure existingCategoryId.
    const [categoryDest, setCategoryDest] = useState<Record<string, string>>({});
    // Override per prodotto matchato (chiave = AiProduct._id).
    const [overrides, setOverrides] = useState<Record<string, ProductDecisionOverride>>({});

    /* ── Data fetch ───────────────────────────────────────── */

    useEffect(() => {
        if (!tenantId) return;
        let cancelled = false;
        listCatalogs(tenantId)
            .then(cs => {
                if (!cancelled) setCatalogs(cs);
            })
            .catch(() => {
                /* la Select resta vuota; il footer blocca il submit */
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    // Scorciatoia kebab: se arriva/cambia un catalogo bloccato, allinealo.
    useEffect(() => {
        if (lockedCatalogId) setCatalogId(lockedCatalogId);
    }, [lockedCatalogId]);

    // Reset mapping/decisioni quando cambia il catalogo di destinazione.
    useEffect(() => {
        setCategoryDest({});
        setOverrides({});
    }, [catalogId]);

    useEffect(() => {
        if (!tenantId || !catalogId) {
            setCategories([]);
            setCategoryProducts([]);
            return;
        }
        let cancelled = false;
        setLoadingData(true);
        Promise.all([
            listCategories(tenantId, catalogId),
            listCategoryProducts(tenantId, catalogId),
            listBaseProductsForPicker(tenantId)
        ])
            .then(([cats, cps, bps]) => {
                if (cancelled) return;
                setCategories(cats);
                setCategoryProducts(cps);
                setBaseProducts(bps);
            })
            .catch(() => {
                /* dati incompleti → i badge restano su "Crea" (nessun match) */
            })
            .finally(() => {
                if (!cancelled) setLoadingData(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, catalogId]);

    /* ── Derivazioni ──────────────────────────────────────── */

    // Categorie AI distinte, in ordine di prima apparizione.
    const aiCategoryKeys = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const p of products) {
            if (!seen.has(p._category)) {
                seen.add(p._category);
                out.push(p._category);
            }
        }
        return out;
    }, [products]);

    const catById = useMemo(
        () => new Map(categories.map(c => [c.id, c] as const)),
        [categories]
    );

    // Path completo di una categoria esistente ("L1 — L2"), per il match del builder.
    const existingCategoryPath = useMemo(() => {
        return (id: string): string => {
            const parts: string[] = [];
            let cur: V2CatalogCategory | undefined = catById.get(id);
            let guard = 0;
            while (cur && guard++ < 5) {
                parts.unshift(cur.name);
                cur = cur.parent_category_id ? catById.get(cur.parent_category_id) : undefined;
            }
            return parts.join(CATEGORY_SEPARATOR);
        };
    }, [catById]);

    // Default mapping: match leaf name → categoria esistente, altrimenti "crea".
    // Non sovrascrive scelte utente già presenti.
    useEffect(() => {
        setCategoryDest(prev => {
            const next = { ...prev };
            for (const key of aiCategoryKeys) {
                if (next[key] !== undefined) continue;
                const display = categoryNames[key] ?? key;
                const leaf = display.split(CATEGORY_SEPARATOR).pop()?.trim() ?? display;
                const matched = categories.find(c => normalizeName(c.name) === normalizeName(leaf));
                next[key] = matched ? matched.id : CREATE_NEW;
            }
            return next;
        });
    }, [aiCategoryKeys, categories, categoryNames]);

    const baseNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const b of baseProducts) m.set(b.id, b.name);
        return m;
    }, [baseProducts]);

    // Prodotti già presenti in una categoria esistente (id → {id,name}[]).
    const productsByCategory = useMemo(() => {
        const m = new Map<string, MatchProduct[]>();
        for (const cp of categoryProducts) {
            const name = baseNameById.get(cp.product_id);
            if (name === undefined) continue;
            const arr = m.get(cp.category_id) ?? [];
            arr.push({ id: cp.product_id, name });
            m.set(cp.category_id, arr);
        }
        return m;
    }, [categoryProducts, baseNameById]);

    const tenantMatchList = useMemo<MatchProduct[]>(
        () => baseProducts.map(b => ({ id: b.id, name: b.name })),
        [baseProducts]
    );

    const duplicateIds = useMemo(() => {
        const groups = detectInScanDuplicates(products.map(p => ({ id: p._id, name: p.name })));
        const s = new Set<string>();
        for (const g of groups) for (const id of g.ids) s.add(id);
        return s;
    }, [products]);

    // Righe prodotto con match risolto contro la categoria di destinazione.
    const rows = useMemo<ProductRow[]>(() => {
        return products.map(p => {
            const dest = categoryDest[p._category] ?? CREATE_NEW;
            const destCategoryId = dest === CREATE_NEW ? null : dest;
            const existingInCategory = destCategoryId
                ? productsByCategory.get(destCategoryId) ?? []
                : [];
            const match = computeProductMatch(p.name, {
                existingInCategory,
                existingInTenant: tenantMatchList
            });
            return {
                product: p,
                destCategoryId,
                match,
                isDuplicate: duplicateIds.has(p._id),
                blocked: match.status === "in_category"
            };
        });
    }, [products, categoryDest, productsByCategory, tenantMatchList, duplicateIds]);

    /* ── Piano risolto (sollevato al hook) ────────────────── */

    const plan = useMemo<ExistingImportPlan | null>(() => {
        if (!catalogId) return null;
        const catalogName = catalogs.find(c => c.id === catalogId)?.name ?? "";

        const effectiveKey = (aiKey: string): string => {
            const dest = categoryDest[aiKey] ?? CREATE_NEW;
            if (dest === CREATE_NEW) return categoryNames[aiKey] ?? aiKey;
            return existingCategoryPath(dest);
        };

        const existingManifestCategories: ExistingManifestCategory[] = categories.map(c => ({
            id: c.id,
            name: c.name,
            level: c.level,
            parent_category_id: c.parent_category_id
        }));

        const usedKeys = aiCategoryKeys.filter(k => products.some(p => p._category === k));
        const aiCategories = Array.from(new Set(usedKeys.map(effectiveKey)));

        const decisions: ProductImportDecision[] = [];
        const sortCounters = new Map<string, number>();
        let createCount = 0;
        let reuseCount = 0;
        let hasUnresolvedAmbiguous = false;

        for (const row of rows) {
            const p = row.product;
            // Salta: già in categoria (bloccato) o deselezionato.
            if (row.blocked || !p._selected) {
                decisions.push({ kind: "skip" });
                continue;
            }

            const key = effectiveKey(p._category);
            const so = sortCounters.get(key) ?? 0;
            const override = overrides[p._id];

            let mode: "create" | "reuse" = "create";
            let reuseId: string | null = null;

            if (row.match.status === "none") {
                mode = "create";
            } else if (row.match.status === "reusable_single") {
                mode = override?.mode === "create" ? "create" : "reuse";
                if (mode === "reuse") reuseId = override?.reuseProductId ?? row.match.productId;
            } else if (row.match.status === "reusable_ambiguous") {
                if (override?.mode === "create") {
                    mode = "create";
                } else if (override?.mode === "reuse" && override.reuseProductId) {
                    mode = "reuse";
                    reuseId = override.reuseProductId;
                } else {
                    // Ambiguo non risolto → skip + blocca submit.
                    hasUnresolvedAmbiguous = true;
                    decisions.push({ kind: "skip" });
                    continue;
                }
            }

            if (mode === "reuse" && reuseId) {
                decisions.push({
                    kind: "reuse",
                    categoryKey: key,
                    sortOrder: so,
                    productId: reuseId
                });
                reuseCount++;
            } else {
                const payload: AiImportProductInput = {
                    name: p.name,
                    description: p.description,
                    base_price: p.product_type === "simple" ? p.base_price : null,
                    formats:
                        p.product_type === "formats" && Array.isArray(p.formats)
                            ? p.formats.map(f => ({ name: f.name, price: f.price }))
                            : undefined
                };
                decisions.push({
                    kind: "create",
                    categoryKey: key,
                    sortOrder: so,
                    product: payload
                });
                createCount++;
            }
            sortCounters.set(key, so + 1);
        }

        return {
            catalogId,
            catalogName,
            aiCategories,
            existingCategories: existingManifestCategories,
            decisions,
            createCount,
            reuseCount,
            hasUnresolvedAmbiguous
        };
    }, [
        catalogId,
        catalogs,
        categories,
        categoryDest,
        categoryNames,
        aiCategoryKeys,
        products,
        rows,
        overrides,
        existingCategoryPath
    ]);

    useEffect(() => {
        onSetPlan(plan);
    }, [plan, onSetPlan]);

    // Al dismount (switch a "nuovo catalogo") azzera il piano.
    useEffect(() => {
        return () => onSetPlan(null);
    }, [onSetPlan]);

    /* ── Handlers ─────────────────────────────────────────── */

    const setDest = (aiKey: string, dest: string) => {
        setCategoryDest(prev => ({ ...prev, [aiKey]: dest }));
    };

    const setOverride = (id: string, next: ProductDecisionOverride) => {
        setOverrides(prev => ({ ...prev, [id]: next }));
    };

    /* ── Render ───────────────────────────────────────────── */

    const categoryOptions = useMemo(() => {
        // Ordinamento leggibile: per path completo.
        return categories
            .map(c => ({ value: c.id, label: existingCategoryPath(c.id) }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [categories, existingCategoryPath]);

    const rowByProductId = useMemo(() => {
        const m = new Map<string, ProductRow>();
        for (const r of rows) m.set(r.product._id, r);
        return m;
    }, [rows]);

    // Nomi delle categorie esistenti, per il suggerimento "categoria simile".
    const existingCategoryNames = useMemo(() => categories.map(c => c.name), [categories]);

    // Gruppi + selezione per la lista condivisa.
    const [search, setSearch] = useState("");

    const groups = useMemo<ImportProductGroup[]>(() => {
        return aiCategoryKeys
            .map(key => ({
                categoryKey: key,
                categoryLabel: categoryNames[key] ?? key,
                products: products.filter(p => p._category === key)
            }))
            .filter(g => g.products.length > 0);
    }, [aiCategoryKeys, categoryNames, products]);

    const selectedIds = useMemo(
        () => new Set(products.filter(p => p._selected).map(p => p._id)),
        [products]
    );

    // Mappa lo stato di match (da `rows`) su badge/levetta/selettore della riga.
    // SOLO presentazione: la decisione vive in `plan`/`overrides` (immutati).
    const getRowConfig = (product: AiProduct): ImportProductRowConfig => {
        const row = rowByProductId.get(product._id);
        if (!row) return {};

        const dup = row.isDuplicate ? <InScanDuplicateBadge /> : null;
        const badgeFor = (node: ReactNode): ReactNode => (
            <span className={styles.badgeGroup}>
                {node}
                {dup}
            </span>
        );

        const status = row.match.status;

        if (status === "in_category") {
            return {
                disabled: true,
                badge: badgeFor(<ProductMatchBadge status="in_category" />)
            };
        }

        if (status === "reusable_single") {
            const override = overrides[product._id];
            const reuseOn = override?.mode !== "create";
            const reuseId =
                row.match.status === "reusable_single" ? row.match.productId : null;
            return {
                checkColor: REUSE_CHECK_COLOR,
                badge: badgeFor(<ProductMatchBadge status="reusable_single" />),
                below: product._selected ? (
                    <div className={styles.belowRow}>
                        <Switch
                            checked={reuseOn}
                            onChange={checked =>
                                setOverride(
                                    product._id,
                                    checked
                                        ? { mode: "reuse", reuseProductId: reuseId }
                                        : { mode: "create", reuseProductId: null }
                                )
                            }
                            description={reuseOn ? "Riusa esistente" : "Crea nuovo"}
                        />
                    </div>
                ) : null
            };
        }

        if (status === "reusable_ambiguous") {
            const override = overrides[product._id];
            const candidates =
                row.match.status === "reusable_ambiguous" ? row.match.candidates : [];
            const value =
                override?.mode === "create"
                    ? CREATE_NEW
                    : override?.mode === "reuse" && override.reuseProductId
                        ? override.reuseProductId
                        : "";
            return {
                badge: badgeFor(<ProductMatchBadge status="reusable_ambiguous" />),
                below: product._selected ? (
                    <div className={styles.belowRow}>
                        <span className={styles.belowLabel}>Quale riusare?</span>
                        <Select
                            value={value}
                            onChange={e => {
                                const v = e.target.value;
                                if (v === CREATE_NEW) {
                                    setOverride(product._id, {
                                        mode: "create",
                                        reuseProductId: null
                                    });
                                } else if (v === "") {
                                    setOverride(product._id, {
                                        mode: "reuse",
                                        reuseProductId: null
                                    });
                                } else {
                                    setOverride(product._id, { mode: "reuse", reuseProductId: v });
                                }
                            }}
                            error={value === "" ? "Scegli" : undefined}
                            containerClassName={styles.belowSelect}
                        >
                            <option value="">Scegli prodotto…</option>
                            {candidates.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                            <option value={CREATE_NEW}>Crea nuovo</option>
                        </Select>
                    </div>
                ) : null
            };
        }

        // none → eventuale solo badge doppione.
        return dup ? { badge: dup } : {};
    };

    return (
        <div className={styles.container}>
            {/* Catalogo di destinazione + mapping (padding drawer). Con catalogo
                bloccato dalla scorciatoia kebab il dropdown è nascosto (banner nel
                ReviewStep). */}
            <div className={styles.topBlock}>
                {!lockedCatalogId && (
                    <div className={styles.section}>
                        <Select
                            label="Catalogo di destinazione"
                            required
                            value={catalogId}
                            onChange={e => setCatalogId(e.target.value)}
                        >
                            <option value="">Seleziona un catalogo…</option>
                            {catalogs.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                    </div>
                )}

                {catalogId && !loadingData && (
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>Categorie di destinazione</div>
                        <div className={styles.mappingCard}>
                            <div className={styles.mappingHead}>
                                <span className={styles.mappingHeadCol}>Trovata nel menù</span>
                                <span className={styles.mappingHeadCol}>Va in</span>
                            </div>
                            {aiCategoryKeys.map(key => {
                                const dest = categoryDest[key] ?? CREATE_NEW;
                                const display = categoryNames[key] ?? key;
                                const leaf =
                                    display.split(CATEGORY_SEPARATOR).pop()?.trim() ?? display;
                                // Suggerimento soft: solo quando la scelta è "crea" e
                                // c'è una categoria esistente simile (non esatta).
                                const similarName =
                                    dest === CREATE_NEW
                                        ? findSimilarCategory(leaf, existingCategoryNames)
                                        : null;
                                const similarCat = similarName
                                    ? categories.find(
                                          c => normalizeName(c.name) === normalizeName(similarName)
                                      )
                                    : undefined;
                                return (
                                    <div key={key} className={styles.mappingRowWrap}>
                                        <div className={styles.mappingRow}>
                                            <span className={styles.mappingSource}>{display}</span>
                                            <span className={styles.mappingArrow}>→</span>
                                            <Select
                                                value={dest}
                                                onChange={e => setDest(key, e.target.value)}
                                                containerClassName={styles.mappingSelect}
                                            >
                                                <option value={CREATE_NEW}>{`＋ Crea «${leaf}»`}</option>
                                                {categoryOptions.map(opt => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </Select>
                                        </div>
                                        {similarCat && (
                                            <div className={styles.similarHint}>
                                                <Info size={14} className={styles.similarIcon} />
                                                <span className={styles.similarText}>
                                                    Esiste già una categoria simile:{" "}
                                                    <strong>{`«${similarCat.name}»`}</strong>
                                                </span>
                                                <button
                                                    type="button"
                                                    className={styles.similarBtn}
                                                    onClick={() => setDest(key, similarCat.id)}
                                                >
                                                    Usa quella
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {!catalogId ? (
                <div className={styles.topBlock}>
                    <div className={styles.hint}>
                        Scegli il catalogo in cui importare i prodotti analizzati.
                    </div>
                </div>
            ) : loadingData ? (
                <div className={styles.topBlock}>
                    <div className={styles.loading}>Caricamento del catalogo…</div>
                </div>
            ) : (
                <ImportProductList
                    groups={groups}
                    selectedIds={selectedIds}
                    onToggleProduct={onToggleSelected}
                    onToggleCategory={onToggleCategory}
                    onToggleAll={onToggleAll}
                    onRemoveProduct={onRemoveProduct}
                    foundCount={products.length}
                    selectedCount={selectedIds.size}
                    searchQuery={search}
                    onSearchChange={setSearch}
                    getRowConfig={getRowConfig}
                />
            )}
        </div>
    );
}
