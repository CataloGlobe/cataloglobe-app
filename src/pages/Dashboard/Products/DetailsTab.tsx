import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { TranslationStatusBadge } from "@/components/ui/TranslationStatusBadge/TranslationStatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import {
    type V2Product,
    updateProduct
} from "@/services/supabase/products";
import { uploadProductImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import {
    type ProductGroup,
    getProductGroups,
    getProductGroupAssignments
} from "@/services/supabase/productGroups";
import { ProductGroupsEditDrawer } from "./ProductGroupsEditDrawer";
import styles from "./DetailsTab.module.scss";

interface DetailsTabProps {
    product: V2Product;
    productId: string;
    tenantId: string;
    onProductUpdated: (updated: V2Product) => void;
    /** Switch to another tab in the parent ProductPage. */
    onNavigateToTab: (tab: string) => void;
}

/**
 * Tab "Dettagli" — orchestrator delle sub-sezioni Identità, Gruppi,
 * Specifiche food, Caratteristiche, Note. Task 1.2 implementa Identità +
 * Gruppi inline; Specifiche food + Caratteristiche + Note arrivano in 1.3.
 */
export function DetailsTab({
    product,
    productId,
    tenantId,
    onProductUpdated,
    onNavigateToTab
}: DetailsTabProps) {
    const { showToast } = useToast();
    const verticalConfig = useVerticalConfig();
    const isBaseProduct = product.parent_product_id === null;

    const showSpecs =
        verticalConfig.productSections.allergens ||
        verticalConfig.productSections.ingredients;
    const showCharacteristics =
        verticalConfig.productSections.characteristics && isBaseProduct;

    // ── Identità ────────────────────────────────────────────────────────
    const [draftName, setDraftName] = useState(product.name);
    const [draftDescription, setDraftDescription] = useState(product.description ?? "");
    const [draftImageUrl, setDraftImageUrl] = useState<string | null>(product.image_url ?? null);
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);
    const [isSavingIdentity, setIsSavingIdentity] = useState(false);

    const isIdentityDirty = useMemo(() => {
        const baseName = product.name ?? "";
        const baseDesc = product.description ?? "";
        if (draftName.trim() !== baseName.trim()) return true;
        if (draftDescription.trim() !== baseDesc.trim()) return true;
        if (pendingImageFile !== null) return true;
        if (removeImage) return true;
        return false;
    }, [draftName, draftDescription, pendingImageFile, removeImage, product.name, product.description]);

    // Re-sync drafts from product when parent updates and we're not dirty.
    useEffect(() => {
        if (isIdentityDirty) return;
        setDraftName(product.name);
        setDraftDescription(product.description ?? "");
        setDraftImageUrl(product.image_url ?? null);
        setPendingImageFile(null);
        setRemoveImage(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product]);

    const handleCancelIdentity = useCallback(() => {
        setDraftName(product.name);
        setDraftDescription(product.description ?? "");
        setDraftImageUrl(product.image_url ?? null);
        setPendingImageFile(null);
        setRemoveImage(false);
    }, [product]);

    const handleSaveIdentity = useCallback(async () => {
        const trimmedName = draftName.trim();
        if (!trimmedName) {
            showToast({ message: "Il nome è obbligatorio", type: "error" });
            return;
        }

        try {
            setIsSavingIdentity(true);

            let imageUrl: string | null = draftImageUrl;
            if (removeImage) {
                imageUrl = null;
            } else if (pendingImageFile) {
                imageUrl = await uploadProductImage(
                    tenantId,
                    productId,
                    await compressImage(pendingImageFile, COMPRESS_PROFILES.product)
                );
            }

            const updated = await updateProduct(productId, tenantId, {
                name: trimmedName,
                description: draftDescription.trim() || null,
                image_url: imageUrl
            });

            onProductUpdated(updated);
            setPendingImageFile(null);
            setRemoveImage(false);
            showToast({ message: "Modifiche salvate", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
                type: "error"
            });
        } finally {
            setIsSavingIdentity(false);
        }
    }, [
        draftName,
        draftDescription,
        draftImageUrl,
        pendingImageFile,
        removeImage,
        productId,
        tenantId,
        onProductUpdated,
        showToast
    ]);

    // ── Gruppi prodotto ─────────────────────────────────────────────────
    const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
    const [assignedGroupIds, setAssignedGroupIds] = useState<Set<string>>(new Set());
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [isGroupsDrawerOpen, setIsGroupsDrawerOpen] = useState(false);

    const loadGroups = useCallback(async () => {
        try {
            setGroupsLoading(true);
            const [groups, assignments] = await Promise.all([
                getProductGroups(tenantId),
                getProductGroupAssignments(productId)
            ]);
            setAllGroups(groups);
            setAssignedGroupIds(new Set(assignments.map(a => a.group_id)));
        } catch {
            showToast({ message: "Errore nel caricamento dei gruppi", type: "error" });
        } finally {
            setGroupsLoading(false);
        }
    }, [tenantId, productId, showToast]);

    useEffect(() => {
        loadGroups();
    }, [loadGroups]);

    const assignedGroups = useMemo(
        () => allGroups.filter(g => assignedGroupIds.has(g.id)),
        [allGroups, assignedGroupIds]
    );

    return (
        <div className={styles.tab}>
            {/* ── Identità ──────────────────────────────────────────── */}
            <section className={styles.section} data-section="identity">
                <header className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Identità
                    </Text>
                </header>

                <div className={styles.fieldGrid}>
                    <TextInput
                        label="Nome"
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        disabled={isSavingIdentity}
                        required
                    />

                    <div className={styles.descriptionField}>
                        <Textarea
                            label="Descrizione"
                            value={draftDescription}
                            onChange={e => setDraftDescription(e.target.value)}
                            disabled={isSavingIdentity}
                            rows={4}
                            placeholder="Descrizione del prodotto..."
                        />
                        {isBaseProduct && product.description && (
                            <div className={styles.translationRow}>
                                <TranslationStatusBadge
                                    tenantId={tenantId}
                                    entityType="product"
                                    entityId={productId}
                                    field="description"
                                    refreshKey={productId}
                                />
                                <button
                                    type="button"
                                    className={styles.translationLink}
                                    onClick={() => onNavigateToTab("translations")}
                                >
                                    Gestisci traduzioni →
                                </button>
                            </div>
                        )}
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
                        disabled={isSavingIdentity}
                    />

                    {draftImageUrl && !removeImage && !pendingImageFile && (
                        <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => setRemoveImage(true)}
                            disabled={isSavingIdentity}
                        >
                            Rimuovi immagine
                        </Button>
                    )}

                    {removeImage && (
                        <Text variant="body-sm" colorVariant="muted">
                            L&apos;immagine verrà rimossa al salvataggio.
                        </Text>
                    )}
                </div>

                {isIdentityDirty && (
                    <div
                        className={styles.actionBar}
                        role="status"
                        aria-live="polite"
                    >
                        <div className={styles.actionBarLabel}>
                            <span className={styles.dirtyDot} aria-hidden />
                            <Text variant="body-sm" weight={600}>
                                Modifiche non salvate
                            </Text>
                        </div>
                        <div className={styles.actionBarButtons}>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleCancelIdentity}
                                disabled={isSavingIdentity}
                            >
                                Annulla
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={handleSaveIdentity}
                                loading={isSavingIdentity}
                                disabled={isSavingIdentity}
                            >
                                Salva
                            </Button>
                        </div>
                    </div>
                )}
            </section>

            {/* ── Gruppi prodotto ───────────────────────────────────── */}
            <section className={styles.section} data-section="groups">
                <header className={styles.sectionHeader}>
                    <Text variant="title-sm" weight={600}>
                        Gruppi prodotto
                    </Text>
                    {!groupsLoading && allGroups.length > 0 && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsGroupsDrawerOpen(true)}
                        >
                            Modifica gruppi
                        </Button>
                    )}
                </header>

                {groupsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento gruppi...
                    </Text>
                ) : allGroups.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun gruppo disponibile per questo tenant.
                    </Text>
                ) : assignedGroups.length === 0 ? (
                    <div className={styles.emptyGroupsRow}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun gruppo assegnato.
                        </Text>
                        <button
                            type="button"
                            className={styles.inlineLink}
                            onClick={() => setIsGroupsDrawerOpen(true)}
                        >
                            Aggiungi
                        </button>
                    </div>
                ) : (
                    <div className={styles.chipList}>
                        {assignedGroups.map(g => (
                            <span key={g.id} className={styles.chip}>
                                {g.name}
                            </span>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Sub-sezioni placeholder (Task 1.3) ────────────────── */}
            {showSpecs && (
                <section className={styles.section} data-section="specs">
                    <Text variant="title-sm" weight={600}>
                        Specifiche food
                    </Text>
                    <Text variant="body-sm" colorVariant="muted" className={styles.placeholder}>
                        Allergeni e ingredienti — Task 1.3
                    </Text>
                </section>
            )}

            {showCharacteristics && (
                <section className={styles.section} data-section="characteristics">
                    <Text variant="title-sm" weight={600}>
                        Caratteristiche
                    </Text>
                    <Text variant="body-sm" colorVariant="muted" className={styles.placeholder}>
                        Categorie chip — Task 1.3
                    </Text>
                </section>
            )}

            <section className={styles.section} data-section="notes">
                <Text variant="title-sm" weight={600}>
                    Note prodotto
                </Text>
                <Text variant="body-sm" colorVariant="muted" className={styles.placeholder}>
                    Note key-value — Task 1.3
                </Text>
            </section>

            <ProductGroupsEditDrawer
                open={isGroupsDrawerOpen}
                onClose={() => setIsGroupsDrawerOpen(false)}
                productId={productId}
                tenantId={tenantId}
                onSuccess={async () => {
                    await loadGroups();
                    setIsGroupsDrawerOpen(false);
                }}
            />
        </div>
    );
}

export default DetailsTab;
