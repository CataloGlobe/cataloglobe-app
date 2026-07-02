import { describe, it, expect } from "vitest";
import { buildImportManifest } from "@/pages/Dashboard/Catalogs/AiMenuImport/buildImportManifest";
import { computeFieldHash } from "@/services/translation/hashUtils";

describe("buildImportManifest — categories", () => {
    it("matches an AI category to an existing one via existing_id (no name_hash)", async () => {
        const manifest = await buildImportManifest({
            aiCategories: ["Antipasti"],
            existingCategories: [
                { id: "cat-existing", name: "antipasti", level: 1, parent_category_id: null }
            ],
            decisions: []
        });
        expect(manifest.categories).toHaveLength(1);
        const cat = manifest.categories[0];
        expect(cat.existing_id).toBe("cat-existing");
        expect(cat.name_hash).toBeNull();
        expect(cat.level).toBe(1);
        expect(cat.parent_ref).toBeNull();
    });

    it("creates a new category with ref + computed name_hash when no match", async () => {
        const manifest = await buildImportManifest({
            aiCategories: ["Dolci"],
            existingCategories: [],
            decisions: []
        });
        expect(manifest.categories).toHaveLength(1);
        const cat = manifest.categories[0];
        expect(cat.existing_id).toBeNull();
        expect(cat.ref).toBeTruthy();
        expect(cat.name).toBe("Dolci");
        expect(cat.name_hash).toBe(await computeFieldHash("Dolci"));
        expect(cat.level).toBe(1);
    });

    it("parses a 'L1 — L2' hierarchy into two entries linked by parent_ref", async () => {
        const manifest = await buildImportManifest({
            aiCategories: ["Primi — Pasta"],
            existingCategories: [],
            decisions: []
        });
        expect(manifest.categories).toHaveLength(2);
        const l1 = manifest.categories.find(c => c.name === "Primi");
        const l2 = manifest.categories.find(c => c.name === "Pasta");
        expect(l1).toBeDefined();
        expect(l2).toBeDefined();
        expect(l1!.level).toBe(1);
        expect(l1!.parent_ref).toBeNull();
        expect(l2!.level).toBe(2);
        expect(l2!.parent_ref).toBe(l1!.ref);
    });
});

describe("buildImportManifest — products", () => {
    it("emits a formats product with product_type='formats', base_price=null and hashed formats", async () => {
        const manifest = await buildImportManifest({
            aiCategories: ["Bevande"],
            existingCategories: [],
            decisions: [
                {
                    kind: "create",
                    categoryKey: "Bevande",
                    sortOrder: 0,
                    product: {
                        name: "Birra",
                        description: null,
                        base_price: null,
                        formats: [
                            { name: "Piccola", price: 3 },
                            { name: "Media", price: 5 }
                        ]
                    }
                }
            ]
        });
        expect(manifest.products).toHaveLength(1);
        const entry = manifest.products[0];
        expect(entry.action).toBe("create");
        if (entry.action === "create") {
            expect(entry.product.product_type).toBe("formats");
            expect(entry.product.base_price).toBeNull();
            expect(entry.product.format_group_name_hash).toBe(await computeFieldHash("Formati"));
            expect(entry.product.formats).toEqual([
                { name: "Piccola", absolute_price: 3, name_hash: await computeFieldHash("Piccola") },
                { name: "Media", absolute_price: 5, name_hash: await computeFieldHash("Media") }
            ]);
            expect(entry.category_ref).toBe(manifest.categories[0].ref);
        }
    });

    it("emits a simple product with description_hash and base_price", async () => {
        const manifest = await buildImportManifest({
            aiCategories: ["Antipasti"],
            existingCategories: [],
            decisions: [
                {
                    kind: "create",
                    categoryKey: "Antipasti",
                    sortOrder: 0,
                    product: { name: "Olive", description: "Olive taggiasche", base_price: 4 }
                }
            ]
        });
        const entry = manifest.products[0];
        if (entry.action === "create") {
            expect(entry.product.product_type).toBe("simple");
            expect(entry.product.base_price).toBe(4);
            expect(entry.product.formats).toEqual([]);
            expect(entry.product.format_group_name_hash).toBeNull();
            expect(entry.product.description_hash).toBe(await computeFieldHash("Olive taggiasche"));
            expect(entry.product.notes_hash).toBeNull();
            expect(entry.product.variant_strategy).toBe("manual");
        }
    });

    it("excludes 'skip' decisions from the manifest", async () => {
        const manifest = await buildImportManifest({
            aiCategories: ["Antipasti"],
            existingCategories: [],
            decisions: [
                { kind: "skip" },
                {
                    kind: "create",
                    categoryKey: "Antipasti",
                    sortOrder: 0,
                    product: { name: "Olive", description: null, base_price: 4 }
                }
            ]
        });
        expect(manifest.products).toHaveLength(1);
    });

    it("emits a reuse entry with product_id and no payload", async () => {
        const manifest = await buildImportManifest({
            aiCategories: ["Antipasti"],
            existingCategories: [],
            decisions: [
                { kind: "reuse", categoryKey: "Antipasti", sortOrder: 2, productId: "prod-42" }
            ]
        });
        const entry = manifest.products[0];
        expect(entry.action).toBe("reuse");
        if (entry.action === "reuse") {
            expect(entry.product_id).toBe("prod-42");
            expect(entry.sort_order).toBe(2);
            expect(entry.category_ref).toBe(manifest.categories[0].ref);
        }
    });
});
