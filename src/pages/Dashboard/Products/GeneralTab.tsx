import React, { useState, useEffect } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { V2Product, updateProduct } from "@/services/supabase/v2/products";
import {
    ProductGroup,
    getProductGroups,
    getProductGroupAssignments,
    assignProductToGroup,
    removeProductFromGroup
} from "@/services/supabase/v2/productGroups";
import styles from "./GeneralTab.module.scss";

interface GeneralTabProps {
    product: V2Product;
    tenantId: string;
    onProductUpdated: (product: V2Product) => void;
}

export function GeneralTab({ product, tenantId, onProductUpdated }: GeneralTabProps) {
    // --- Section A: Info ---
    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [editName, setEditName] = useState(product.name);
    const [editDescription, setEditDescription] = useState(product.description ?? "");
    const [editImageUrl, setEditImageUrl] = useState(product.image_url ?? "");
    const [savingInfo, setSavingInfo] = useState(false);
    const [infoError, setInfoError] = useState<string | null>(null);

    // --- Section B: Product Groups ---
    const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [initialGroupIds, setInitialGroupIds] = useState<Set<string>>(new Set());
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
    const [groupSearch, setGroupSearch] = useState("");
    const [savingGroups, setSavingGroups] = useState(false);
    const [groupsError, setGroupsError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setGroupsLoading(true);
                const [allG, assignments] = await Promise.all([
                    getProductGroups(tenantId),
                    getProductGroupAssignments(product.id)
                ]);
                if (cancelled) return;
                setAllGroups(allG);
                const ids = new Set(assignments.map(a => a.group_id));
                setInitialGroupIds(ids);
                setSelectedGroupIds(new Set(ids));
            } catch (err) {
                console.error("Errore caricamento gruppi:", err);
            } finally {
                if (!cancelled) setGroupsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [product.id, tenantId]);

    // --- Info handlers ---
    const handleStartEdit = () => {
        setEditName(product.name);
        setEditDescription(product.description ?? "");
        setEditImageUrl(product.image_url ?? "");
        setInfoError(null);
        setIsEditingInfo(true);
    };

    const handleCancelEdit = () => {
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
            const updated = await updateProduct(product.id, tenantId, {
                name,
                description: editDescription.trim() || null,
                image_url: editImageUrl.trim() || null
            });
            onProductUpdated(updated);
            setIsEditingInfo(false);
        } catch (err) {
            console.error(err);
            setInfoError("Errore nel salvataggio");
        } finally {
            setSavingInfo(false);
        }
    };

    // --- Group handlers ---
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
        } catch (err) {
            console.error(err);
            setGroupsError("Errore nel salvataggio dei gruppi");
        } finally {
            setSavingGroups(false);
        }
    };

    const filteredGroups = allGroups.filter(g =>
        g.name.toLowerCase().includes(groupSearch.toLowerCase())
    );

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
                        <TextInput
                            label="URL immagine"
                            value={editImageUrl}
                            onChange={e => setEditImageUrl(e.target.value)}
                            disabled={savingInfo}
                            placeholder="https://..."
                        />
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
                            <Text variant="body" colorVariant={product.image_url ? undefined : "muted"}>
                                {product.image_url || "Nessuna immagine"}
                            </Text>
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
                </div>

                {groupsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento gruppi...
                    </Text>
                ) : allGroups.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun gruppo disponibile. Crea un gruppo dalla sezione Prodotti.
                    </Text>
                ) : (
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
                                style={{ marginTop: "4px" }}
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
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
