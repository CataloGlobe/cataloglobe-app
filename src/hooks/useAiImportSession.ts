import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import { supabase } from "@/services/supabase/client";
import { compressImage } from "@/utils/compressImage";
import { MAX_IMAGE_SIZE } from "@/pages/Dashboard/Catalogs/AiMenuImport/aiImportLimits";
import { createProduct } from "@/services/supabase/products";
import { createPrimaryPriceFormat } from "@/services/supabase/productOptions";
import {
    createCatalog,
    createCategory,
    addProductToCategory
} from "@/services/supabase/catalogs";

/* ────────────────────────────── Types ───────────────────── */

type ImagePayload = {
    data: string;
    mime_type: string;
};

export type AiProduct = {
    name: string;
    description: string | null;
    base_price: number | null;
    product_type: "simple" | "formats";
    confidence: "high" | "medium" | "low";
    formats?: { name: string; price: number }[];
    _id: string;
    _selected: boolean;
    _category: string;
};

export type WizardStep = "upload" | "analyzing" | "review";

/**
 * Sessione import AI sollevata a livello di `MainLayout` (montata una sola volta,
 * stesso pattern di `useTranslationCoverage`). Lo stato e la richiesta vivono qui,
 * non nel wizard → sopravvivono all'unmount del drawer/pagina. Il wizard e il
 * drawer ricevono questa sessione per props.
 */
export interface AiImportSession {
    /** Drawer aperto. */
    isOpen: boolean;
    /** Operazione in corso (analisi Gemini O creazione DB) → guard anti-chiusura. */
    isBusy: boolean;
    /** Apre il drawer ripartendo da uno stato pulito (mirror del remount attuale). */
    open: () => void;
    /** Chiude il drawer. */
    close: () => void;

    // Stato wizard
    step: WizardStep;
    files: File[];
    setFiles: Dispatch<SetStateAction<File[]>>;
    analyzeError: string | null;
    products: AiProduct[];
    categoryNames: Record<string, string>;
    menuName: string;
    setMenuName: Dispatch<SetStateAction<string>>;
    isCreating: boolean;
    createProgress: { current: number; total: number };
    importDone: boolean;
    importResult: { created: number; errors: number };
    selectedProducts: AiProduct[];

    // Azioni
    analyze: () => Promise<void>;
    retry: () => void;
    updateProduct: (id: string, updates: Partial<AiProduct>) => void;
    removeProduct: (id: string) => void;
    toggleCategory: (catKey: string) => void;
    toggleAll: () => void;
    setCategoryName: (key: string, name: string) => void;
    createProducts: () => Promise<void>;

    /** Bumpato al successo dell'import → le pagine ricaricano (mirror translationRefreshKey). */
    importRefreshKey: number;
}

/* ────────────────────────────── Helpers ──────────────────── */

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getAiErrorMessage(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand"))
        return "Il servizio AI è temporaneamente sovraccarico. Riprova tra qualche secondo.";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("network"))
        return "Errore di connessione. Verifica la tua connessione internet e riprova.";
    if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("JWT"))
        return "Sessione scaduta. Ricarica la pagina e riprova.";
    if (msg.includes("413") || msg.includes("too large") || msg.includes("payload"))
        return "Le immagini sono troppo grandi. Prova con file più leggeri.";
    if (msg.includes("500") || msg.includes("Internal"))
        return "Errore del server. Riprova tra qualche secondo.";
    if (msg.includes("timeout") || msg.includes("Timeout"))
        return "L'analisi ha impiegato troppo tempo. Riprova con meno immagini.";

    return "Si è verificato un errore durante l'analisi. Riprova.";
}

/* ────────────────────────────── Hook ───────────────────── */

export function useAiImportSession(tenantId: string | null): AiImportSession {
    const { showToast } = useToast();

    // Drawer
    const [isOpen, setIsOpen] = useState(false);

    // Step state
    const [step, setStep] = useState<WizardStep>("upload");
    const [files, setFiles] = useState<File[]>([]);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);

    // Review state
    const [products, setProducts] = useState<AiProduct[]>([]);
    const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
    const [menuName, setMenuName] = useState("");

    // Creation state
    const [isCreating, setIsCreating] = useState(false);
    const [createProgress, setCreateProgress] = useState({ current: 0, total: 0 });
    const [importDone, setImportDone] = useState(false);
    const [importResult, setImportResult] = useState({ created: 0, errors: 0 });

    // Page-facing reload signal
    const [importRefreshKey, setImportRefreshKey] = useState(0);

    const reset = useCallback(() => {
        setStep("upload");
        setFiles([]);
        setAnalyzeError(null);
        setProducts([]);
        setCategoryNames({});
        setMenuName("");
        setIsCreating(false);
        setCreateProgress({ current: 0, total: 0 });
        setImportDone(false);
        setImportResult({ created: 0, errors: 0 });
    }, []);

    // Apre ripartendo pulito: replica il remount del wizard (SystemDrawer smonta
    // i children alla chiusura, quindi oggi ogni apertura è fresca).
    const open = useCallback(() => {
        reset();
        setIsOpen(true);
    }, [reset]);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    /* ── Analyze ──────────────────────────────────────────── */

    const analyze = useCallback(async () => {
        if (!tenantId || files.length === 0) return;

        setStep("analyzing");
        setAnalyzeError(null);

        try {
            // Compress images (fallback to original on failure), pass PDFs through
            const imagePayloads: ImagePayload[] = await Promise.all(
                files.map(async file => {
                    if (file.type.startsWith("image/")) {
                        try {
                            const compressed = await compressImage(file, 1200, 0.8, MAX_IMAGE_SIZE);
                            return { data: await fileToBase64(compressed), mime_type: "image/jpeg" };
                        } catch {
                            // Fallback: send original uncompressed
                            return { data: await fileToBase64(file), mime_type: file.type || "image/jpeg" };
                        }
                    }
                    return { data: await fileToBase64(file), mime_type: file.type || "application/pdf" };
                })
            );

            const { data: response, error } = await supabase.functions.invoke("menu-ai-import", {
                body: {
                    images: imagePayloads,
                    tenant_id: tenantId,
                    language_hint: "it"
                }
            });

            // Non-2xx → supabase-js wraps response in FunctionsHttpError. The
            // original Response sits on error.context; read its JSON body so we
            // can surface the specific Italian message returned by the function
            // instead of the generic "Edge Function returned a non-2xx".
            if (error) {
                let apiMessage: string | null = null;
                try {
                    const ctx = (error as { context?: Response }).context;
                    if (ctx && typeof ctx.json === "function") {
                        const errBody = await ctx.json();
                        if (errBody && typeof errBody.error === "string" && errBody.error.length > 0) {
                            apiMessage = errBody.error;
                        }
                    }
                } catch {
                    // body unreadable, fall back below
                }
                console.error("[AiMenuImport] analyze edge error:", error);
                setAnalyzeError(apiMessage ?? getAiErrorMessage(error));
                return;
            }

            // 2xx with success: false → message already in Italian, use as-is
            if (!response?.success) {
                console.error("[AiMenuImport] analyze response not successful:", response);
                setAnalyzeError(
                    typeof response?.error === "string" && response.error.length > 0
                        ? response.error
                        : "Errore nell'analisi del menu"
                );
                return;
            }

            const result = response.data;

            // Validate response structure
            if (!result || !Array.isArray(result.categories) || result.categories.length === 0) {
                setAnalyzeError("L'AI non ha trovato prodotti nel menù. Prova con un'immagine più nitida.");
                return;
            }

            // Transform AI result into editable products
            const flatProducts: AiProduct[] = [];
            const catNames: Record<string, string> = {};

            for (const cat of result.categories) {
                catNames[cat.name] = cat.name;
                for (const item of cat.items) {
                    flatProducts.push({
                        ...item,
                        _id: crypto.randomUUID(),
                        _selected: item.confidence !== "low",
                        _category: cat.name
                    });
                }
            }

            setProducts(flatProducts);
            setCategoryNames(catNames);
            setMenuName("");
            setStep("review");
        } catch (err: unknown) {
            console.error("[AiMenuImport] analyze error:", err);
            setAnalyzeError(getAiErrorMessage(err));
        }
    }, [tenantId, files]);

    const retry = useCallback(() => {
        setStep("upload");
        setAnalyzeError(null);
    }, []);

    /* ── Product updates ──────────────────────────────────── */

    const updateProduct = useCallback((id: string, updates: Partial<AiProduct>) => {
        setProducts(prev => prev.map(p => (p._id === id ? { ...p, ...updates } : p)));
    }, []);

    const removeProduct = useCallback((id: string) => {
        setProducts(prev => prev.filter(p => p._id !== id));
    }, []);

    const toggleCategory = useCallback((catKey: string) => {
        setProducts(prev => {
            const catProducts = prev.filter(p => p._category === catKey);
            const allSelected = catProducts.every(p => p._selected);
            return prev.map(p =>
                p._category === catKey ? { ...p, _selected: !allSelected } : p
            );
        });
    }, []);

    const toggleAll = useCallback(() => {
        setProducts(prev => {
            const allSelected = prev.every(p => p._selected);
            return prev.map(p => ({ ...p, _selected: !allSelected }));
        });
    }, []);

    const setCategoryName = useCallback((key: string, name: string) => {
        setCategoryNames(prev => ({ ...prev, [key]: name }));
    }, []);

    /* ── Import (creation) ────────────────────────────────── */

    const selectedProducts = useMemo(
        () => products.filter(p => p._selected),
        [products]
    );

    const createProducts = useCallback(async () => {
        if (!tenantId || !menuName.trim() || selectedProducts.length === 0) return;

        setIsCreating(true);
        setImportDone(false);
        setCreateProgress({ current: 0, total: selectedProducts.length });

        let created = 0;
        let errors = 0;

        try {
            // 1. Parse category hierarchy from " — " separator
            const usedCategoryKeys = [...new Set(selectedProducts.map(p => p._category))];

            const l1Names: string[] = [];
            const l2Map = new Map<string, string[]>(); // l1Name → [l2Name, ...]

            for (const key of usedCategoryKeys) {
                const display = categoryNames[key] ?? key;
                const parts = display.split(" — ");
                const l1 = parts[0].trim();

                if (!l1Names.includes(l1)) l1Names.push(l1);

                if (parts.length > 1) {
                    const l2 = parts[1].trim();
                    if (!l2Map.has(l1)) l2Map.set(l1, []);
                    const l2List = l2Map.get(l1)!;
                    if (!l2List.includes(l2)) l2List.push(l2);
                }
            }

            // 2. Create catalog
            const catalog = await createCatalog(tenantId, menuName.trim());

            // 3. Create L1 categories
            const l1IdMap = new Map<string, string>(); // l1Name → categoryId
            for (let i = 0; i < l1Names.length; i++) {
                const cat = await createCategory(tenantId, catalog.id, l1Names[i], 1, null, i);
                l1IdMap.set(l1Names[i], cat.id);
            }

            // 4. Create L2 categories
            const l2IdMap = new Map<string, string>(); // "l1Name — l2Name" → categoryId
            for (const [l1Name, l2Names] of l2Map) {
                const parentId = l1IdMap.get(l1Name)!;
                for (let i = 0; i < l2Names.length; i++) {
                    const cat = await createCategory(tenantId, catalog.id, l2Names[i], 2, parentId, i);
                    l2IdMap.set(`${l1Name} — ${l2Names[i]}`, cat.id);
                }
            }

            // 5. Create products and assign to categories
            // Group selected products by category for sort_order
            const productsByCategory = new Map<string, AiProduct[]>();
            for (const p of selectedProducts) {
                const key = p._category;
                if (!productsByCategory.has(key)) productsByCategory.set(key, []);
                productsByCategory.get(key)!.push(p);
            }

            for (const [catKey, catProducts] of productsByCategory) {
                const display = categoryNames[catKey] ?? catKey;
                const parts = display.split(" — ");
                const l1 = parts[0].trim();

                // Determine target category ID
                let targetCategoryId: string;
                if (parts.length > 1) {
                    const l2Key = `${l1} — ${parts[1].trim()}`;
                    targetCategoryId = l2IdMap.get(l2Key) ?? l1IdMap.get(l1)!;
                } else {
                    targetCategoryId = l1IdMap.get(l1)!;
                }

                for (let i = 0; i < catProducts.length; i++) {
                    const p = catProducts[i];
                    try {
                        // Create product
                        // Create as "simple" — createPrimaryPriceFormat auto-transitions to "formats"
                        const newProduct = await createProduct(tenantId, {
                            name: p.name,
                            description: p.description,
                            base_price: p.product_type === "simple" ? p.base_price : null
                        });

                        // Create formats if needed
                        if (p.product_type === "formats" && p.formats) {
                            for (const fmt of p.formats) {
                                await createPrimaryPriceFormat(
                                    newProduct.id,
                                    tenantId,
                                    fmt.name,
                                    fmt.price
                                );
                            }
                        }

                        // Assign to category
                        await addProductToCategory(
                            tenantId,
                            catalog.id,
                            targetCategoryId,
                            newProduct.id,
                            i
                        );

                        created++;
                    } catch (err) {
                        console.error(`[AiMenuImport] Failed to create product "${p.name}":`, err);
                        errors++;
                    }

                    setCreateProgress({ current: created + errors, total: selectedProducts.length });
                }
            }

            // 6. Done
            setImportResult({ created, errors });
            setImportDone(true);

            // Auto-close after brief display of success
            setTimeout(() => {
                if (errors === 0) {
                    showToast({
                        message: `Menù importato con successo! ${created} prodotti creati.`,
                        type: "success"
                    });
                } else {
                    showToast({
                        message: `${created} prodotti importati, ${errors} saltati per errori.`,
                        type: "warning"
                    });
                }
                setImportRefreshKey(k => k + 1);
                setIsOpen(false);
            }, 1500);
        } catch (err) {
            console.error("[AiMenuImport] creation error:", err);
            showToast({ message: "Errore durante la creazione del menù.", type: "error" });
            setIsCreating(false);
        }
    }, [tenantId, menuName, selectedProducts, categoryNames, showToast]);

    const isBusy = step === "analyzing" || isCreating;

    return {
        isOpen,
        isBusy,
        open,
        close,
        step,
        files,
        setFiles,
        analyzeError,
        products,
        categoryNames,
        menuName,
        setMenuName,
        isCreating,
        createProgress,
        importDone,
        importResult,
        selectedProducts,
        analyze,
        retry,
        updateProduct,
        removeProduct,
        toggleCategory,
        toggleAll,
        setCategoryName,
        createProducts,
        importRefreshKey
    };
}
