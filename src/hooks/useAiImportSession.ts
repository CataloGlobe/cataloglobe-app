import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
 * Stato derivato della sessione, sorgente di verità per la vista del wizard al
 * (ri)mount e per la logica di ri-aggancio di `open()`.
 * - `idle`     → upload pulito, nessun lavoro
 * - `analyzing`→ richiesta Gemini in volo
 * - `error`    → analisi fallita (in attesa di Riprova/Ricomincia)
 * - `review`   → prodotti pronti da rivedere (non ancora salvati)
 * - `creating` → creazione DB in corso
 * - `done`     → import salvato (transitorio, prima dell'auto-close)
 */
export type AiImportStatus = "idle" | "analyzing" | "error" | "review" | "creating" | "done";

/**
 * Sessione import AI sollevata a livello di `MainLayout` (montata una sola volta,
 * stesso pattern di `useTranslationCoverage`). Lo stato e la richiesta vivono qui,
 * non nel wizard → sopravvivono all'unmount del drawer/pagina. Il wizard e il
 * drawer ricevono questa sessione per props.
 */
export interface AiImportSession {
    /** Drawer aperto. */
    isOpen: boolean;
    /** Operazione in corso (analisi Gemini O creazione DB). */
    isBusy: boolean;
    /** Stato derivato della sessione (sorgente di verità per la vista). */
    status: AiImportStatus;
    /**
     * Apre il drawer. Ri-aggancia una sessione attiva (`analyzing`/`error`/
     * `review`/`creating`) mostrando la vista corrente; riparte pulito solo se
     * `idle` o `done`. Garantisce single-flight: non avvia una seconda sessione.
     */
    open: () => void;
    /** Chiude il drawer. NON annulla la richiesta: nasconde soltanto. */
    close: () => void;
    /** Scarta la sessione corrente e riparte dall'upload (affordance "ricomincia"). */
    startNew: () => void;
    /**
     * Abbandona l'analisi in volo e torna all'upload. Onesta: aborta solo
     * l'attesa lato client — il lavoro su Gemini e l'RPD già consumato NON si
     * recuperano. Distinta da `close()`, che lascia girare la richiesta.
     */
    cancelAnalysis: () => void;

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

    // AbortController della richiesta `analyze()` in volo. `cancelAnalysis()` lo
    // aborta per smettere di aspettare lato client (stessa plumbing del futuro
    // timeout per-tentativo). Catturato anche in closure dentro `analyze()` come
    // token per-richiesta: una risposta tardiva la cui closure è abortita non
    // applica i risultati (anti risposta-zombie).
    const analysisControllerRef = useRef<AbortController | null>(null);

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

    // Stato derivato + ref per leggerlo dentro callback stabili (open/analyze)
    // senza inserirlo nelle deps (le azioni sono nelle deps del memo dell'Outlet
    // context in MainLayout → devono restare di identità stabile).
    const status: AiImportStatus = importDone
        ? "done"
        : isCreating
            ? "creating"
            : step === "review"
                ? "review"
                : step === "analyzing"
                    ? (analyzeError ? "error" : "analyzing")
                    : "idle";
    const statusRef = useRef<AiImportStatus>(status);
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    // Ri-aggancia una sessione attiva (mostra la vista corrente al rimount del
    // wizard); riparte pulito solo se idle o done (import già salvato).
    const open = useCallback(() => {
        const s = statusRef.current;
        if (s === "idle" || s === "done") reset();
        setIsOpen(true);
    }, [reset]);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    // Affordance "ricomincia": scarta la sessione pending e torna all'upload.
    const startNew = useCallback(() => {
        reset();
    }, [reset]);

    // Abbandona l'analisi in volo: aborta la richiesta (la closure di `analyze()`
    // vede `signal.aborted` e esce in silenzio, senza clobberare la sessione
    // nuova) e torna all'upload. NON ferma il lavoro server né recupera l'RPD.
    const cancelAnalysis = useCallback(() => {
        analysisControllerRef.current?.abort();
        analysisControllerRef.current = null;
        startNew();
    }, [startNew]);

    // Handoff fine analisi: se l'analisi termina (analyzing → review) MENTRE il
    // drawer è chiuso, l'utente non vede il risultato → toast azionabile "Rivedi".
    // Stesso stampo di prevPendingRef in useTranslationCoverage. Nessun toast a
    // drawer aperto (la Revisione è già a schermo → sarebbe rumore).
    const prevStatusRef = useRef<AiImportStatus>(status);
    useEffect(() => {
        const prev = prevStatusRef.current;
        prevStatusRef.current = status;
        if (prev === "analyzing" && status === "review" && !isOpen) {
            showToast({
                message: "Menù analizzato — rivedi i prodotti",
                type: "success",
                actionLabel: "Rivedi",
                onAction: () => open()
            });
        }
    }, [status, isOpen, showToast, open]);

    /* ── Analyze ──────────────────────────────────────────── */

    const analyze = useCallback(async () => {
        if (!tenantId || files.length === 0) return;
        // Single-flight: mai una seconda richiesta mentre una è in volo.
        if (statusRef.current === "analyzing" || statusRef.current === "creating") return;

        setStep("analyzing");
        setAnalyzeError(null);

        // Token per-richiesta: catturato in closure. cancelAnalysis() lo aborta;
        // ogni guardia sotto controlla `controller.signal.aborted` su QUESTA
        // closure, così una risposta tardiva non scrive nella sessione nuova.
        const controller = new AbortController();
        analysisControllerRef.current = controller;

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
                },
                signal: controller.signal
            });

            // Abort intenzionale (cancelAnalysis): la sessione è già tornata
            // all'upload. Esci in silenzio — niente stato error, niente clobber
            // della sessione nuova (anti risposta-zombie). Copre sia il path
            // `{ error }` (FunctionsFetchError che incapsula l'AbortError) sia il
            // throw.
            if (controller.signal.aborted) return;

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
            // Abort intenzionale: nessuno stato error, nessun toast. Discriminato
            // via la closure (`controller.signal.aborted`) o l'AbortError grezzo.
            if (
                controller.signal.aborted ||
                (err instanceof DOMException && err.name === "AbortError")
            ) {
                return;
            }
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
        status,
        open,
        close,
        startNew,
        cancelAnalysis,
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
