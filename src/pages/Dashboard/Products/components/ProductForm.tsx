import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { createProduct, updateProduct, V2Product, ProductType } from "@/services/supabase/products";
import { uploadProductImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import { FileInput } from "@/components/ui/Input/FileInput";
import { listAllergens, setProductAllergens, V2SystemAllergen } from "@/services/supabase/allergens";
import { getProductGroupAssignments, getProductGroups, assignProductToGroup } from "@/services/supabase/productGroups";
import {
    getIngredients,
    setProductIngredients,
    createIngredient,
    V2Ingredient
} from "@/services/supabase/ingredients";
import { createProductOptionGroup, createOptionValue } from "@/services/supabase/productOptions";
import { Chip } from "@/components/ui/Chip/Chip";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { formatPrice } from "@/utils/formatCurrency";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useAiDescription } from "../hooks/useAiDescription";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { AiDescriptionField } from "./AiDescriptionField";
import styles from "./ProductForm.module.scss";
import { IngredientCombobox } from "./IngredientCombobox";

/** Il form crea soltanto: un prodotto si modifica nella sua pagina (§50.9/5). */
export type ProductFormMode = "create_base" | "create_variant";

export interface ProductFormProps {
    mode: ProductFormMode;
    parentProduct?: V2Product | null;
    tenantId: string | null;
    onSuccess: (savedProduct?: V2Product) => void | Promise<void>;
    onSavingChange?: (isSaving: boolean) => void;
    formId?: string;
    skipAutoNavigate?: boolean;
}

type DraftFormat = {
    id: string;
    name: string;
    absolute_price: number;
};

const makeDraftId = () => `draft-${Math.random().toString(36).slice(2, 10)}`;

type PriceMode = "inherit" | "single" | "formats";

const PRICE_MODE_OPTIONS: { value: PriceMode; label: string }[] = [
    { value: "single", label: "Prezzo singolo" },
    { value: "formats", label: "Prezzi per formato" }
];

const VARIANT_PRICE_MODE_OPTIONS: { value: PriceMode; label: string }[] = [
    { value: "inherit", label: "Eredita" },
    { value: "single", label: "Prezzo singolo" },
    { value: "formats", label: "Formati" }
];

export function ProductForm({
    mode,
    parentProduct,
    tenantId,
    onSuccess,
    onSavingChange,
    formId = "product-form",
    skipAutoNavigate = false
}: ProductFormProps) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const verticalConfig = useVerticalConfig();

    const nameInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus name field on create
    useEffect(() => {
        const timer = setTimeout(() => nameInputRef.current?.focus(), 80);
        return () => clearTimeout(timer);
    }, []);

    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    // AI description enrichment — shared affordance (hook + AiDescriptionField).
    const businessOutlet = useBusinessOutletContext();
    const ai = useAiDescription({
        name,
        tenantId,
        onDescriptionGenerated: setDescription,
        onConsumed: businessOutlet?.refreshAiUsage
    });
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [basePrice, setBasePrice] = useState<string>("");
    const [basePriceError, setBasePriceError] = useState<string | undefined>();
    const [priceMode, setPriceMode] = useState<PriceMode>("single");
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Allergens state
    const [systemAllergens, setSystemAllergens] = useState<V2SystemAllergen[]>([]);
    const [selectedAllergens, setSelectedAllergens] = useState<number[]>([]);
    const [isLoadingAllergens, setIsLoadingAllergens] = useState(false);
    const [allergenSearchQuery, setAllergenSearchQuery] = useState("");

    // Groups state: una variante entra nei gruppi del padre, e il form lo dice (r.4).
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [parentGroupNames, setParentGroupNames] = useState<string[]>([]);

    // Ingredients state
    const [systemIngredients, setSystemIngredients] = useState<V2Ingredient[]>([]);
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [isLoadingIngredients, setIsLoadingIngredients] = useState(false);

    // For creating PRIMARY_PRICE format
    const [newFormatName, setNewFormatName] = useState("");
    const [newFormatPrice, setNewFormatPrice] = useState("");

    const [hasFormatPricing, setHasFormatPricing] = useState(false);
    const [draftFormats, setDraftFormats] = useState<DraftFormat[]>([]);

    useEffect(() => {
        onSavingChange?.(isSaving);
    }, [isSaving, onSavingChange]);

    useEffect(() => {
        setIsSaving(false);

        // Reset all search queries
        setAllergenSearchQuery("");

        // Reset options state
        setNewFormatName("");
        setNewFormatPrice("");
        setDraftFormats([]);
        setPendingImageFile(null);
        setSelectedAllergens([]);
        setSelectedIngredients([]);
        setParentGroupNames([]);

        if (mode === "create_variant" && parentProduct) {
            setName(parentProduct.name);
            setDescription(parentProduct.description || "");
            setBasePrice("");
            setPriceMode("inherit");
            setSubmitError(null);
        } else {
            setName("");
            setDescription("");
            setBasePrice("");
            setPriceMode("single");
            setSubmitError(null);
        }

        // Load Allergens & Groups & Ingredients
        if (tenantId) {
            loadAllergens();
            loadGroups();
            loadIngredients();
        }
    }, [mode, parentProduct, tenantId]);

    const loadAllergens = async () => {
        setIsLoadingAllergens(true);
        try {
            const allAllergens = await listAllergens();
            setSystemAllergens(allAllergens);
        } catch (error) {
            console.error("Errore nel caricamento degli allergeni:", error);
            showToast({ message: "Non è stato possibile caricare gli allergeni.", type: "error" });
        } finally {
            setIsLoadingAllergens(false);
        }
    };

    const loadGroups = async () => {
        if (!tenantId) return;
        try {

            if (mode === "create_variant" && parentProduct) {
                const [assignedGroups, groups] = await Promise.all([
                    getProductGroupAssignments(parentProduct.id),
                    getProductGroups(tenantId)
                ]);
                const assignedIds = assignedGroups.map(g => g.group_id);
                setSelectedGroups(assignedIds);
                setParentGroupNames(groups.filter(g => assignedIds.includes(g.id)).map(g => g.name));
            } else {
                setSelectedGroups([]);
                setParentGroupNames([]);
            }
        } catch (error) {
            console.error("Errore nel caricamento dei gruppi:", error);
            showToast({
                message: "Non è stato possibile caricare i gruppi prodotto.",
                type: "error"
            });
        }
    };

    const loadIngredients = async () => {
        if (!tenantId) return;
        setIsLoadingIngredients(true);
        try {
            const allIngredients = await getIngredients(tenantId);
            setSystemIngredients(allIngredients);
        } catch (error) {
            console.error("Errore nel caricamento degli ingredienti:", error);
            showToast({
                message: "Non è stato possibile caricare gli ingredienti.",
                type: "error"
            });
        } finally {
            setIsLoadingIngredients(false);
        }
    };

    const handleAllergenToggle = (allergenId: number) => {
        setSelectedAllergens(prev =>
            prev.includes(allergenId) ? prev.filter(id => id !== allergenId) : [...prev, allergenId]
        );
    };

    const handleIngredientToggle = (ingredientId: string) => {
        setSelectedIngredients(prev =>
            prev.includes(ingredientId)
                ? prev.filter(id => id !== ingredientId)
                : [...prev, ingredientId]
        );
    };

    const handleCreateIngredientInline = async (name: string): Promise<string> => {
        if (!tenantId) throw new Error("Tenant mancante");
        const newIngredient = await createIngredient(tenantId, name);
        setSystemIngredients(prev =>
            [...prev, newIngredient].sort((a, b) => a.name.localeCompare(b.name))
        );
        showToast({ message: "Ingrediente creato con successo.", type: "success" });
        return newIngredient.id;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setSubmitError(null);

        if (!name.trim()) {
            showToast({ message: `Il nome del ${verticalConfig.productLabel.toLowerCase()} è obbligatorio.`, type: "error" });
            return;
        }

        const shouldUseBasePrice = !hasFormatPricing;
        const price = shouldUseBasePrice && basePrice.trim() !== "" ? parseFloat(basePrice) : null;
        if (price !== null && isNaN(price)) {
            showToast({ message: "Il prezzo inserito non è valido.", type: "error" });
            return;
        }
        // Il form è noValidate: min="0" e step="0.01" li controlliamo qui.
        // Decimali contati sul testo: 0.07 * 100 in virgola mobile non è 7.
        if (price !== null && (price < 0 || (basePrice.trim().split(".")[1] ?? "").length > 2)) {
            setBasePriceError(price < 0 ? "Il prezzo non può essere negativo." : "Al massimo due decimali.");
            return;
        }

        if (priceMode === "formats" && draftFormats.length === 0) {
            setSubmitError("Aggiungi almeno un formato prima di creare.");
            return;
        }

        setIsSaving(true);
        try {
            if (!tenantId) throw new Error("Tenant ID mancante");
            const parentId = mode === "create_variant" && parentProduct ? parentProduct.id : null;
            const resolvedProductType: ProductType = priceMode === "formats" ? "formats" : "simple";
            const newProduct = await createProduct(
                tenantId,
                {
                    name,
                    description: description || null,
                    base_price: priceMode !== "formats" ? price : null,
                    image_url: null,
                    product_type: resolvedProductType
                },
                parentId
            );
            const savedProductId = newProduct.id;
            let savedProduct: V2Product = newProduct;

            // Da qui il prodotto esiste: un errore non lo ricrea mai (r.1). Quello
            // che non si salva si raccoglie in un avviso solo e si completa
            // dalla pagina del prodotto (r.10).
            const notSaved: string[] = [];

            if (pendingImageFile) {
                try {
                    const imageUrl = await uploadProductImage(tenantId, newProduct.id, await compressImage(pendingImageFile, COMPRESS_PROFILES.product));
                    savedProduct = await updateProduct(newProduct.id, tenantId, { image_url: imageUrl });
                } catch (imageError) {
                    console.error("Errore caricamento immagine:", imageError);
                    notSaved.push("immagine");
                }
            }

            if (hasFormatPricing && draftFormats.length > 0) {
                try {
                    const newPrimaryGroup = await createProductOptionGroup({
                        tenant_id: tenantId,
                        product_id: savedProductId,
                        name: "Formato",
                        is_required: true,
                        max_selectable: 1,
                        group_kind: "PRIMARY_PRICE",
                        pricing_mode: "ABSOLUTE"
                    });
                    for (const format of draftFormats) {
                        await createOptionValue({
                            tenant_id: tenantId,
                            option_group_id: newPrimaryGroup.id,
                            name: format.name,
                            price_modifier: null,
                            absolute_price: format.absolute_price
                        });
                    }
                } catch (formatError) {
                    console.error("Errore salvataggio formati:", formatError);
                    notSaved.push("formati");
                }
            }

            try {
                await setProductAllergens(tenantId, savedProductId, selectedAllergens);
            } catch (allergenError) {
                console.error("Errore salvataggio allergeni:", allergenError);
                notSaved.push("allergeni");
            }

            try {
                for (const groupId of selectedGroups) {
                    await assignProductToGroup({ productId: savedProductId, groupId, tenantId });
                }
            } catch (groupError) {
                console.error("Errore associazione gruppi:", groupError);
                notSaved.push("gruppi");
            }

            try {
                await setProductIngredients(tenantId, savedProductId, selectedIngredients);
            } catch (ingredientError) {
                console.error("Errore salvataggio ingredienti:", ingredientError);
                notSaved.push("ingredienti");
            }

            if (notSaved.length > 0) {
                const created = mode === "create_variant" ? "Variante creata" : `${verticalConfig.productLabel} creato`;
                showToast({
                    message: `${created}. Non salvati: ${notSaved.join(", ")}. Completali dalla sua pagina.`,
                    type: "warning"
                });
            }

            // Dopo la creazione si apre la pagina del prodotto, sui prezzi.
            if (!skipAutoNavigate) {
                navigate(`/business/${tenantId}/products/${savedProductId}?tab=pricing`);
            }

            await Promise.resolve(onSuccess(savedProduct));
        } catch (error: unknown) {
            console.error("Errore salvataggio prodotto:", error);
            showToast({
                message:
                    error instanceof Error && error.message
                        ? error.message
                        : `Impossibile salvare il ${verticalConfig.productLabel.toLowerCase()}.`,
                type: "error"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const productLower = verticalConfig.productLabel.toLowerCase();
    const showAllergens =
        verticalConfig.productSections.allergens && (isLoadingAllergens || systemAllergens.length > 0);
    const showIngredients = verticalConfig.productSections.ingredients;

    return (
        <form noValidate id={formId} className={styles.form} onSubmit={handleSubmit}>
            {mode === "create_variant" && parentProduct && (
                <Text variant="body-sm" colorVariant="muted">
                    Variante di <strong className={styles.strong}>{parentProduct.name}</strong>
                </Text>
            )}
            {mode === "create_variant" && parentGroupNames.length > 0 && (
                <Text variant="body-sm" colorVariant="muted">
                    Entra nei gruppi del padre: {parentGroupNames.join(", ")}.
                </Text>
            )}
            {/* ── Informazioni ──────────────────────────────────────── */}
            <section className={styles.section}>
                <Text as="h3" variant="title-sm" weight={600}>
                    Informazioni
                </Text>
                <TextInput
                    ref={nameInputRef}
                    label="Nome"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={`Nome del ${productLower}`}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).form?.requestSubmit();
                        }
                    }}
                />
                <AiDescriptionField
                    aiState={ai.aiState}
                    isGenerating={ai.isGenerating}
                    canGenerate={ai.canGenerate}
                    onGenerate={ai.generate}
                    quota={businessOutlet?.aiUsage}
                >
                    <Textarea
                        value={description}
                        onChange={e => {
                            setDescription(e.target.value);
                            ai.markManualEdit();
                        }}
                        placeholder="Breve descrizione (opzionale)"
                        rows={4}
                        disabled={ai.isGenerating}
                    />
                </AiDescriptionField>
                <FileInput
                    label="Immagine"
                    accept="image/*"
                    maxSizeMb={5}
                    preview="auto"
                    value={pendingImageFile}
                    onChange={file => setPendingImageFile(file)}
                />
            </section>

            {/* ── Prezzo ────────────────────────────────────────────── */}
            <section className={styles.section}>
                    <Text as="h3" variant="title-sm" weight={600}>
                        Prezzo
                    </Text>
                    <div className={styles.fitContent}>
                        <SegmentedControl<PriceMode>
                            value={priceMode}
                            onChange={newPriceMode => {
                                setPriceMode(newPriceMode);
                                setDraftFormats([]);
                                setHasFormatPricing(false);
                                if (newPriceMode !== "single") setBasePrice("");
                            }}
                            options={mode === "create_variant" ? VARIANT_PRICE_MODE_OPTIONS : PRICE_MODE_OPTIONS}
                        />
                    </div>

                    {priceMode === "inherit" && parentProduct && (
                        <InlineBanner variant="info">
                            Usa il prezzo di {parentProduct.name}:{" "}
                            {parentProduct.product_type === "formats"
                                ? "prezzi per formato"
                                : parentProduct.base_price !== null
                                  ? formatPrice(parentProduct.base_price)
                                  : "nessun prezzo"}
                            .
                        </InlineBanner>
                    )}

                    {priceMode === "single" && (
                        <TextInput
                            label="Prezzo base (€)"
                            type="number"
                            step="0.01"
                            min="0"
                            value={basePrice}
                            onChange={e => {
                                setBasePrice(e.target.value);
                                setBasePriceError(undefined);
                            }}
                            error={basePriceError}
                            placeholder="Es: 10.50"
                        />
                    )}

                    {priceMode === "formats" && (
                        <div className={styles.formats}>
                            {draftFormats.length > 0 && (
                                <ul className={styles.formatList}>
                                    {draftFormats.map(fmt => (
                                        <li key={fmt.id} className={styles.formatRow}>
                                            <Text variant="body-sm">{fmt.name}</Text>
                                            <span className={styles.formatRowEnd}>
                                                <Text variant="body-sm" colorVariant="muted">
                                                    {formatPrice(fmt.absolute_price)}
                                                </Text>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setDraftFormats(prev => {
                                                            const next = prev.filter(f => f.id !== fmt.id);
                                                            if (next.length === 0) setHasFormatPricing(false);
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    Rimuovi
                                                </Button>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div className={styles.formatAdd}>
                                <TextInput
                                    label="Nome formato"
                                    value={newFormatName}
                                    onChange={e => setNewFormatName(e.target.value)}
                                    placeholder="Es. 33cl"
                                    containerClassName={styles.formatName}
                                />
                                <TextInput
                                    label="Prezzo (€)"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newFormatPrice}
                                    onChange={e => setNewFormatPrice(e.target.value)}
                                    placeholder="Es. 3.50"
                                    containerClassName={styles.formatPrice}
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        const fmtName = newFormatName.trim();
                                        const fmtPrice = parseFloat(newFormatPrice);
                                        if (!fmtName || isNaN(fmtPrice) || fmtPrice < 0) return;
                                        setDraftFormats(prev => [
                                            ...prev,
                                            { id: makeDraftId(), name: fmtName, absolute_price: Math.round(fmtPrice * 100) / 100 }
                                        ]);
                                        setHasFormatPricing(true);
                                        setNewFormatName("");
                                        setNewFormatPrice("");
                                    }}
                                >
                                    Aggiungi formato
                                </Button>
                            </div>
                        </div>
                    )}

                    {submitError && <InlineBanner variant="error">{submitError}</InlineBanner>}

                    <Text variant="body-sm" colorVariant="muted">
                        Varianti, configurazioni e attributi si aggiungono dalla pagina del {productLower}, dopo averlo creato.
                    </Text>
            </section>

            {/* ── Allergeni e ingredienti (solo nei verticali che li hanno) ── */}
            {(showAllergens || showIngredients) && (
                <section className={styles.section}>
                    <Text as="h3" variant="title-sm" weight={600}>
                        Composizione
                    </Text>

                    {showAllergens && (
                        <div className={styles.field}>
                            <Text variant="body-sm" weight={600}>
                                {verticalConfig.copy.productSections.allergens}
                            </Text>
                            {isLoadingAllergens ? (
                                <Text variant="body-sm" colorVariant="muted">Caricamento allergeni...</Text>
                            ) : (
                                <>
                                    <TextInput
                                        aria-label="Cerca allergene"
                                        placeholder="Cerca allergene..."
                                        value={allergenSearchQuery}
                                        onChange={e => setAllergenSearchQuery(e.target.value)}
                                    />
                                    <div className={styles.chips}>
                                        {systemAllergens
                                            .filter(a =>
                                                a.label_it.toLowerCase().includes(allergenSearchQuery.toLowerCase()) ||
                                                a.label_en.toLowerCase().includes(allergenSearchQuery.toLowerCase())
                                            )
                                            .map(allergen => (
                                                <Chip
                                                    key={allergen.id}
                                                    label={allergen.label_it}
                                                    selected={selectedAllergens.includes(allergen.id)}
                                                    onClick={() => handleAllergenToggle(allergen.id)}
                                                />
                                            ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {showIngredients && (
                        <div className={styles.field}>
                            <Text variant="body-sm" weight={600}>
                                {verticalConfig.copy.productSections.ingredients}
                            </Text>
                            <IngredientCombobox
                                ingredients={systemIngredients}
                                selectedIds={selectedIngredients}
                                onToggle={handleIngredientToggle}
                                onReorder={setSelectedIngredients}
                                onCreate={handleCreateIngredientInline}
                                isLoadingIngredients={isLoadingIngredients}
                            />
                        </div>
                    )}
                </section>
            )}
        </form>
    );
}
