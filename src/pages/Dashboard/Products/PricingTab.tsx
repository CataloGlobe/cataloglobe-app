import React, { useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { V2Product, updateProduct } from "@/services/supabase/products";
import {
    GroupWithValues,
    V2ProductOptionValue,
    updateOptionValue,
    deleteOptionValue,
    deleteProductOptionGroup,
    createPrimaryPriceFormat
} from "@/services/supabase/productOptions";
import styles from "./PricingTab.module.scss";

interface PricingTabProps {
    product: V2Product;
    tenantId: string;
    primaryPriceGroup: GroupWithValues | null;
    optionsLoading: boolean;
    onRefreshOptions: () => Promise<void>;
    onProductUpdated: (product: V2Product) => void;
}

export function PricingTab({
    product,
    tenantId,
    primaryPriceGroup,
    optionsLoading,
    onRefreshOptions,
    onProductUpdated
}: PricingTabProps) {
    // Base price inline edit
    const [editingBasePrice, setEditingBasePrice] = useState(false);
    const [basePriceInput, setBasePriceInput] = useState("");
    const [savingBasePrice, setSavingBasePrice] = useState(false);
    const [basePriceError, setBasePriceError] = useState<string | null>(null);

    // Format inline edit
    const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
    const [editingFormatName, setEditingFormatName] = useState("");
    const [editingFormatPrice, setEditingFormatPrice] = useState("");
    const [savingFormatId, setSavingFormatId] = useState<string | null>(null);
    const [formatEditError, setFormatEditError] = useState<string | null>(null);

    // Format delete
    const [deletingFormatId, setDeletingFormatId] = useState<string | null>(null);

    // Add format form
    const [newFormatName, setNewFormatName] = useState("");
    const [newFormatPrice, setNewFormatPrice] = useState("");
    const [savingNewFormat, setSavingNewFormat] = useState(false);
    const [newFormatError, setNewFormatError] = useState<string | null>(null);

    const formats = primaryPriceGroup?.values ?? [];
    const hasFormats = formats.length > 0;
    const isBusy = !!savingFormatId || !!deletingFormatId || savingNewFormat;

    // --- Base price ---
    const handleStartEditBasePrice = () => {
        setBasePriceInput(product.base_price !== null ? String(product.base_price) : "");
        setBasePriceError(null);
        setEditingBasePrice(true);
    };

    const handleCancelEditBasePrice = () => {
        setEditingBasePrice(false);
        setBasePriceError(null);
    };

    const handleSaveBasePrice = async () => {
        const parsed = parseFloat(basePriceInput.replace(",", "."));
        if (isNaN(parsed) || parsed < 0) {
            setBasePriceError("Inserisci un prezzo valido (>= 0)");
            return;
        }
        try {
            setSavingBasePrice(true);
            const updated = await updateProduct(product.id, tenantId, { base_price: parsed });
            onProductUpdated(updated);
            setEditingBasePrice(false);
        } catch (err) {
            console.error(err);
            setBasePriceError("Errore nel salvataggio del prezzo base");
        } finally {
            setSavingBasePrice(false);
        }
    };

    // --- Format edit ---
    const handleStartEditFormat = (val: V2ProductOptionValue) => {
        setEditingFormatId(val.id);
        setEditingFormatName(val.name);
        setEditingFormatPrice(val.absolute_price !== null ? String(val.absolute_price) : "");
        setFormatEditError(null);
    };

    const handleCancelEditFormat = () => {
        setEditingFormatId(null);
        setFormatEditError(null);
    };

    const handleSaveFormat = async (valueId: string) => {
        const name = editingFormatName.trim();
        if (!name) {
            setFormatEditError("Il nome non può essere vuoto");
            return;
        }
        const parsed = parseFloat(editingFormatPrice.replace(",", "."));
        if (isNaN(parsed) || parsed < 0) {
            setFormatEditError("Inserisci un prezzo valido (>= 0)");
            return;
        }
        try {
            setSavingFormatId(valueId);
            await updateOptionValue(valueId, { name, absolute_price: parsed });
            await onRefreshOptions();
            setEditingFormatId(null);
        } catch (err) {
            console.error(err);
            setFormatEditError("Errore nel salvataggio del formato");
        } finally {
            setSavingFormatId(null);
        }
    };

    // --- Format delete ---
    const handleDeleteFormat = async (val: V2ProductOptionValue) => {
        try {
            setDeletingFormatId(val.id);
            await deleteOptionValue(val.id);
            const remainingValues = formats.filter(v => v.id !== val.id);
            if (remainingValues.length === 0 && primaryPriceGroup) {
                await deleteProductOptionGroup(primaryPriceGroup.id);
            }
            await onRefreshOptions();
        } catch (err) {
            console.error(err);
        } finally {
            setDeletingFormatId(null);
        }
    };

    // --- Add format ---
    const handleAddFormat = async () => {
        const name = newFormatName.trim();
        if (!name) {
            setNewFormatError("Il nome non può essere vuoto");
            return;
        }
        const parsed = parseFloat(newFormatPrice.replace(",", "."));
        if (isNaN(parsed) || parsed < 0) {
            setNewFormatError("Inserisci un prezzo valido (>= 0)");
            return;
        }
        try {
            setSavingNewFormat(true);
            setNewFormatError(null);
            await createPrimaryPriceFormat(product.id, tenantId, name, parsed);
            await onRefreshOptions();
            setNewFormatName("");
            setNewFormatPrice("");
        } catch (err) {
            console.error(err);
            setNewFormatError("Errore nell'aggiunta del formato");
        } finally {
            setSavingNewFormat(false);
        }
    };

    return (
        <div className={styles.root}>
            {/* Sezione A: Prezzo base */}
            <section className={styles.section}>
                <Text variant="title-sm" weight={600} style={{ marginBottom: "12px" }}>
                    Prezzo base
                </Text>

                {editingBasePrice ? (
                    <div className={styles.basePriceEdit}>
                        <NumberInput
                            label="Prezzo base (€)"
                            value={basePriceInput}
                            onChange={e => setBasePriceInput(e.target.value)}
                            min="0"
                            step="0.01"
                            error={basePriceError ?? undefined}
                            disabled={savingBasePrice}
                        />
                        <div className={styles.basePriceActions}>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSaveBasePrice}
                                disabled={savingBasePrice}
                                loading={savingBasePrice}
                            >
                                Salva
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEditBasePrice}
                                disabled={savingBasePrice}
                            >
                                Annulla
                            </Button>
                        </div>
                        {hasFormats && !basePriceError && (
                            <Text variant="body-sm" colorVariant="muted" className={styles.microcopy}>
                                Se presenti formati, il catalogo usa i prezzi dei formati.
                            </Text>
                        )}
                    </div>
                ) : (
                    <div className={styles.basePriceDisplay}>
                        <Text variant="body">
                            {product.base_price !== null
                                ? `${product.base_price.toFixed(2)} €`
                                : "Prezzo base non definito"}
                        </Text>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleStartEditBasePrice}
                        >
                            Modifica
                        </Button>
                    </div>
                )}

                {!editingBasePrice && hasFormats && (
                    <Text variant="body-sm" colorVariant="muted" className={styles.microcopy}>
                        Se presenti formati, il catalogo usa i prezzi dei formati.
                    </Text>
                )}
            </section>

            <div className={styles.divider} />

            {/* Sezione B: Formati */}
            <section className={styles.section}>
                <Text variant="title-sm" weight={600} style={{ marginBottom: "12px" }}>
                    Formati / Prezzi
                </Text>

                {optionsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento formati...
                    </Text>
                ) : (
                    <>
                        {hasFormats && (
                            <div className={styles.formatTable}>
                                <div className={styles.formatHeader}>
                                    <Text variant="body-sm" weight={600}>
                                        Nome
                                    </Text>
                                    <Text variant="body-sm" weight={600}>
                                        Prezzo
                                    </Text>
                                    <div />
                                </div>

                                {formats.map(val =>
                                    editingFormatId === val.id ? (
                                        <div key={val.id} className={styles.formatEditRow}>
                                            <TextInput
                                                value={editingFormatName}
                                                onChange={e => setEditingFormatName(e.target.value)}
                                                placeholder="Nome formato"
                                                disabled={savingFormatId === val.id}
                                            />
                                            <NumberInput
                                                value={editingFormatPrice}
                                                onChange={e => setEditingFormatPrice(e.target.value)}
                                                placeholder="Prezzo €"
                                                min="0"
                                                step="0.01"
                                                disabled={savingFormatId === val.id}
                                            />
                                            <div className={styles.rowActions}>
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleSaveFormat(val.id)}
                                                    disabled={savingFormatId === val.id}
                                                    loading={savingFormatId === val.id}
                                                >
                                                    Salva
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleCancelEditFormat}
                                                    disabled={savingFormatId === val.id}
                                                >
                                                    Annulla
                                                </Button>
                                            </div>
                                            {formatEditError && (
                                                <Text
                                                    variant="body-sm"
                                                    colorVariant="error"
                                                    className={styles.rowError}
                                                >
                                                    {formatEditError}
                                                </Text>
                                            )}
                                        </div>
                                    ) : (
                                        <div key={val.id} className={styles.formatRow}>
                                            <Text variant="body">{val.name}</Text>
                                            <Text variant="body">
                                                {val.absolute_price !== null
                                                    ? `${val.absolute_price.toFixed(2)} €`
                                                    : "—"}
                                            </Text>
                                            <div className={styles.rowActions}>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleStartEditFormat(val)}
                                                    disabled={isBusy}
                                                >
                                                    Modifica
                                                </Button>
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => handleDeleteFormat(val)}
                                                    disabled={isBusy}
                                                    loading={deletingFormatId === val.id}
                                                >
                                                    Elimina
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        )}

                        {!hasFormats && (
                            <Text
                                variant="body-sm"
                                colorVariant="muted"
                                style={{ marginBottom: "16px" }}
                            >
                                Nessun formato configurato
                            </Text>
                        )}

                        {/* Add format form */}
                        <div className={styles.addForm}>
                            <Text variant="body-sm" weight={600} style={{ marginBottom: "8px" }}>
                                Aggiungi formato
                            </Text>
                            <div className={styles.addFormInputs}>
                                <TextInput
                                    placeholder="Nome (es. 33cl)"
                                    value={newFormatName}
                                    onChange={e => setNewFormatName(e.target.value)}
                                    disabled={savingNewFormat}
                                />
                                <NumberInput
                                    placeholder="Prezzo €"
                                    value={newFormatPrice}
                                    onChange={e => setNewFormatPrice(e.target.value)}
                                    min="0"
                                    step="0.01"
                                    disabled={savingNewFormat}
                                />
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleAddFormat}
                                    disabled={savingNewFormat}
                                    loading={savingNewFormat}
                                >
                                    Aggiungi
                                </Button>
                            </div>
                            {newFormatError && (
                                <Text
                                    variant="body-sm"
                                    colorVariant="error"
                                    style={{ marginTop: "4px" }}
                                >
                                    {newFormatError}
                                </Text>
                            )}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
