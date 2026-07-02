import { useMemo, useState } from "react";
import { FolderPlus, FolderInput, Info } from "lucide-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import type { AiProduct, ImportMode, ExistingImportPlan } from "@/hooks/useAiImportSession";
import { ExistingImportReview } from "../components/ExistingImportReview";
import {
    ImportProductList,
    type ImportProductGroup
} from "../components/ImportProductList";
import styles from "../aiMenuImport.module.scss";
import existingStyles from "../components/existingImport.module.scss";

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
    // Ramo "catalogo esistente" (FASE 2C-1)
    tenantId: string | null;
    importMode: ImportMode;
    onImportModeChange: (mode: ImportMode) => void;
    onSetExistingPlan: (plan: ExistingImportPlan | null) => void;
    // Scorciatoia kebab (FASE 2C-5): destinazione bloccata su un catalogo.
    initialCatalogId: string | null;
    initialCatalogName: string | null;
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
    onToggleAll,
    tenantId,
    importMode,
    onImportModeChange,
    onSetExistingPlan,
    initialCatalogId,
    initialCatalogName
}: ReviewStepProps) {
    const [search, setSearch] = useState("");

    // Prodotti raggruppati per categoria AI (ordine di prima apparizione).
    const groups = useMemo<ImportProductGroup[]>(() => {
        const order: string[] = [];
        const map = new Map<string, AiProduct[]>();
        for (const p of products) {
            if (!map.has(p._category)) {
                map.set(p._category, []);
                order.push(p._category);
            }
            map.get(p._category)!.push(p);
        }
        return order.map(key => ({
            categoryKey: key,
            categoryLabel: categoryNames[key] ?? key,
            products: map.get(key)!
        }));
    }, [products, categoryNames]);

    const selectedIds = useMemo(
        () => new Set(products.filter(p => p._selected).map(p => p._id)),
        [products]
    );

    const toggleSelected = (id: string) => {
        const p = products.find(x => x._id === id);
        if (p) onUpdateProduct(id, { _selected: !p._selected });
    };

    return (
        <div className={styles.reviewContainer}>
            {/* Destinazione: banner di contesto bloccato (scorciatoia kebab) vs
                selettore Nuovo/Esistente (apertura standard). */}
            {initialCatalogId ? (
                <div className={existingStyles.contextBanner}>
                    <Info size={18} className={existingStyles.contextBannerIcon} />
                    <div className={existingStyles.contextBannerText}>
                        <div className={existingStyles.contextBannerTitle}>
                            {`I prodotti verranno aggiunti a «${initialCatalogName ?? ""}»`}
                        </div>
                        <div className={existingStyles.contextBannerSub}>
                            Categorie e prodotti già presenti verranno riconosciuti
                            automaticamente.
                        </div>
                    </div>
                </div>
            ) : (
                <div className={existingStyles.modeSwitch}>
                    <SegmentedControl<ImportMode>
                        value={importMode}
                        onChange={onImportModeChange}
                        options={[
                            {
                                value: "new",
                                label: "Nuovo catalogo",
                                icon: <FolderPlus size={16} />
                            },
                            {
                                value: "existing",
                                label: "Catalogo esistente",
                                icon: <FolderInput size={16} />
                            }
                        ]}
                    />
                </div>
            )}

            {importMode === "existing" ? (
                <ExistingImportReview
                    tenantId={tenantId}
                    products={products}
                    categoryNames={categoryNames}
                    onToggleSelected={toggleSelected}
                    onToggleCategory={onToggleCategory}
                    onToggleAll={onToggleAll}
                    onRemoveProduct={onRemoveProduct}
                    onSetPlan={onSetExistingPlan}
                    lockedCatalogId={initialCatalogId}
                    lockedCatalogName={initialCatalogName}
                />
            ) : (
                <>
                    <div className={styles.menuNameSection}>
                        <TextInput
                            label="Nome del menù"
                            required
                            value={menuName}
                            onChange={e => onMenuNameChange(e.target.value)}
                            placeholder="Es: Menu Pranzo, Menu Cena..."
                        />
                    </div>

                    <ImportProductList
                        groups={groups}
                        selectedIds={selectedIds}
                        onToggleProduct={toggleSelected}
                        onToggleCategory={onToggleCategory}
                        onToggleAll={onToggleAll}
                        onRemoveProduct={onRemoveProduct}
                        onRenameCategory={onCategoryNameChange}
                        onRenameProduct={(id, name) => onUpdateProduct(id, { name })}
                        foundCount={products.length}
                        selectedCount={selectedIds.size}
                        searchQuery={search}
                        onSearchChange={setSearch}
                    />
                </>
            )}
        </div>
    );
}
