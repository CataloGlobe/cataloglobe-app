import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/context/Toast/ToastContext";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    type V2Product,
    type ProductNote,
    updateProduct
} from "@/services/supabase/products";
import { uploadProductImage } from "@/services/supabase/upload";
import type { MediaFraming } from "@components/ui/ImageReframeEditor/types";
import {
    type V2SystemAllergen,
    listAllergens,
    getProductAllergens,
    setProductAllergens
} from "@/services/supabase/allergens";
import {
    type V2Ingredient,
    listIngredients,
    getProductIngredients,
    setProductIngredients,
    createIngredient
} from "@/services/supabase/ingredients";
import {
    listCharacteristics,
    getProductCharacteristics,
    setProductCharacteristics
} from "@/services/supabase/productCharacteristics";
import type { ProductCharacteristic } from "@/types/productCharacteristic";
import {
    listPairings,
    savePairings
} from "@/services/supabase/productPairings";
import type { PairingDraftItem } from "../components/PairingsSection/PairingsSection";

function arraysEqualUnordered<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    return b.every(v => set.has(v));
}

/**
 * Draft a livello pagina per la tab Scheda — sollevato da `SchedaTab` così
 * sopravvive allo smontaggio del componente al cambio tab (mount condizionale
 * in `ProductPage`). I load girano una sola volta al mount della pagina, non
 * a ogni rientro nel tab Scheda — evita la race che cancellerebbe un draft
 * sporco con un refetch.
 *
 * Gruppi prodotto NON è qui: resta locale a `SchedaTab` (read-only + drawer
 * autonomo, nessun draft/dirty da perdere al cambio tab).
 */
export function useSchedaDraft(
    product: V2Product | null,
    productId: string,
    tenantId: string,
    onProductUpdated: (updated: V2Product) => void,
    vertical?: string
) {
    const { showToast } = useToast();
    const { t } = useTranslation("admin");
    const wakeTranslations = useBusinessOutletContext()?.wakeTranslations;
    const verticalConfig = useVerticalConfig();
    // `product` è null finché `ProductPage` non ha completato il load iniziale.
    // Le sotto-sezioni restano nascoste/vuote fino ad allora e si
    // risincronizzano da sole via i resync-effect sotto (stesso pattern
    // self-healing di StoryDetailPage), non serve un guard esplicito qui.
    const isBaseProduct = product?.parent_product_id === null;

    const showAllergens = verticalConfig.productSections.allergens;
    const showIngredients = verticalConfig.productSections.ingredients;
    const showCharacteristics =
        verticalConfig.productSections.characteristics && isBaseProduct;
    const showNotes = verticalConfig.productSections.notes && isBaseProduct;
    const showPairings = verticalConfig.productSections.pairings && isBaseProduct;

    // `product` è null finché il load iniziale non completa in `ProductPage`
    // (l'hook è montato PRIMA di quel load). I draft nascono vuoti e i
    // resync-effect sotto li allineano al prodotto reale non appena arriva —
    // ma quel resync è normalmente guardato da "non dirty" per non calpestare
    // modifiche in corso quando `product` cambia per un salvataggio di
    // un'ALTRA sezione. Sulla primissima transizione null→caricato il draft
    // vuoto risulta "dirty" per definizione (confrontato col prodotto appena
    // arrivato): il guard bloccherebbe per sempre l'idratazione iniziale.
    // Ogni resync-effect tiene un proprio ref "già idratato almeno una
    // volta" — letto E scritto DENTRO l'effect stesso (mai durante il
    // render: StrictMode double-invoca il render in dev e un ref mutato lì
    // verrebbe consumato dalla prima invocazione, rompendo il bypass sulla
    // seconda — già capitato, vedi commit precedente).
    const hasHydratedImageRef = useRef(false);
    const hasHydratedInformationRef = useRef(false);
    const hasHydratedNotesRef = useRef(false);

    // ── Immagine ─────────────────────────────────────────────────────────
    const [draftImageUrl, setDraftImageUrl] = useState<string | null>(product?.image_url ?? null);
    const [savedImageUrl, setSavedImageUrl] = useState<string | null>(product?.image_url ?? null);
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);
    const [isSavingImage, setIsSavingImage] = useState(false);
    // Framing metadata (non baked): pending settato dall'editor insieme al file
    // (o da solo in ri-inquadratura di un'immagine esistente). null = nessuna
    // modifica pendente di framing.
    const [pendingFraming, setPendingFraming] = useState<MediaFraming | null>(null);
    const [pendingAspectRatio, setPendingAspectRatio] = useState<number | null>(null);
    const [savedFraming, setSavedFraming] = useState<MediaFraming | null>(
        product?.image_framing ?? null
    );
    const [savedAspectRatio, setSavedAspectRatio] = useState<number | null>(
        product?.image_aspect_ratio ?? null
    );

    const pendingImagePreviewUrl = useMemo(() => {
        if (!pendingImageFile) return null;
        return URL.createObjectURL(pendingImageFile);
    }, [pendingImageFile]);

    useEffect(() => {
        if (!pendingImagePreviewUrl) return;
        return () => {
            URL.revokeObjectURL(pendingImagePreviewUrl);
        };
    }, [pendingImagePreviewUrl]);

    const visibleImageUrl: string | null = removeImage
        ? null
        : pendingImagePreviewUrl ?? savedImageUrl;

    const isImageDirty = useMemo(
        () =>
            pendingImageFile !== null ||
            removeImage ||
            pendingFraming !== null ||
            draftImageUrl !== savedImageUrl,
        [pendingImageFile, removeImage, pendingFraming, draftImageUrl, savedImageUrl]
    );

    useEffect(() => {
        if (!product) return;
        const isFirstSync = !hasHydratedImageRef.current;
        hasHydratedImageRef.current = true;
        if (!isFirstSync && isImageDirty) return;
        const url = product.image_url ?? null;
        setDraftImageUrl(url);
        setSavedImageUrl(url);
        setPendingImageFile(null);
        setRemoveImage(false);
        setPendingFraming(null);
        setPendingAspectRatio(null);
        setSavedFraming(product.image_framing ?? null);
        setSavedAspectRatio(product.image_aspect_ratio ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product?.image_url]);

    const handleCancelImage = useCallback(() => {
        setDraftImageUrl(savedImageUrl);
        setPendingImageFile(null);
        setRemoveImage(false);
        setPendingFraming(null);
        setPendingAspectRatio(null);
    }, [savedImageUrl]);

    const handleSaveImage = useCallback(async () => {
        try {
            setIsSavingImage(true);
            let nextUrl: string | null = draftImageUrl;
            let nextFraming: MediaFraming | null = savedFraming;
            let nextAspectRatio: number | null = savedAspectRatio;
            if (removeImage) {
                nextUrl = null;
                nextFraming = null;
                nextAspectRatio = null;
            } else if (pendingImageFile) {
                // File già compresso dall'editor (ImageUploadEditor): nessun
                // re-compress qui.
                nextUrl = await uploadProductImage(tenantId, productId, pendingImageFile);
                nextFraming = pendingFraming;
                nextAspectRatio = pendingAspectRatio;
            } else if (pendingFraming) {
                // Ri-inquadratura di un'immagine esistente: solo framing, URL e
                // ratio naturale invariati.
                nextFraming = pendingFraming;
            }
            const updated = await updateProduct(productId, tenantId, {
                image_url: nextUrl,
                image_framing: nextFraming,
                image_aspect_ratio: nextAspectRatio
            });
            onProductUpdated(updated);
            setDraftImageUrl(nextUrl);
            setSavedImageUrl(nextUrl);
            setSavedFraming(nextFraming);
            setSavedAspectRatio(nextAspectRatio);
            setPendingImageFile(null);
            setRemoveImage(false);
            setPendingFraming(null);
            setPendingAspectRatio(null);
            return true;
        } catch {
            return false;
        } finally {
            setIsSavingImage(false);
        }
    }, [
        draftImageUrl,
        pendingImageFile,
        removeImage,
        pendingFraming,
        pendingAspectRatio,
        savedFraming,
        savedAspectRatio,
        productId,
        tenantId,
        onProductUpdated
    ]);

    // ── Informazioni (nome + descrizione) ───────────────────────────────
    const [draftName, setDraftName] = useState(product?.name ?? "");
    const [draftDescription, setDraftDescription] = useState(product?.description ?? "");
    const [isSavingInformation, setIsSavingInformation] = useState(false);

    const isInformationDirty = useMemo(() => {
        const baseName = product?.name ?? "";
        const baseDesc = product?.description ?? "";
        return (
            draftName.trim() !== baseName.trim() ||
            draftDescription.trim() !== baseDesc.trim()
        );
    }, [draftName, draftDescription, product?.name, product?.description]);

    useEffect(() => {
        if (!product) return;
        const isFirstSync = !hasHydratedInformationRef.current;
        hasHydratedInformationRef.current = true;
        if (!isFirstSync && isInformationDirty) return;
        setDraftName(product.name);
        setDraftDescription(product.description ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product?.name, product?.description]);

    const handleCancelInformation = useCallback(() => {
        setDraftName(product?.name ?? "");
        setDraftDescription(product?.description ?? "");
    }, [product]);

    const handleSaveInformation = useCallback(async () => {
        const trimmedName = draftName.trim();
        if (!trimmedName) {
            return false;
        }
        try {
            setIsSavingInformation(true);
            const updated = await updateProduct(productId, tenantId, {
                name: trimmedName,
                description: draftDescription.trim() || null
            });
            onProductUpdated(updated);
            // Notifica orthogonal (coda traduzioni), non un esito di
            // salvataggio: resta anche sotto orchestrazione aggregata.
            if (updated.queuedLanguages >= 1) {
                showToast({
                    message: t("translations_tab.toast_updating", { count: updated.queuedLanguages }),
                    type: "info"
                });
                wakeTranslations?.();
            }
            return true;
        } catch {
            return false;
        } finally {
            setIsSavingInformation(false);
        }
    }, [draftName, draftDescription, productId, tenantId, onProductUpdated, showToast, t, wakeTranslations]);

    // ── Allergeni ────────────────────────────────────────────────────────
    const [allergens, setAllergens] = useState<V2SystemAllergen[]>([]);
    const [draftAllergenIds, setDraftAllergenIds] = useState<number[]>([]);
    const [savedAllergenIds, setSavedAllergenIds] = useState<number[]>([]);
    const [allergensLoading, setAllergensLoading] = useState(true);
    const [isSavingAllergens, setIsSavingAllergens] = useState(false);

    const isAllergensDirty = useMemo(
        () => !arraysEqualUnordered(draftAllergenIds, savedAllergenIds),
        [draftAllergenIds, savedAllergenIds]
    );

    const loadAllergens = useCallback(async () => {
        if (!showAllergens || !productId || !tenantId) return;
        try {
            setAllergensLoading(true);
            const [list, productIds] = await Promise.all([
                listAllergens(),
                getProductAllergens(productId, tenantId)
            ]);
            setAllergens(list);
            setDraftAllergenIds(productIds);
            setSavedAllergenIds(productIds);
        } catch {
            showToast({ message: "Errore nel caricamento degli allergeni", type: "error" });
        } finally {
            setAllergensLoading(false);
        }
    }, [productId, tenantId, showAllergens, showToast]);

    useEffect(() => {
        loadAllergens();
    }, [loadAllergens]);

    const toggleAllergen = useCallback((id: number) => {
        setDraftAllergenIds(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        );
    }, []);

    const handleCancelAllergens = useCallback(() => {
        setDraftAllergenIds(savedAllergenIds);
    }, [savedAllergenIds]);

    const handleSaveAllergens = useCallback(async () => {
        try {
            setIsSavingAllergens(true);
            await setProductAllergens(tenantId, productId, draftAllergenIds);
            setSavedAllergenIds(draftAllergenIds);
            return true;
        } catch {
            return false;
        } finally {
            setIsSavingAllergens(false);
        }
    }, [tenantId, productId, draftAllergenIds]);

    // ── Ingredienti ──────────────────────────────────────────────────────
    const [allIngredients, setAllIngredients] = useState<V2Ingredient[]>([]);
    const [draftIngredientIds, setDraftIngredientIds] = useState<string[]>([]);
    const [savedIngredientIds, setSavedIngredientIds] = useState<string[]>([]);
    const [ingredientsLoading, setIngredientsLoading] = useState(true);
    const [isSavingIngredients, setIsSavingIngredients] = useState(false);

    const isIngredientsDirty = useMemo(
        () => !arraysEqualUnordered(draftIngredientIds, savedIngredientIds),
        [draftIngredientIds, savedIngredientIds]
    );

    const loadIngredients = useCallback(async () => {
        if (!showIngredients || !productId || !tenantId) return;
        try {
            setIngredientsLoading(true);
            const [list, productIngs] = await Promise.all([
                listIngredients(tenantId),
                getProductIngredients(productId)
            ]);
            setAllIngredients(list);
            const ids = productIngs.map(i => i.ingredient_id);
            setDraftIngredientIds(ids);
            setSavedIngredientIds(ids);
        } catch {
            showToast({ message: "Errore nel caricamento degli ingredienti", type: "error" });
        } finally {
            setIngredientsLoading(false);
        }
    }, [productId, tenantId, showIngredients, showToast]);

    useEffect(() => {
        loadIngredients();
    }, [loadIngredients]);

    const toggleIngredient = useCallback((id: string) => {
        setDraftIngredientIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }, []);

    const handleCreateIngredient = useCallback(
        async (name: string): Promise<string> => {
            const newIngredient = await createIngredient(tenantId, name);
            setAllIngredients(prev => [...prev, newIngredient]);
            return newIngredient.id;
        },
        [tenantId]
    );

    const handleCancelIngredients = useCallback(() => {
        setDraftIngredientIds(savedIngredientIds);
    }, [savedIngredientIds]);

    const handleSaveIngredients = useCallback(async () => {
        try {
            setIsSavingIngredients(true);
            await setProductIngredients(tenantId, productId, draftIngredientIds);
            setSavedIngredientIds(draftIngredientIds);
            return true;
        } catch {
            return false;
        } finally {
            setIsSavingIngredients(false);
        }
    }, [tenantId, productId, draftIngredientIds]);

    // ── Caratteristiche ──────────────────────────────────────────────────
    const [characteristicsAvailable, setCharacteristicsAvailable] = useState<ProductCharacteristic[]>([]);
    const [draftCharacteristicIds, setDraftCharacteristicIds] = useState<string[]>([]);
    const [savedCharacteristicIds, setSavedCharacteristicIds] = useState<string[]>([]);
    const [characteristicsLoading, setCharacteristicsLoading] = useState(true);
    const [isSavingCharacteristics, setIsSavingCharacteristics] = useState(false);

    const isCharacteristicsDirty = useMemo(
        () => !arraysEqualUnordered(draftCharacteristicIds, savedCharacteristicIds),
        [draftCharacteristicIds, savedCharacteristicIds]
    );

    const loadCharacteristics = useCallback(async () => {
        if (!showCharacteristics || !productId || !tenantId) return;
        try {
            setCharacteristicsLoading(true);
            const [available, ids] = await Promise.all([
                listCharacteristics(vertical),
                getProductCharacteristics(productId, tenantId)
            ]);
            setCharacteristicsAvailable(available);
            setDraftCharacteristicIds(ids);
            setSavedCharacteristicIds(ids);
        } catch {
            showToast({ message: "Errore nel caricamento delle caratteristiche", type: "error" });
        } finally {
            setCharacteristicsLoading(false);
        }
    }, [productId, tenantId, showCharacteristics, vertical, showToast]);

    useEffect(() => {
        loadCharacteristics();
    }, [loadCharacteristics]);

    const handleCancelCharacteristics = useCallback(() => {
        setDraftCharacteristicIds(savedCharacteristicIds);
    }, [savedCharacteristicIds]);

    const handleSaveCharacteristics = useCallback(async () => {
        try {
            setIsSavingCharacteristics(true);
            await setProductCharacteristics(tenantId, productId, draftCharacteristicIds);
            setSavedCharacteristicIds(draftCharacteristicIds);
            return true;
        } catch {
            return false;
        } finally {
            setIsSavingCharacteristics(false);
        }
    }, [tenantId, productId, draftCharacteristicIds]);

    // ── Abbinamenti ──────────────────────────────────────────────────────
    const [draftPairings, setDraftPairings] = useState<PairingDraftItem[]>([]);
    const [savedPairings, setSavedPairings] = useState<PairingDraftItem[]>([]);
    const [pairingsLoading, setPairingsLoading] = useState(true);
    const [isSavingPairings, setIsSavingPairings] = useState(false);

    const isPairingsDirty = useMemo(() => {
        const shape = (items: PairingDraftItem[]) =>
            JSON.stringify(items.map(p => ({ id: p.pairedProductId, note: p.note.trim() })));
        return shape(draftPairings) !== shape(savedPairings);
    }, [draftPairings, savedPairings]);

    const loadPairings = useCallback(async () => {
        if (!showPairings || !productId || !tenantId) return;
        try {
            setPairingsLoading(true);
            const rows = await listPairings(productId, tenantId);
            const mapped: PairingDraftItem[] = rows.map(r => ({
                pairedProductId: r.pairedProductId,
                pairedProductName: r.pairedProductName,
                pairedProductImageUrl: r.pairedProductImageUrl,
                note: r.note ?? ""
            }));
            setDraftPairings(mapped);
            setSavedPairings(mapped);
        } catch {
            showToast({ message: "Errore nel caricamento degli abbinamenti", type: "error" });
        } finally {
            setPairingsLoading(false);
        }
    }, [productId, tenantId, showPairings, showToast]);

    useEffect(() => {
        loadPairings();
    }, [loadPairings]);

    const handleCancelPairings = useCallback(() => {
        setDraftPairings(savedPairings);
    }, [savedPairings]);

    const handleSavePairings = useCallback(async () => {
        try {
            setIsSavingPairings(true);
            await savePairings(
                tenantId,
                productId,
                draftPairings.map((p, idx) => ({
                    pairedProductId: p.pairedProductId,
                    note: p.note.trim() || null,
                    sortOrder: idx
                }))
            );
            const normalized = draftPairings.map(p => ({ ...p, note: p.note.trim() }));
            setDraftPairings(normalized);
            setSavedPairings(normalized);
            return true;
        } catch {
            return false;
        } finally {
            setIsSavingPairings(false);
        }
    }, [tenantId, productId, draftPairings]);

    // ── Note prodotto ────────────────────────────────────────────────────
    const [draftNotes, setDraftNotes] = useState<ProductNote[]>(product?.notes ?? []);
    const [savedNotes, setSavedNotes] = useState<ProductNote[]>(product?.notes ?? []);
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    const isNotesDirty = useMemo(
        () => JSON.stringify(draftNotes) !== JSON.stringify(savedNotes),
        [draftNotes, savedNotes]
    );

    useEffect(() => {
        if (!product) return;
        const isFirstSync = !hasHydratedNotesRef.current;
        hasHydratedNotesRef.current = true;
        if (!isFirstSync && isNotesDirty) return;
        const current = product.notes ?? [];
        setDraftNotes(current);
        setSavedNotes(current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product?.notes]);

    const handleCancelNotes = useCallback(() => {
        setDraftNotes(savedNotes);
    }, [savedNotes]);

    const handleSaveNotes = useCallback(async () => {
        try {
            setIsSavingNotes(true);
            const updated = await updateProduct(productId, tenantId, {
                notes: draftNotes
            });
            setDraftNotes(updated.notes);
            setSavedNotes(updated.notes);
            onProductUpdated(updated);
            return true;
        } catch {
            return false;
        } finally {
            setIsSavingNotes(false);
        }
    }, [productId, tenantId, draftNotes, onProductUpdated]);

    // ── Dirty aggregato + salvataggio/annulla unico ────────────────────
    // Etichette per il toast di fallimento parziale (B3) — nomi visibili
    // all'utente, non chiavi tecniche.
    const SECTION_LABELS = {
        image: "Immagine",
        information: "Informazioni",
        allergens: "Allergeni",
        ingredients: "Ingredienti",
        characteristics: "Caratteristiche",
        pairings: "Abbinamenti",
        notes: "Note prodotto"
    } as const;

    const dirty = useMemo(
        () => ({
            image: isImageDirty,
            information: isInformationDirty,
            allergens: isAllergensDirty,
            ingredients: isIngredientsDirty,
            characteristics: isCharacteristicsDirty,
            pairings: isPairingsDirty,
            notes: isNotesDirty
        }),
        [
            isImageDirty,
            isInformationDirty,
            isAllergensDirty,
            isIngredientsDirty,
            isCharacteristicsDirty,
            isPairingsDirty,
            isNotesDirty
        ]
    );

    const isDirty = useMemo(() => Object.values(dirty).some(Boolean), [dirty]);

    const [isSavingAll, setIsSavingAll] = useState(false);

    // Chiama SOLO gli handler delle sezioni dirty, in parallelo. Ogni handler
    // esistente inghiotte già il proprio errore (mostra il suo toast, ritorna
    // false) — mai reject, quindi `Promise.all` basta: non serve `allSettled`.
    // Sezioni Prezzo/Varianti/Opzioni extra restano CRUD immediato, fuori da
    // questo draft (Task 3.2, fuori scope PrezziOpzioniTab).
    // Immagine/Informazioni/Note NON sono accorpate in una singola
    // `updateProduct`: la logica di upload immagine (compress+upload prima
    // di poter comporre il payload) rende la fusione rischiosa per un
    // beneficio che i criteri di accettazione non richiedono (testano
    // sezioni su tabelle diverse, non piu' campi-prodotto insieme) — vedi
    // segnalazione esplicita nel report del task.
    const handleSaveAll = useCallback(async () => {
        if (isSavingAll) return;
        const tasks: Array<{ key: keyof typeof SECTION_LABELS; run: () => Promise<boolean> }> = [];
        if (isImageDirty) tasks.push({ key: "image", run: handleSaveImage });
        if (isInformationDirty) tasks.push({ key: "information", run: handleSaveInformation });
        if (isAllergensDirty) tasks.push({ key: "allergens", run: handleSaveAllergens });
        if (isIngredientsDirty) tasks.push({ key: "ingredients", run: handleSaveIngredients });
        if (isCharacteristicsDirty) tasks.push({ key: "characteristics", run: handleSaveCharacteristics });
        if (isPairingsDirty) tasks.push({ key: "pairings", run: handleSavePairings });
        if (isNotesDirty) tasks.push({ key: "notes", run: handleSaveNotes });

        if (tasks.length === 0) return;

        setIsSavingAll(true);
        try {
            const results = await Promise.all(tasks.map(task => task.run()));
            const failedLabels = tasks
                .filter((_, idx) => !results[idx])
                .map(task => SECTION_LABELS[task.key]);

            if (failedLabels.length > 0) {
                showToast({
                    message: `Non è stato possibile salvare: ${failedLabels.join(", ")}`,
                    type: "error"
                });
            } else {
                showToast({ message: "Modifiche salvate", type: "success" });
            }
        } finally {
            setIsSavingAll(false);
        }
    }, [
        isSavingAll,
        isImageDirty,
        isInformationDirty,
        isAllergensDirty,
        isIngredientsDirty,
        isCharacteristicsDirty,
        isPairingsDirty,
        isNotesDirty,
        handleSaveImage,
        handleSaveInformation,
        handleSaveAllergens,
        handleSaveIngredients,
        handleSaveCharacteristics,
        handleSavePairings,
        handleSaveNotes,
        showToast
    ]);

    const handleDiscardAll = useCallback(() => {
        handleCancelImage();
        handleCancelInformation();
        handleCancelAllergens();
        handleCancelIngredients();
        handleCancelCharacteristics();
        handleCancelPairings();
        handleCancelNotes();
    }, [
        handleCancelImage,
        handleCancelInformation,
        handleCancelAllergens,
        handleCancelIngredients,
        handleCancelCharacteristics,
        handleCancelPairings,
        handleCancelNotes
    ]);

    return {
        image: {
            visibleImageUrl,
            pendingImageFile,
            setPendingImageFile,
            removeImage,
            setRemoveImage,
            savedFraming,
            savedAspectRatio,
            setPendingFraming,
            setPendingAspectRatio,
            isSaving: isSavingImage,
            isDirty: isImageDirty,
            handleCancel: handleCancelImage,
            handleSave: handleSaveImage
        },
        information: {
            draftName,
            setDraftName,
            draftDescription,
            setDraftDescription,
            isSaving: isSavingInformation,
            isDirty: isInformationDirty,
            handleCancel: handleCancelInformation,
            handleSave: handleSaveInformation
        },
        allergens: {
            available: allergens,
            draftIds: draftAllergenIds,
            setDraftIds: setDraftAllergenIds,
            loading: allergensLoading,
            isSaving: isSavingAllergens,
            isDirty: isAllergensDirty,
            toggle: toggleAllergen,
            handleCancel: handleCancelAllergens,
            handleSave: handleSaveAllergens
        },
        ingredients: {
            available: allIngredients,
            draftIds: draftIngredientIds,
            loading: ingredientsLoading,
            isSaving: isSavingIngredients,
            isDirty: isIngredientsDirty,
            toggle: toggleIngredient,
            handleCreate: handleCreateIngredient,
            handleCancel: handleCancelIngredients,
            handleSave: handleSaveIngredients
        },
        characteristics: {
            available: characteristicsAvailable,
            draftIds: draftCharacteristicIds,
            setDraftIds: setDraftCharacteristicIds,
            loading: characteristicsLoading,
            isSaving: isSavingCharacteristics,
            isDirty: isCharacteristicsDirty,
            handleCancel: handleCancelCharacteristics,
            handleSave: handleSaveCharacteristics
        },
        pairings: {
            draft: draftPairings,
            setDraft: setDraftPairings,
            loading: pairingsLoading,
            isSaving: isSavingPairings,
            isDirty: isPairingsDirty,
            handleCancel: handleCancelPairings,
            handleSave: handleSavePairings
        },
        notes: {
            draft: draftNotes,
            setDraft: setDraftNotes,
            isSaving: isSavingNotes,
            isDirty: isNotesDirty,
            handleCancel: handleCancelNotes,
            handleSave: handleSaveNotes
        },
        showAllergens,
        showIngredients,
        showCharacteristics,
        showNotes,
        showPairings,
        dirty,
        isDirty,
        isSavingAll,
        handleSaveAll,
        handleDiscardAll
    };
}

export type SchedaDraft = ReturnType<typeof useSchedaDraft>;
