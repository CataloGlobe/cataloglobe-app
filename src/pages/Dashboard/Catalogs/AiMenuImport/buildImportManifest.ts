/**
 * Manifest builder puro per l'import AI in catalogo esistente (FASE 2B).
 *
 * Trasforma categorie AI + decisioni per-prodotto (già risolte a monte) nelle
 * due liste `{ categories, products }` che la RPC `import_products_into_catalog`
 * consuma verbatim. Nessuna chiamata Supabase: l'unica dipendenza è
 * `computeFieldHash`/`computeNotesHash` (hash canonical puro), così i payload
 * risultano IDENTICI a quelli che il path per-riga scrive oggi
 * (createProduct/createCategory/createProductOptionGroup/createOptionValue).
 *
 * Side-effect formats riprodotto qui (la RPC non lo deriva): un prodotto con
 * `formats` non vuoti → `product_type:"formats"` + `base_price:null` (mirror di
 * createProductOptionGroup, productOptions.ts:112-121).
 */

import { computeFieldHash, computeNotesHash } from "@/services/translation/hashUtils";
import { normalizeName } from "@/utils/importMatching";
import type {
    ImportManifest,
    ImportManifestCategory,
    ImportManifestProduct,
    ImportManifestProductPayload
} from "@/types/aiImport";

/** Nome del gruppo PRIMARY_PRICE creato per i formati (mirror createPrimaryPriceFormat). */
const FORMATS_GROUP_NAME = "Formati";
/** Separatore gerarchia categorie AI ("L1 — L2"). */
const CATEGORY_SEPARATOR = " — ";

/** Categoria già presente nel catalogo di destinazione (vuoto per nuovo catalogo). */
export interface ExistingManifestCategory {
    id: string;
    name: string;
    level: 1 | 2 | 3;
    parent_category_id: string | null;
}

/** Prodotto AI da creare (payload grezzo pre-hash). */
export interface AiImportProductInput {
    name: string;
    description: string | null;
    base_price: number | null;
    image_url?: string | null;
    formats?: { name: string; price: number }[];
}

export type ProductImportDecision =
    | { kind: "create"; categoryKey: string; sortOrder: number; product: AiImportProductInput }
    | { kind: "reuse"; categoryKey: string; sortOrder: number; productId: string }
    | { kind: "skip" };

export interface BuildImportManifestInput {
    /** Categorie AI (display string, possibile gerarchia "L1 — L2"). */
    aiCategories: string[];
    /** Categorie già presenti nel catalogo di destinazione (vuoto per nuovo). */
    existingCategories: ExistingManifestCategory[];
    /** Decisioni per prodotto già risolte (create / reuse / skip). */
    decisions: ProductImportDecision[];
}

interface ResolvedRef {
    ref: string;
    existingId: string | null;
}

/**
 * Costruisce il manifest `{ categories, products }`.
 *
 * Categorie: parse su `" — "`, match per `normalizeName` (stesso livello +
 * stesso parent) contro le esistenti; se match → `existing_id`, altrimenti crea
 * con `ref`/`name_hash`. Auto-crea i livelli mancanti.
 *
 * Prodotti: escluse le `skip`, ogni entry riferisce la categoria FOGLIA
 * (deepest) della sua `categoryKey`. `create` → payload completo con hash (e per
 * i formats side-effect + hash per value); `reuse` → `product_id`.
 */
export async function buildImportManifest(
    input: BuildImportManifestInput
): Promise<ImportManifest> {
    // Union di aiCategories + le categoryKey referenziate dalle decisioni:
    // garantisce che ogni chiave usata da un prodotto sia risolvibile a un ref.
    const categoryKeys = uniquePreserveOrder([
        ...input.aiCategories,
        ...input.decisions
            .filter((d): d is Exclude<ProductImportDecision, { kind: "skip" }> => d.kind !== "skip")
            .map(d => d.categoryKey)
    ]);

    const categories: ImportManifestCategory[] = [];
    // pathKey normalizzato ("l1" | "l1 — l2") → ref risolto.
    const refByPath = new Map<string, ResolvedRef>();
    // Conteggio fratelli emessi per (parentRef, level) → sort_order deterministico.
    const siblingCount = new Map<string, number>();
    let refSeq = 0;

    for (const rawKey of categoryKeys) {
        const segments = rawKey
            .split(CATEGORY_SEPARATOR)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        let parentRef: string | null = null;
        let parentExistingId: string | null = null;
        let parentIsNew = false;
        let pathKey = "";

        for (let i = 0; i < segments.length; i++) {
            const name = segments[i];
            const level = Math.min(i + 1, 3) as 1 | 2 | 3;
            pathKey = pathKey ? `${pathKey}${CATEGORY_SEPARATOR}${normalizeName(name)}` : normalizeName(name);

            const already = refByPath.get(pathKey);
            if (already) {
                parentRef = already.ref;
                parentExistingId = already.existingId;
                parentIsNew = already.existingId === null;
                continue;
            }

            // Match esistente solo se il parent è esistente (un figlio di una
            // categoria appena creata non può combaciare con una riga in DB).
            const matched = parentIsNew
                ? undefined
                : input.existingCategories.find(
                      c =>
                          c.level === level &&
                          normalizeName(c.name) === normalizeName(name) &&
                          (c.parent_category_id ?? null) === (parentExistingId ?? null)
                  );

            const ref = `c${++refSeq}`;
            const siblingKey = `${parentRef ?? "__root__"}|${level}`;
            const sortOrder = siblingCount.get(siblingKey) ?? 0;
            siblingCount.set(siblingKey, sortOrder + 1);

            if (matched) {
                categories.push({
                    ref,
                    existing_id: matched.id,
                    name,
                    name_hash: null,
                    level,
                    parent_ref: parentRef,
                    sort_order: sortOrder
                });
                refByPath.set(pathKey, { ref, existingId: matched.id });
                parentRef = ref;
                parentExistingId = matched.id;
                parentIsNew = false;
            } else {
                categories.push({
                    ref,
                    existing_id: null,
                    name,
                    name_hash: await computeFieldHash(name),
                    level,
                    parent_ref: parentRef,
                    sort_order: sortOrder
                });
                refByPath.set(pathKey, { ref, existingId: null });
                parentRef = ref;
                parentExistingId = null;
                parentIsNew = true;
            }
        }
    }

    const products: ImportManifestProduct[] = [];
    for (const decision of input.decisions) {
        if (decision.kind === "skip") continue;

        const categoryRef = resolveLeafRef(decision.categoryKey, refByPath);
        if (!categoryRef) {
            // Chiave non risolvibile: skip difensivo (non dovrebbe accadere per la
            // union sopra). Meglio omettere che emettere un ref invalido → 42501.
            continue;
        }

        if (decision.kind === "reuse") {
            products.push({
                action: "reuse",
                category_ref: categoryRef,
                sort_order: decision.sortOrder,
                product_id: decision.productId
            });
            continue;
        }

        products.push({
            action: "create",
            category_ref: categoryRef,
            sort_order: decision.sortOrder,
            product: await buildProductPayload(decision.product)
        });
    }

    return { categories, products };
}

async function buildProductPayload(
    product: AiImportProductInput
): Promise<ImportManifestProductPayload> {
    const description = product.description ?? null;
    const hasFormats = Array.isArray(product.formats) && product.formats.length > 0;

    if (hasFormats) {
        const formats = await Promise.all(
            product.formats!.map(async f => ({
                name: f.name,
                absolute_price: f.price,
                name_hash: await computeFieldHash(f.name)
            }))
        );
        return {
            name: product.name,
            description,
            base_price: null,
            image_url: product.image_url ?? null,
            product_type: "formats",
            variant_strategy: "manual",
            notes: [],
            description_hash: await computeFieldHash(description),
            notes_hash: await computeNotesHash([]),
            format_group_name_hash: await computeFieldHash(FORMATS_GROUP_NAME),
            formats
        };
    }

    return {
        name: product.name,
        description,
        base_price: product.base_price ?? null,
        image_url: product.image_url ?? null,
        product_type: "simple",
        variant_strategy: "manual",
        notes: [],
        description_hash: await computeFieldHash(description),
        notes_hash: await computeNotesHash([]),
        format_group_name_hash: null,
        formats: []
    };
}

function resolveLeafRef(categoryKey: string, refByPath: Map<string, ResolvedRef>): string | null {
    const normalizedPath = categoryKey
        .split(CATEGORY_SEPARATOR)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => normalizeName(s))
        .join(CATEGORY_SEPARATOR);
    return refByPath.get(normalizedPath)?.ref ?? null;
}

function uniquePreserveOrder(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
    }
    return out;
}
