import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import { analyzeMenuFiles } from "@/pages/Dashboard/Catalogs/AiMenuImport/analyzeMenu";
import {
    buildImportManifest,
    type ProductImportDecision,
    type ExistingManifestCategory,
    type AiImportProductInput
} from "@/pages/Dashboard/Catalogs/AiMenuImport/buildImportManifest";
import { importProductsIntoCatalog, enqueueImportSideEffects } from "@/services/supabase/aiImport";

/* ────────────────────────────── Types ───────────────────── */

export type AiProduct = {
    name: string;
    description: string | null;
    base_price: number | null;
    product_type: "simple" | "formats";
    confidence: "high" | "medium" | "low";
    // `price` nullable: l'AI può estrarre un formato senza prezzo, e la
    // revisione permette di svuotare il campo prima di reinserirlo.
    formats?: { name: string; price: number | null }[];
    _id: string;
    _selected: boolean;
    _category: string;
};

export type WizardStep = "upload" | "analyzing" | "review";

/** Destinazione dell'import allo step 3: nuovo catalogo vs catalogo esistente. */
export type ImportMode = "new" | "existing";

/**
 * Destinazione iniziale opzionale per la scorciatoia "Aggiungi prodotti con AI"
 * dal kebab di un menu: apre il wizard già puntato su quel catalogo (selettore
 * nascosto, destinazione bloccata). Vedi FASE 2C-5.
 */
export interface ImportOpenTarget {
    catalogId: string;
    catalogName: string;
}

/**
 * Piano risolto per l'import nel ramo "catalogo esistente". Calcolato dalla UI
 * (ExistingImportReview) a partire da catalogo scelto + mapping categorie +
 * decisioni per prodotto, e sollevato qui perché footer del wizard e submit
 * condividano la stessa sorgente. `null` finché manca il catalogo di
 * destinazione. Consumato da `importIntoExistingCatalog`.
 */
export interface ExistingImportPlan {
    catalogId: string;
    catalogName: string;
    /** Chiavi categoria (display, possibile gerarchia "L1 — L2") per il builder. */
    aiCategories: string[];
    /** Categorie già presenti nel catalogo, per il match del builder. */
    existingCategories: ExistingManifestCategory[];
    /** Decisioni per prodotto già risolte (create / reuse / skip). */
    decisions: ProductImportDecision[];
    createCount: number;
    reuseCount: number;
    /** true se resta almeno un `reusable_ambiguous` non risolto → blocca submit. */
    hasUnresolvedAmbiguous: boolean;
}

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

/** Esito di un import committato: catalogo di destinazione risolto dalla RPC. */
export interface AiImportOutcome {
    catalogId: string;
    catalogName: string;
}

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
    open: (target?: ImportOpenTarget) => void;
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
    /** Submit del ramo "nuovo catalogo" (write-path atomico via RPC). */
    importNewCatalog: () => Promise<void>;

    // Ramo "catalogo esistente" (FASE 2C-1)
    /** tenant corrente (per data-fetch/submit del ramo esistente). */
    tenantId: string | null;
    /** Destinazione step 3: nuovo catalogo vs esistente. */
    importMode: ImportMode;
    setImportMode: (mode: ImportMode) => void;
    /** Catalogo pre-puntato dalla scorciatoia kebab (null = apertura standard). */
    initialCatalogId: string | null;
    initialCatalogName: string | null;
    /** Piano risolto sollevato da ExistingImportReview (null = catalogo non scelto). */
    existingImportPlan: ExistingImportPlan | null;
    setExistingImportPlan: (plan: ExistingImportPlan | null) => void;
    /** Submit atomico del ramo esistente via RPC + side-effect traduzioni. */
    importIntoExistingCatalog: () => Promise<void>;

    /** Bumpato al successo dell'import → le pagine ricaricano (mirror translationRefreshKey). */
    importRefreshKey: number;
}

/* ────────────────────────────── Hook ───────────────────── */

export function useAiImportSession(
    tenantId: string | null,
    /**
     * Opzionale (FASE 5): invocato dopo che l'edge `menu-ai-import` risponde
     * (successo o blocco quota) così il chiamante aggiorna lo stato quota AI
     * (pill/sezione). Non chiamato su abort intenzionale.
     */
    onConsumed?: () => void,
    /**
     * Opzionale: invocato una sola volta a import committato, con il catalogo
     * di destinazione risolto dalla RPC. Esiste perché un chiamante che deve
     * *reagire* all'esito (es. il setup guidato, che avanza di passo) non debba
     * dedurlo osservando `importRefreshKey`, che è un segnale di reload e non
     * porta con sé il risultato. Invocato in coda all'auto-close, così l'esito
     * arriva quando il pannello ha finito di mostrarsi.
     */
    onImported?: (outcome: AiImportOutcome) => void
): AiImportSession {
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

    // Existing-catalog import branch (FASE 2C-1)
    const [importMode, setImportMode] = useState<ImportMode>("new");
    const [existingImportPlan, setExistingImportPlan] = useState<ExistingImportPlan | null>(null);
    // Destinazione bloccata dalla scorciatoia kebab (FASE 2C-5).
    const [initialCatalogId, setInitialCatalogId] = useState<string | null>(null);
    const [initialCatalogName, setInitialCatalogName] = useState<string | null>(null);
    // Ref per leggere il piano più recente dentro il callback stabile di submit
    // senza inserirlo nelle deps (identità azioni stabile per l'Outlet context).
    const existingPlanRef = useRef<ExistingImportPlan | null>(null);
    useEffect(() => {
        existingPlanRef.current = existingImportPlan;
    }, [existingImportPlan]);

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
        setImportMode("new");
        setExistingImportPlan(null);
        setInitialCatalogId(null);
        setInitialCatalogName(null);
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

    // Callback d'esito tenuta in ref: `submitManifest` la invoca da dentro un
    // timeout e non deve ricrearsi (né catturare una closure stale) quando il
    // chiamante passa una lambda inline.
    const onImportedRef = useRef(onImported);
    useEffect(() => {
        onImportedRef.current = onImported;
    }, [onImported]);

    // Ri-aggancia una sessione attiva (mostra la vista corrente al rimount del
    // wizard); riparte pulito solo se idle o done (import già salvato).
    const open = useCallback(
        (target?: ImportOpenTarget) => {
            const s = statusRef.current;
            // Applica la destinazione bloccata solo su avvio pulito; se c'è una
            // sessione attiva si ri-aggancia la vista corrente senza clobber.
            if (s === "idle" || s === "done") {
                reset();
                if (target) {
                    setInitialCatalogId(target.catalogId);
                    setInitialCatalogName(target.catalogName);
                    setImportMode("existing");
                }
            }
            setIsOpen(true);
        },
        [reset]
    );

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

        // Token per-richiesta: catturato in closure. cancelAnalysis() lo aborta e
        // `analyzeMenuFiles` risponde null, così una risposta tardiva non scrive
        // nella sessione nuova.
        const controller = new AbortController();
        analysisControllerRef.current = controller;

        const res = await analyzeMenuFiles(tenantId, files, controller.signal, onConsumed);
        // Annullata (cancelAnalysis): la sessione è già tornata all'upload, niente stato.
        if (!res) return;
        if (!res.ok) {
            setAnalyzeError(res.error);
            return;
        }

        // Il risultato diventa la lista da rivedere
        const flatProducts: AiProduct[] = [];
        const catNames: Record<string, string> = {};

        for (const cat of res.categories) {
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
    }, [tenantId, files, onConsumed]);

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

    // Primitiva atomica condivisa dai due rami (nuovo + esistente): builder puro
    // → RPC user-scoped `import_products_into_catalog` → side-effect traduzioni
    // (fire-and-forget silent-error) → overlay/toast/close. Un solo write-path,
    // rollback totale lato DB in caso di errore (niente più `errors++` per-row).
    const submitManifest = useCallback(
        async (
            buildArgs: {
                aiCategories: string[];
                existingCategories: ExistingManifestCategory[];
                decisions: ProductImportDecision[];
            },
            target: {
                catalogId: string | null;
                newCatalogName: string | null;
                /** Nome del catalogo di destinazione, per l'esito notificato al chiamante. */
                displayName: string;
            },
            totalOps: number
        ) => {
            if (!tenantId) return;
            setIsCreating(true);
            setImportDone(false);
            setCreateProgress({ current: 0, total: totalOps });

            try {
                const manifest = await buildImportManifest(buildArgs);

                const summary = await importProductsIntoCatalog(tenantId, {
                    catalogId: target.catalogId,
                    newCatalogName: target.newCatalogName,
                    categories: manifest.categories,
                    products: manifest.products
                });

                // Fire-and-forget silent-error: un fallimento di enqueue/revalidate
                // NON deve rompere il flusso (import già committato dalla RPC).
                await enqueueImportSideEffects(tenantId, manifest, summary);

                setCreateProgress({ current: totalOps, total: totalOps });
                setImportResult({ created: summary.created_products, errors: 0 });
                setImportDone(true);

                setTimeout(() => {
                    const parts = [`${summary.created_products} creati`];
                    if (summary.reused_products > 0) parts.push(`${summary.reused_products} riusati`);
                    if (summary.skipped > 0) parts.push(`${summary.skipped} saltati`);
                    showToast({
                        message: `Import completato: ${parts.join(", ")}.`,
                        type: "success"
                    });
                    setImportRefreshKey(k => k + 1);
                    setIsOpen(false);
                    onImportedRef.current?.({
                        catalogId: summary.catalog_id,
                        catalogName: target.displayName
                    });
                }, 1500);
            } catch (err) {
                console.error("[AiMenuImport] import error:", err);
                const code = (err as { code?: string }).code;
                showToast({
                    message:
                        code === "42501"
                            ? "Permesso negato: non puoi scrivere in questo catalogo."
                            : "Errore durante l'import nel catalogo.",
                    type: "error"
                });
                setIsCreating(false);
            }
        },
        [tenantId, showToast]
    );

    // Ramo "nuovo catalogo": UX invariata (nome menù + lista). Write-path ora
    // sulla RPC: insiemi esistenti vuoti → manifest all-create (categorie AI con
    // gerarchia " — " preservata dal builder, prodotti tutti create).
    const importNewCatalog = useCallback(async () => {
        if (!tenantId || !menuName.trim() || selectedProducts.length === 0) return;
        if (statusRef.current === "creating") return;

        const sortCounters = new Map<string, number>();
        const aiCategoriesSet = new Set<string>();
        const decisions: ProductImportDecision[] = [];

        for (const p of selectedProducts) {
            const key = categoryNames[p._category] ?? p._category;
            aiCategoriesSet.add(key);
            const so = sortCounters.get(key) ?? 0;
            const product: AiImportProductInput = {
                name: p.name,
                description: p.description,
                base_price: p.product_type === "simple" ? p.base_price : null,
                formats:
                    p.product_type === "formats" && Array.isArray(p.formats)
                        ? p.formats.map(f => ({ name: f.name, price: f.price }))
                        : undefined
            };
            decisions.push({ kind: "create", categoryKey: key, sortOrder: so, product });
            sortCounters.set(key, so + 1);
        }

        await submitManifest(
            {
                aiCategories: Array.from(aiCategoriesSet),
                existingCategories: [],
                decisions
            },
            {
                catalogId: null,
                newCatalogName: menuName.trim(),
                displayName: menuName.trim()
            },
            selectedProducts.length
        );
    }, [tenantId, menuName, selectedProducts, categoryNames, submitManifest]);

    /* ── Import in catalogo esistente (ramo 2C-1) ─────────────── */

    // Legge il piano dal ref (identità stabile). Il footer del wizard blocca già
    // catalogo mancante / 0 selezionati / ambigui non risolti, ma ri-controllo
    // qui per sicurezza. Delega il write-path a `submitManifest`.
    const importIntoExistingCatalog = useCallback(async () => {
        const plan = existingPlanRef.current;
        if (!tenantId || !plan) return;
        if (plan.createCount + plan.reuseCount === 0 || plan.hasUnresolvedAmbiguous) return;
        if (statusRef.current === "creating") return;

        await submitManifest(
            {
                aiCategories: plan.aiCategories,
                existingCategories: plan.existingCategories,
                decisions: plan.decisions
            },
            {
                catalogId: plan.catalogId,
                newCatalogName: null,
                displayName: plan.catalogName
            },
            plan.createCount + plan.reuseCount
        );
    }, [tenantId, submitManifest]);

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
        importNewCatalog,
        tenantId,
        importMode,
        setImportMode,
        initialCatalogId,
        initialCatalogName,
        existingImportPlan,
        setExistingImportPlan,
        importIntoExistingCatalog,
        importRefreshKey
    };
}
