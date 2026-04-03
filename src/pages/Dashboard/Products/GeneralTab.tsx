import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Pill } from "@/components/ui/Pill/Pill";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Product, updateProduct } from "@/services/supabase/products";
import { uploadProductImage } from "@/services/supabase/upload";
import {
    ProductGroup,
    getProductGroups,
    getProductGroupAssignments,
    assignProductToGroup,
    removeProductFromGroup
} from "@/services/supabase/productGroups";
import {
    listAllergens,
    getProductAllergens,
    setProductAllergens,
    V2SystemAllergen
} from "@/services/supabase/allergens";
import {
    listIngredients,
    getProductIngredients,
    setProductIngredients,
    createIngredient,
    V2Ingredient
} from "@/services/supabase/ingredients";
import { IngredientCombobox } from "@/pages/Dashboard/Products/components/IngredientCombobox";
import styles from "./GeneralTab.module.scss";

interface GeneralTabProps {
    product: V2Product;
    tenantId: string;
    onProductUpdated: (product: V2Product) => void;
}

export function GeneralTab({ product, tenantId, onProductUpdated }: GeneralTabProps) {
    const { showToast } = useToast();
    const navigate = useNavigate();

    // --- Section A: Info ---
    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [editName, setEditName] = useState(product.name);
    const [editDescription, setEditDescription] = useState(product.description ?? "");
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);
    const [savingInfo, setSavingInfo] = useState(false);
    const [infoError, setInfoError] = useState<string | null>(null);

    // --- Section B: Product Groups ---
    const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [isEditingGroups, setIsEditingGroups] = useState(false);
    const [initialGroupIds, setInitialGroupIds] = useState<Set<string>>(new Set());
    const [committedGroupIds, setCommittedGroupIds] = useState<Set<string>>(new Set());
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
    const [groupSearch, setGroupSearch] = useState("");
    const [savingGroups, setSavingGroups] = useState(false);
    const [groupsError, setGroupsError] = useState<string | null>(null);

    // --- Section C: Product Specs ---
    const [specsLoading, setSpecsLoading] = useState(true);
    const [isEditingSpecs, setIsEditingSpecs] = useState(false);
    const [savingSpecs, setSavingSpecs] = useState(false);
    const [specsError, setSpecsError] = useState<string | null>(null);
    const [systemAllergens, setSystemAllergens] = useState<V2SystemAllergen[]>([]);
    const [selectedAllergenIds, setSelectedAllergenIds] = useState<number[]>([]);
    const [committedAllergenIds, setCommittedAllergenIds] = useState<number[]>([]);
    const [systemIngredients, setSystemIngredients] = useState<V2Ingredient[]>([]);
    const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([]);
    const [committedIngredientIds, setCommittedIngredientIds] = useState<string[]>([]);

    const loadGroups = useCallback(async () => {
        try {
            setGroupsLoading(true);
            const [allG, assignments] = await Promise.all([
                getProductGroups(tenantId),
                getProductGroupAssignments(product.id)
            ]);
            setAllGroups(allG);
            const ids = new Set(assignments.map(a => a.group_id));
            setInitialGroupIds(ids);
            setCommittedGroupIds(new Set(ids));
            setSelectedGroupIds(new Set(ids));
        } catch {
            showToast({ message: "Errore nel caricamento dei gruppi", type: "error" });
        } finally {
            setGroupsLoading(false);
        }
    }, [product.id, tenantId, showToast]);

    useEffect(() => { loadGroups(); }, [loadGroups]);

    const loadSpecs = useCallback(async () => {
        try {
            setSpecsLoading(true);
            const [allAllergens, assignedAllergenIds, allIngredients, assignedIngredients] =
                await Promise.all([
                    listAllergens(),
                    getProductAllergens(product.id, tenantId),
                    listIngredients(tenantId),
                    getProductIngredients(product.id)
                ]);
            setSystemAllergens(allAllergens);
            setSelectedAllergenIds(assignedAllergenIds);
            setCommittedAllergenIds(assignedAllergenIds);
            setSystemIngredients(allIngredients);
            const ingredientIds = assignedIngredients.map(i => i.ingredient_id);
            setSelectedIngredientIds(ingredientIds);
            setCommittedIngredientIds(ingredientIds);
        } catch {
            showToast({
                message: "Non è stato possibile caricare le specifiche del prodotto.",
                type: "error"
            });
        } finally {
            setSpecsLoading(false);
        }
    }, [product.id, tenantId, showToast]);

    useEffect(() => { loadSpecs(); }, [loadSpecs]);

    // --- Info handlers ---
    const handleStartEdit = () => {
        setEditName(product.name);
        setEditDescription(product.description ?? "");
        setPendingImageFile(null);
        setRemoveImage(false);
        setInfoError(null);
        setIsEditingInfo(true);
    };

    const handleCancelEdit = () => {
        setPendingImageFile(null);
        setRemoveImage(false);
        setIsEditingInfo(false);
        setInfoError(null);
    };

    const handleSaveInfo = async () => {
        const name = editName.trim();
        if (!name) {
            setInfoError("Il nome è obbligatorio");
            return;
        }
        try {
            setSavingInfo(true);
            setInfoError(null);

            let imageUrl: string | null = product.image_url ?? null;
            if (removeImage) {
                imageUrl = null;
            } else if (pendingImageFile) {
                imageUrl = await uploadProductImage(tenantId, product.id, pendingImageFile);
            }

            const updated = await updateProduct(product.id, tenantId, {
                name,
                description: editDescription.trim() || null,
                image_url: imageUrl
            });
            onProductUpdated(updated);
            setPendingImageFile(null);
            setRemoveImage(false);
            setIsEditingInfo(false);
            showToast({ message: "Informazioni aggiornate", type: "success" });
        } catch {
            setInfoError("Errore nel salvataggio");
            showToast({ message: "Errore durante il salvataggio", type: "error" });
        } finally {
            setSavingInfo(false);
        }
    };

    // --- Group handlers ---
    const handleStartEditGroups = () => {
        setGroupsError(null);
        setIsEditingGroups(true);
    };

    const handleCancelEditGroups = () => {
        setSelectedGroupIds(new Set(committedGroupIds));
        setGroupsError(null);
        setIsEditingGroups(false);
    };

    const toggleGroup = (groupId: string) => {
        setSelectedGroupIds(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const isGroupsDirty = () => {
        if (selectedGroupIds.size !== initialGroupIds.size) return true;
        for (const id of selectedGroupIds) {
            if (!initialGroupIds.has(id)) return true;
        }
        return false;
    };

    const handleSaveGroups = async () => {
        try {
            setSavingGroups(true);
            setGroupsError(null);
            const toAdd = [...selectedGroupIds].filter(id => !initialGroupIds.has(id));
            const toRemove = [...initialGroupIds].filter(id => !selectedGroupIds.has(id));
            await Promise.all([
                ...toAdd.map(groupId =>
                    assignProductToGroup({ tenantId, productId: product.id, groupId })
                ),
                ...toRemove.map(groupId =>
                    removeProductFromGroup({ productId: product.id, groupId })
                )
            ]);
            setInitialGroupIds(new Set(selectedGroupIds));
            setCommittedGroupIds(new Set(selectedGroupIds));
            setIsEditingGroups(false);
            showToast({ message: "Gruppi aggiornati", type: "success" });
        } catch {
            setGroupsError("Errore nel salvataggio dei gruppi");
            showToast({ message: "Errore durante il salvataggio dei gruppi", type: "error" });
        } finally {
            setSavingGroups(false);
        }
    };

    const filteredGroups = allGroups.filter(g =>
        g.name.toLowerCase().includes(groupSearch.toLowerCase())
    );

    // --- Specs handlers ---
    const toggleAllergen = (id: number) => {
        setSelectedAllergenIds(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        );
    };

    const toggleIngredient = (id: string) => {
        setSelectedIngredientIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleCreateIngredient = async (name: string): Promise<string> => {
        const newIngredient = await createIngredient(tenantId, name);
        setSystemIngredients(prev => [...prev, newIngredient]);
        return newIngredient.id;
    };

    const handleStartEditSpecs = () => {
        setSpecsError(null);
        setIsEditingSpecs(true);
    };

    const handleCancelEditSpecs = () => {
        setSelectedAllergenIds(committedAllergenIds);
        setSelectedIngredientIds(committedIngredientIds);
        setSpecsError(null);
        setIsEditingSpecs(false);
    };

    const handleSaveSpecs = async () => {
        try {
            setSavingSpecs(true);
            setSpecsError(null);
            await Promise.all([
                setProductAllergens(tenantId, product.id, selectedAllergenIds),
                setProductIngredients(tenantId, product.id, selectedIngredientIds)
            ]);
            setCommittedAllergenIds([...selectedAllergenIds]);
            setCommittedIngredientIds([...selectedIngredientIds]);
            setIsEditingSpecs(false);
            showToast({ message: "Specifiche prodotto salvate.", type: "success" });
        } catch {
            showToast({
                message: "Errore nel salvataggio delle specifiche. Riprova.",
                type: "error"
            });
        } finally {
            setSavingSpecs(false);
        }
    };

    return (
        <div className={styles.root}>
            {/* Section A: Info */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Informazioni
                    </Text>
                    {!isEditingInfo && (
                        <Button variant="ghost" size="sm" onClick={handleStartEdit}>
                            Modifica
                        </Button>
                    )}
                </div>

                {isEditingInfo ? (
                    <div className={styles.infoEditForm}>
                        <TextInput
                            label="Nome"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            disabled={savingInfo}
                            required
                        />
                        <div className={styles.textareaField}>
                            <label className={styles.textareaLabel}>Descrizione</label>
                            <textarea
                                className={styles.textarea}
                                value={editDescription}
                                onChange={e => setEditDescription(e.target.value)}
                                disabled={savingInfo}
                                rows={4}
                                placeholder="Descrizione del prodotto..."
                            />
                        </div>
                        <FileInput
                            label="Immagine"
                            accept="image/*"
                            maxSizeMb={5}
                            preview="auto"
                            value={pendingImageFile}
                            onChange={file => {
                                setPendingImageFile(file);
                                if (file) setRemoveImage(false);
                            }}
                            disabled={savingInfo}
                        />
                        {product.image_url && !removeImage && !pendingImageFile && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRemoveImage(true)}
                                disabled={savingInfo}
                            >
                                Rimuovi immagine
                            </Button>
                        )}
                        {removeImage && (
                            <Text variant="body-sm" colorVariant="muted">
                                L&apos;immagine verrà rimossa al salvataggio.
                            </Text>
                        )}
                        {infoError && (
                            <Text variant="body-sm" colorVariant="error">
                                {infoError}
                            </Text>
                        )}
                        <div className={styles.infoActions}>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSaveInfo}
                                disabled={savingInfo}
                                loading={savingInfo}
                            >
                                Salva
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEdit}
                                disabled={savingInfo}
                            >
                                Annulla
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className={styles.infoDisplay}>
                        <div className={styles.infoRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                Nome
                            </Text>
                            <Text variant="body">{product.name}</Text>
                        </div>
                        <div className={styles.infoRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                Descrizione
                            </Text>
                            <Text variant="body" colorVariant={product.description ? undefined : "muted"}>
                                {product.description || "Nessuna descrizione"}
                            </Text>
                        </div>
                        <div className={styles.infoRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                Immagine
                            </Text>
                            {product.image_url ? (
                                <img
                                    src={product.image_url}
                                    alt="Immagine prodotto"
                                    className={styles.productThumbnail}
                                />
                            ) : (
                                <Text variant="body" colorVariant="muted">
                                    Nessuna immagine
                                </Text>
                            )}
                        </div>
                    </div>
                )}
            </section>

            <div className={styles.divider} />

            {/* Section B: Product Groups */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Gruppi prodotto
                    </Text>
                    {!isEditingGroups && !groupsLoading && allGroups.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={handleStartEditGroups}>
                            Modifica
                        </Button>
                    )}
                </div>

                {groupsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento gruppi...
                    </Text>
                ) : allGroups.length === 0 ? (
                    <div className={styles.emptyGroups}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun gruppo disponibile.
                        </Text>
                        <button
                            className={styles.emptyLink}
                            onClick={() =>
                                navigate(`/business/${tenantId}/products?tab=groups`)
                            }
                        >
                            Crea un gruppo →
                        </button>
                    </div>
                ) : isEditingGroups ? (
                    <>
                        {allGroups.length > 5 && (
                            <div className={styles.groupSearch}>
                                <SearchInput
                                    placeholder="Cerca gruppo..."
                                    value={groupSearch}
                                    onChange={e => setGroupSearch(e.target.value)}
                                    onClear={() => setGroupSearch("")}
                                    allowClear
                                />
                            </div>
                        )}

                        <div className={styles.groupList}>
                            {filteredGroups.length === 0 ? (
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessun gruppo trovato
                                </Text>
                            ) : (
                                filteredGroups.map(group => (
                                    <label key={group.id} className={styles.groupCheckItem}>
                                        <input
                                            type="checkbox"
                                            checked={selectedGroupIds.has(group.id)}
                                            onChange={() => toggleGroup(group.id)}
                                            disabled={savingGroups}
                                            className={styles.groupCheckbox}
                                        />
                                        <Text variant="body">{group.name}</Text>
                                    </label>
                                ))
                            )}
                        </div>

                        {groupsError && (
                            <Text
                                variant="body-sm"
                                colorVariant="error"
                                className={styles.fieldError}
                            >
                                {groupsError}
                            </Text>
                        )}

                        <div className={styles.groupActions}>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSaveGroups}
                                disabled={savingGroups || !isGroupsDirty()}
                                loading={savingGroups}
                            >
                                Salva gruppi
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEditGroups}
                                disabled={savingGroups}
                            >
                                Annulla
                            </Button>
                        </div>
                    </>
                ) : (
                    <div className={styles.groupsDisplay}>
                        {committedGroupIds.size === 0 ? (
                            <Text variant="body" colorVariant="muted">
                                Nessun gruppo assegnato
                            </Text>
                        ) : (
                            <div className={styles.specsBadgeList}>
                                {allGroups
                                    .filter(g => committedGroupIds.has(g.id))
                                    .map(g => (
                                        <span key={g.id} className={styles.groupBadge}>
                                            {g.name}
                                        </span>
                                    ))}
                            </div>
                        )}
                    </div>
                )}
            </section>

            <div className={styles.divider} />

            {/* Section C: Product Specs */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Specifiche prodotto
                    </Text>
                    {!isEditingSpecs && !specsLoading && (
                        <Button variant="ghost" size="sm" onClick={handleStartEditSpecs}>
                            Modifica
                        </Button>
                    )}
                </div>

                {specsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento specifiche...
                    </Text>
                ) : isEditingSpecs ? (
                    <div className={styles.specsEditForm}>
                        <div className={styles.specsField}>
                            <Text variant="body-sm" weight={600}>
                                Allergeni
                            </Text>
                            <div className={styles.allergenGrid}>
                                {systemAllergens.map(allergen => (
                                    <Pill
                                        key={allergen.id}
                                        label={allergen.label_it}
                                        active={selectedAllergenIds.includes(allergen.id)}
                                        onClick={() => toggleAllergen(allergen.id)}
                                        disabled={savingSpecs}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className={styles.specsField}>
                            <Text variant="body-sm" weight={600}>
                                Ingredienti
                            </Text>
                            <IngredientCombobox
                                ingredients={systemIngredients}
                                selectedIds={selectedIngredientIds}
                                onToggle={toggleIngredient}
                                onCreate={handleCreateIngredient}
                                isLoadingIngredients={false}
                            />
                        </div>

                        {specsError && (
                            <Text variant="body-sm" colorVariant="error">
                                {specsError}
                            </Text>
                        )}

                        <div className={styles.specsActions}>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSaveSpecs}
                                loading={savingSpecs}
                                disabled={savingSpecs}
                            >
                                Salva
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEditSpecs}
                                disabled={savingSpecs}
                            >
                                Annulla
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className={styles.specsDisplay}>
                        <div className={styles.specsRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                Allergeni
                            </Text>
                            {committedAllergenIds.length === 0 ? (
                                <Text variant="body" colorVariant="muted">
                                    Nessun allergene specificato
                                </Text>
                            ) : (
                                <div className={styles.specsBadgeList}>
                                    {systemAllergens
                                        .filter(a => committedAllergenIds.includes(a.id))
                                        .map(a => (
                                            <span key={a.id} className={styles.allergenBadge}>
                                                {a.label_it}
                                            </span>
                                        ))}
                                </div>
                            )}
                        </div>

                        <div className={styles.specsRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                Ingredienti
                            </Text>
                            {committedIngredientIds.length === 0 ? (
                                <Text variant="body" colorVariant="muted">
                                    Nessun ingrediente specificato
                                </Text>
                            ) : (
                                <div className={styles.specsBadgeList}>
                                    {systemIngredients
                                        .filter(i => committedIngredientIds.includes(i.id))
                                        .map(i => (
                                            <span key={i.id} className={styles.ingredientBadge}>
                                                {i.name}
                                            </span>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
