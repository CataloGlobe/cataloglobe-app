# Product Group — Product Assignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the ProductGroupCreateEditDrawer to allow assigning products to a group, with inline search and multi-select, saving via a sync diff.

**Architecture:** Fix the `productGroups` service (wrong table names + missing per-group functions), add a lightweight product-picker query to `products.ts`, then wire a new "Prodotti inclusi" section inside the existing drawer that loads, filters, and saves product assignments as part of the group save flow.

**Tech Stack:** React 19, TypeScript, Supabase, SCSS Modules. Uses existing `SearchInput`, `CheckboxInput`, `Text` primitives.

---

## Chunk 1: Service Layer

### Task 1: Fix table names and add per-group assignment functions in productGroups.ts

**Files:**
- Modify: `src/services/supabase/productGroups.ts`

**Context:**
The service queries `product_groups` and `product_group_items`. These are the correct live DB table names. The migration files use `v2_` prefixed names in their DDL, but the live database does NOT have those tables — the actual tables are `product_groups` and `product_group_items`. Do NOT rename these.

Also add two new functions:
- `getGroupProducts(groupId, tenantId)` — returns the product IDs currently assigned to a group
- `syncGroupProducts(groupId, tenantId, productIds[])` — diff-based sync: delete removed assignments, insert new ones

- [ ] **Step 1: Fix all table name references**

In `src/services/supabase/productGroups.ts`, change every occurrence:
- `"product_groups"` → `"v2_product_groups"`
- `"product_group_items"` → `"v2_product_group_items"`

Affected locations (by function):
- `getProductGroups` → `.from("product_groups")`
- `createProductGroup` → `.from("product_groups")`
- `updateProductGroup` → `.from("product_groups")`
- `deleteProductGroup` → `.from("product_groups")`
- `getProductGroupAssignments` → `.from("product_group_items")`
- `assignProductToGroup` → `.from("product_group_items")`
- `removeProductFromGroup` → `.from("product_group_items")`

- [ ] **Step 2: Add `getGroupProducts`**

Append this function to `src/services/supabase/productGroups.ts`:

```typescript
/**
 * Returns the product IDs currently assigned to a group.
 */
export async function getGroupProducts(
    groupId: string,
    tenantId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from("v2_product_group_items")
        .select("product_id")
        .eq("group_id", groupId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
    return (data ?? []).map(row => row.product_id);
}
```

- [ ] **Step 3: Add `syncGroupProducts`**

Append this function to `src/services/supabase/productGroups.ts`:

```typescript
/**
 * Syncs the product assignments for a group.
 * Deletes rows no longer selected; inserts newly selected rows.
 * Uses a diff to avoid redundant writes.
 */
export async function syncGroupProducts(
    groupId: string,
    tenantId: string,
    newProductIds: string[]
): Promise<void> {
    const currentIds = await getGroupProducts(groupId, tenantId);

    const currentSet = new Set(currentIds);
    const newSet = new Set(newProductIds);

    const toDelete = currentIds.filter(id => !newSet.has(id));
    const toInsert = newProductIds.filter(id => !currentSet.has(id));

    // Delete removed assignments
    if (toDelete.length > 0) {
        const { error } = await supabase
            .from("v2_product_group_items")
            .delete()
            .eq("group_id", groupId)
            .eq("tenant_id", tenantId)
            .in("product_id", toDelete);
        if (error) throw error;
    }

    // Insert new assignments
    if (toInsert.length > 0) {
        const rows = toInsert.map(productId => ({
            tenant_id: tenantId,
            group_id: groupId,
            product_id: productId
        }));
        const { error } = await supabase
            .from("v2_product_group_items")
            .insert(rows);
        if (error) throw error;
    }
}
```

- [ ] **Step 4: Verify TypeScript compiles without errors**

```bash
cd /Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `productGroups.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/services/supabase/productGroups.ts
git commit -m "fix(service): fix v2_ table names and add getGroupProducts/syncGroupProducts"
```

---

### Task 2: Add lightweight product-picker query to products.ts

**Files:**
- Modify: `src/services/supabase/products.ts`

**Context:**
The drawer needs to fetch all base products for the picker. We add a dedicated lightweight function that selects only `id`, `name`, `image_url` — no variants joined. This is separate from `listBaseProductsWithVariants` which is heavier and joins variants.

**Table name note:** The existing `products.ts` service consistently queries `"products"` (not `"v2_products"`) throughout and the feature works — this is the established pattern in this codebase. The new function follows the same convention. Only `productGroups.ts` (Task 1) uses the wrong names for its tables.

- [ ] **Step 1: Add `listBaseProductsForPicker`**

Append this export to `src/services/supabase/products.ts`:

```typescript
export type ProductPickerItem = {
    id: string;
    name: string;
    image_url: string | null;
};

/**
 * Lightweight fetch for the product-group picker.
 * Returns only base products (no variants) with minimal fields.
 */
export async function listBaseProductsForPicker(
    tenantId: string
): Promise<ProductPickerItem[]> {
    const { data, error } = await supabase
        .from("products")
        .select("id, name, image_url")
        .eq("tenant_id", tenantId)
        .is("parent_product_id", null)
        .order("name", { ascending: true });

    if (error) throw error;
    return data ?? [];
}
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

```bash
cd /Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/supabase/products.ts
git commit -m "feat(service): add listBaseProductsForPicker for group product picker"
```

---

## Chunk 2: Drawer Extension

### Task 3: Add "Prodotti inclusi" section to ProductGroupCreateEditDrawer

**Files:**
- Modify: `src/components/Products/ProductGroupsTab/ProductGroupCreateEditDrawer.tsx`
- Modify: `src/components/Products/ProductGroupsTab/ProductGroupsTab.module.scss`

**Context:**

Current drawer state: name + parent group select. We add below the existing form fields:
1. A divider-like section header "Prodotti inclusi"
2. A `SearchInput` for client-side filtering (no debounce needed — filtering is in-memory after initial load)
3. A scrollable list of products, each row: `CheckboxInput` (description = product name)
4. A "X prodotti selezionati" count badge at the bottom of the section

**Load flow:**
- On `open`: always load all tenant products via `listBaseProductsForPicker`
- On `open` in edit mode AND `groupData` present: also load `getGroupProducts` to preselect

**Save flow:**
- After create: call `syncGroupProducts(newGroup.id, tenantId, selectedProductIds)`
- After update: call `syncGroupProducts(groupData.id, tenantId, selectedProductIds)`

- [ ] **Step 1: Add SCSS for the product picker section**

Add to `src/components/Products/ProductGroupsTab/ProductGroupsTab.module.scss`:

```scss
.formBody {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.formSection {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.formRow {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sectionDivider {
  height: 1px;
  background: var(--border, #e2e8f0);
  margin: 0;
}

.pickerSection {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pickerHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pickerList {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}

.pickerItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  cursor: pointer;
  transition: background 0.1s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--surface-hover, #f8fafc);
  }

  &.pickerItemSelected {
    background: var(--brand-primary-10, rgba(99, 102, 241, 0.06));
  }
}

.pickerItemThumb {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.pickerItemThumbPlaceholder {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--surface-2, #f1f5f9);
  flex-shrink: 0;
}

.pickerItemName {
  flex: 1;
  min-width: 0;
}

.pickerEmptyState {
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pickerLoading {
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 2: Rewrite ProductGroupCreateEditDrawer.tsx**

Replace the full content of `src/components/Products/ProductGroupsTab/ProductGroupCreateEditDrawer.tsx`:

```typescript
import React, { useEffect, useState, useMemo } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createProductGroup,
    updateProductGroup,
    getGroupProducts,
    syncGroupProducts,
    ProductGroup
} from "@/services/supabase/productGroups";
import {
    listBaseProductsForPicker,
    ProductPickerItem
} from "@/services/supabase/products";
import styles from "./ProductGroupsTab.module.scss";

export type GroupFormMode = "create" | "edit";

type ProductGroupCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    mode: GroupFormMode;
    groupData: ProductGroup | null;
    allGroups: ProductGroup[];
    onSuccess: () => void;
    tenantId?: string;
};

export function ProductGroupCreateEditDrawer({
    open,
    onClose,
    mode,
    groupData,
    allGroups,
    onSuccess,
    tenantId
}: ProductGroupCreateEditDrawerProps) {
    const { showToast } = useToast();
    const isEditing = mode === "edit";

    // ── Group form state ─────────────────────────────────────────────────────
    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [parentGroupId, setParentGroupId] = useState<string | null>(null);

    // ── Product picker state ─────────────────────────────────────────────────
    const [allProducts, setAllProducts] = useState<ProductPickerItem[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
    const [productSearch, setProductSearch] = useState("");

    // ── Parent group options ─────────────────────────────────────────────────
    const parentOptions = useMemo(() => {
        const rootGroups = allGroups.filter(g => g.parent_group_id === null);
        if (isEditing && groupData) {
            return rootGroups.filter(g => g.id !== groupData.id);
        }
        return rootGroups;
    }, [allGroups, isEditing, groupData]);

    const selectOptions = [
        { value: "", label: "Nessun gruppo padre (Root)" },
        ...parentOptions.map(g => ({ value: g.id, label: g.name }))
    ];

    // ── Filtered product list ────────────────────────────────────────────────
    const filteredProducts = useMemo(() => {
        if (!productSearch.trim()) return allProducts;
        const q = productSearch.toLowerCase();
        return allProducts.filter(p => p.name.toLowerCase().includes(q));
    }, [allProducts, productSearch]);

    // ── On open: reset + load data ───────────────────────────────────────────
    useEffect(() => {
        if (!open) return;

        setIsSaving(false);
        setProductSearch("");

        if (isEditing && groupData) {
            setName(groupData.name);
            setParentGroupId(groupData.parent_group_id);
        } else {
            setName("");
            setParentGroupId(null);
            setSelectedProductIds(new Set());
        }

        if (!tenantId) return;

        const loadPickerData = async () => {
            setIsLoadingProducts(true);
            try {
                const [products, assignedIds] = await Promise.all([
                    listBaseProductsForPicker(tenantId),
                    isEditing && groupData
                        ? getGroupProducts(groupData.id, tenantId)
                        : Promise.resolve([] as string[])
                ]);
                setAllProducts(products);
                setSelectedProductIds(new Set(assignedIds));
            } catch {
                showToast({ message: "Errore nel caricamento dei prodotti.", type: "error" });
            } finally {
                setIsLoadingProducts(false);
            }
        };

        loadPickerData();
    }, [open, isEditing, groupData, tenantId, showToast]);

    // ── Toggle single product ────────────────────────────────────────────────
    const toggleProduct = (productId: string) => {
        setSelectedProductIds(prev => {
            const next = new Set(prev);
            if (next.has(productId)) {
                next.delete(productId);
            } else {
                next.add(productId);
            }
            return next;
        });
    };

    // ── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!tenantId) {
            showToast({ message: "Errore: tenantId mancante.", type: "error" });
            return;
        }
        if (!name.trim()) {
            showToast({ message: "Il nome del gruppo è obbligatorio.", type: "info" });
            return;
        }

        setIsSaving(true);
        try {
            let savedGroupId: string;

            if (isEditing && groupData) {
                await updateProductGroup(groupData.id, {
                    name: name.trim(),
                    parent_group_id: parentGroupId || null
                });
                savedGroupId = groupData.id;
                showToast({ message: "Gruppo aggiornato con successo.", type: "success" });
            } else {
                const newGroup = await createProductGroup({
                    tenant_id: tenantId,
                    name: name.trim(),
                    parent_group_id: parentGroupId || null
                });
                savedGroupId = newGroup.id;
                showToast({ message: "Gruppo creato con successo.", type: "success" });
            }

            // tenantId is guaranteed non-undefined here due to the early return guard above
            await syncGroupProducts(savedGroupId, tenantId!, Array.from(selectedProductIds));

            onSuccess();
            onClose();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Errore durante il salvataggio.";
            console.error("Errore salvataggio gruppo:", error);
            showToast({ message, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    const header = (
        <div>
            <Text variant="title-sm" weight={600}>
                {isEditing ? "Modifica gruppo" : "Crea nuovo gruppo"}
            </Text>
            <Text variant="body-sm" colorVariant="muted" style={{ marginTop: 4 }}>
                {isEditing
                    ? "Modifica i dettagli del gruppo di prodotti."
                    : "Aggiungi un nuovo gruppo per organizzare i tuoi prodotti."}
            </Text>
        </div>
    );

    const footer = (
        <>
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                Annulla
            </Button>
            <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={isSaving}>
                Salva
            </Button>
        </>
    );

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout header={header} footer={footer}>
                <div className={styles.formBody}>
                    {/* ── Group details ─────────────────────────────────────── */}
                    <div className={styles.formSection}>
                        <div className={styles.formRow}>
                            <TextInput
                                label="Nome gruppo"
                                placeholder="Es: Bevande, Snack..."
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.formRow}>
                            <Select
                                label="Gruppo padre (opzionale)"
                                value={parentGroupId || ""}
                                onChange={e => setParentGroupId(e.target.value || null)}
                                options={selectOptions}
                            />
                            <Text variant="caption" colorVariant="muted" style={{ marginTop: 4 }}>
                                Solo i gruppi principali possono avere sottogruppi. Massima
                                profondità: 1 livello.
                            </Text>
                        </div>
                    </div>

                    {/* ── Divider ───────────────────────────────────────────── */}
                    <div className={styles.sectionDivider} />

                    {/* ── Product picker ────────────────────────────────────── */}
                    <div className={styles.pickerSection}>
                        <div className={styles.pickerHeader}>
                            <Text variant="body" weight={600}>
                                Prodotti inclusi
                            </Text>
                            {selectedProductIds.size > 0 && (
                                <Text variant="caption" colorVariant="muted">
                                    {selectedProductIds.size}{" "}
                                    {selectedProductIds.size === 1 ? "prodotto selezionato" : "prodotti selezionati"}
                                </Text>
                            )}
                        </div>

                        <SearchInput
                            placeholder="Cerca prodotto..."
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            onClear={() => setProductSearch("")}
                            allowClear
                        />

                        <div className={styles.pickerList}>
                            {isLoadingProducts ? (
                                <div className={styles.pickerLoading}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Caricamento prodotti...
                                    </Text>
                                </div>
                            ) : filteredProducts.length === 0 ? (
                                <div className={styles.pickerEmptyState}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {productSearch
                                            ? "Nessun prodotto corrisponde alla ricerca."
                                            : "Nessun prodotto disponibile."}
                                    </Text>
                                </div>
                            ) : (
                                filteredProducts.map(product => {
                                    const isSelected = selectedProductIds.has(product.id);
                                    return (
                                        <div
                                            key={product.id}
                                            className={`${styles.pickerItem} ${isSelected ? styles.pickerItemSelected : ""}`}
                                            onClick={() => toggleProduct(product.id)}
                                        >
                                            {product.image_url ? (
                                                <img
                                                    src={product.image_url}
                                                    alt=""
                                                    className={styles.pickerItemThumb}
                                                />
                                            ) : (
                                                <div className={styles.pickerItemThumbPlaceholder} />
                                            )}

                                            <Text
                                                variant="body-sm"
                                                weight={isSelected ? 600 : 400}
                                                className={styles.pickerItemName}
                                            >
                                                {product.name}
                                            </Text>

                                            {/* Stop-propagation wrapper prevents double-toggle:
                                                the row div's onClick already handles toggling;
                                                if the click reaches the CheckboxInput's label,
                                                its onChange would fire a second toggle. */}
                                            <div onClick={e => e.stopPropagation()}>
                                                <CheckboxInput
                                                    checked={isSelected}
                                                    onChange={() => toggleProduct(product.id)}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
```

- [ ] **Step 3: Verify TypeScript compiles without errors**

```bash
cd /Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Products/ProductGroupsTab/ProductGroupCreateEditDrawer.tsx \
        src/components/Products/ProductGroupsTab/ProductGroupsTab.module.scss
git commit -m "feat(ui): extend ProductGroupDrawer with product assignment picker"
```

---

## Final Verification

- [ ] Run dev server and open the Products page → Gruppi Prodotti tab
- [ ] Create a new group: verify product list loads, selection works, count updates
- [ ] Save: verify `v2_product_group_items` rows created in Supabase
- [ ] Edit existing group: verify pre-selection loads correctly
- [ ] Deselect a product and save: verify row is deleted from `v2_product_group_items`
- [ ] Search filters products correctly
- [ ] Empty search state + no-products state render correctly
