import { useCallback, useState } from "react";
import { Sparkles, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { supabase } from "@/services/supabase/client";
import { compressImage } from "@/utils/compressImage";
import { createProduct } from "@/services/supabase/products";
import { createPrimaryPriceFormat } from "@/services/supabase/productOptions";
import {
    createCatalog,
    createCategory,
    addProductToCategory
} from "@/services/supabase/catalogs";

import { StepIndicator } from "./components/StepIndicator";
import { UploadStep } from "./steps/UploadStep";
import { AnalyzingStep } from "./steps/AnalyzingStep";
import { ReviewStep } from "./steps/ReviewStep";
import styles from "./aiMenuImport.module.scss";

/* ────────────────────────────── Types ───────────────────── */

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

type WizardStep = "upload" | "analyzing" | "review";

interface AiMenuImportWizardProps {
    onClose: () => void;
    onSuccess: () => void;
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

/* ────────────────────────────── Wizard ───────────────────── */

export function AiMenuImportWizard({ onClose, onSuccess }: AiMenuImportWizardProps) {
    const tenantId = useTenantId();
    const { showToast } = useToast();

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

    /* ── Analyze ──────────────────────────────────────────── */

    const handleAnalyze = useCallback(async () => {
        if (!tenantId || files.length === 0) return;

        setStep("analyzing");
        setAnalyzeError(null);

        try {
            // Compress images (fallback to original on failure), pass PDFs through
            const base64Images = await Promise.all(
                files.map(async file => {
                    if (file.type.startsWith("image/")) {
                        try {
                            const compressed = await compressImage(file, 1200, 0.8);
                            return fileToBase64(compressed);
                        } catch {
                            // Fallback: send original uncompressed
                            return fileToBase64(file);
                        }
                    }
                    return fileToBase64(file);
                })
            );

            const { data: response, error } = await supabase.functions.invoke("menu-ai-import", {
                body: {
                    images: base64Images,
                    tenant_id: tenantId,
                    language_hint: "it"
                }
            });

            if (error) throw new Error(error.message || "Errore nella chiamata");
            if (!response?.success) throw new Error(response?.error || "Errore nell'analisi del menu");

            const result = response.data;

            // Validate response structure
            if (!result || !Array.isArray(result.categories) || result.categories.length === 0) {
                throw new Error("L'AI non ha trovato prodotti nel menù. Prova con un'immagine più nitida.");
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

    const handleRetry = useCallback(() => {
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

    const handleCategoryNameChange = useCallback((key: string, name: string) => {
        setCategoryNames(prev => ({ ...prev, [key]: name }));
    }, []);

    /* ── Import (creation) ────────────────────────────────── */

    const selectedProducts = products.filter(p => p._selected);

    const handleImport = useCallback(async () => {
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
                onSuccess();
                onClose();
            }, 1500);
        } catch (err) {
            console.error("[AiMenuImport] creation error:", err);
            showToast({ message: "Errore durante la creazione del menù.", type: "error" });
            setIsCreating(false);
        }
    }, [tenantId, menuName, selectedProducts, categoryNames, showToast, onSuccess, onClose]);

    /* ── Footer per step ──────────────────────────────────── */

    const renderFooter = () => {
        if (step === "upload") {
            return (
                <>
                    <Button variant="outline" onClick={onClose}>
                        Annulla
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleAnalyze}
                        disabled={files.length === 0}
                        leftIcon={<Sparkles size={16} />}
                    >
                        Analizza menù
                    </Button>
                </>
            );
        }

        if (step === "analyzing") {
            return (
                <Button variant="outline" onClick={handleRetry}>
                    Annulla
                </Button>
            );
        }

        // review
        return (
            <>
                <Button variant="outline" onClick={handleRetry} disabled={isCreating} leftIcon={<ArrowLeft size={16} />}>
                    Indietro
                </Button>
                <Button
                    variant="primary"
                    onClick={handleImport}
                    disabled={selectedProducts.length === 0 || !menuName.trim() || isCreating}
                    loading={isCreating}
                >
                    {isCreating
                        ? `Creazione... (${createProgress.current}/${createProgress.total})`
                        : `Importa ${selectedProducts.length} prodotti`}
                </Button>
            </>
        );
    };

    /* ── Render ────────────────────────────────────────────── */

    const progressPct =
        createProgress.total > 0
            ? Math.round((createProgress.current / createProgress.total) * 100)
            : 0;

    return (
        <div className={styles.drawer}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerTitle}>
                    <div className={styles.headerIcon}>
                        <Sparkles size={18} />
                    </div>
                    <span className={styles.headerLabel}>Importa menù con AI</span>
                </div>
                <StepIndicator current={step} />
            </div>

            {/* Body */}
            <div className={styles.body}>
                {step === "upload" && (
                    <UploadStep files={files} onFilesChange={setFiles} />
                )}

                {step === "analyzing" && (
                    <AnalyzingStep error={analyzeError} onRetry={handleRetry} />
                )}

                {step === "review" && (
                    <ReviewStep
                        menuName={menuName}
                        onMenuNameChange={setMenuName}
                        products={products}
                        categoryNames={categoryNames}
                        onCategoryNameChange={handleCategoryNameChange}
                        onUpdateProduct={updateProduct}
                        onRemoveProduct={removeProduct}
                        onToggleCategory={toggleCategory}
                        onToggleAll={toggleAll}
                    />
                )}

                {/* Import overlay */}
                {isCreating && (
                    <div className={styles.importOverlay}>
                        {!importDone ? (
                            <>
                                <div className={styles.importSpinner} />
                                <div className={styles.importText}>
                                    Creazione in corso... {createProgress.current}/{createProgress.total} prodotti
                                </div>
                                <div className={styles.importProgress}>
                                    <div className={styles.progressTrack}>
                                        <div
                                            className={styles.progressFill}
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                </div>
                                <div className={styles.importHint}>
                                    Non chiudere questa finestra
                                </div>
                            </>
                        ) : (
                            <div className={styles.importSuccess}>
                                <div className={styles.importSuccessIcon}>
                                    <Check size={28} strokeWidth={3} />
                                </div>
                                <div className={styles.importSuccessText}>
                                    Importazione completata!
                                </div>
                                <div className={styles.importSuccessDetail}>
                                    {importResult.created} prodotti creati
                                    {importResult.errors > 0 && `, ${importResult.errors} saltati`}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className={styles.footer}>
                {renderFooter()}
            </div>
        </div>
    );
}
