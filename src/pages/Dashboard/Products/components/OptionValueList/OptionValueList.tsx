import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Text from "@/components/ui/Text/Text";
import { type V2ProductOptionValue } from "@/services/supabase/productOptions";
import styles from "./OptionValueList.module.scss";

/** `absolute`: prezzo secco del valore (formati). `delta`: modificatore sul prezzo base (addon), mostrato con segno. */
export type OptionValuePriceMode = "absolute" | "delta";

interface OptionValueListProps {
    values: V2ProductOptionValue[];
    priceMode: OptionValuePriceMode;
    emptyTitle?: string;
    namePlaceholder?: string;
    pricePlaceholder?: string;
    onCreate: (name: string, price: number) => Promise<void>;
    onUpdate: (id: string, name: string, price: number) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

function readPrice(value: V2ProductOptionValue, priceMode: OptionValuePriceMode): number | null {
    return priceMode === "absolute" ? value.absolute_price : value.price_modifier;
}

function formatPrice(price: number | null, priceMode: OptionValuePriceMode): string {
    if (price === null) return "—";
    if (priceMode === "absolute") return `${price.toFixed(2)} €`;
    return price >= 0 ? `+${price.toFixed(2)} €` : `${price.toFixed(2)} €`;
}

function parsePrice(raw: string): number | null {
    const parsed = parseFloat(raw.replace(",", "."));
    return isNaN(parsed) ? null : parsed;
}

/**
 * Lista compatta dei valori di un gruppo opzioni (formati o addon) —
 * sostituisce la `DataTable` generica: niente paginazione/conteggio/header
 * maiuscolo, pensata per 2-10 righe. Generica sul tipo di prezzo (`priceMode`)
 * cosi lo stesso componente serve sia PRIMARY_PRICE che ADDON (Task B).
 * CRUD a salvataggio immediato: `onCreate/onUpdate/onDelete` chiamano il
 * service e possono rilanciare — l'errore resta visibile inline nella riga.
 */
export function OptionValueList({
    values,
    priceMode,
    emptyTitle = "Nessuna scelta",
    namePlaceholder = "Nome",
    pricePlaceholder = "Prezzo",
    onCreate,
    onUpdate,
    onDelete
}: OptionValueListProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [editError, setEditError] = useState<string | null>(null);
    const [savingEditId, setSavingEditId] = useState<string | null>(null);

    const [isAdding, setIsAdding] = useState(false);
    const [addName, setAddName] = useState("");
    const [addPrice, setAddPrice] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [savingAdd, setSavingAdd] = useState(false);

    const startEdit = (value: V2ProductOptionValue) => {
        setEditingId(value.id);
        setEditName(value.name);
        const current = readPrice(value, priceMode);
        setEditPrice(current !== null ? String(current) : "");
        setEditError(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditError(null);
    };

    const saveEdit = async (id: string) => {
        const name = editName.trim();
        if (!name) {
            setEditError("Il nome è obbligatorio");
            return;
        }
        const price = parsePrice(editPrice);
        if (price === null) {
            setEditError("Inserisci un numero valido (es. 0.50 o -0.50)");
            return;
        }
        try {
            setSavingEditId(id);
            await onUpdate(id, name, price);
            setEditingId(null);
        } catch {
            setEditError("Errore nel salvataggio, riprova.");
        } finally {
            setSavingEditId(null);
        }
    };

    const confirmDelete = async (id: string) => {
        await onDelete(id);
    };

    const saveAdd = async () => {
        const name = addName.trim();
        if (!name) {
            setAddError("Il nome è obbligatorio");
            return;
        }
        const price = parsePrice(addPrice || "0");
        if (price === null) {
            setAddError("Inserisci un numero valido (es. 0.50 o -0.50)");
            return;
        }
        try {
            setSavingAdd(true);
            setAddError(null);
            await onCreate(name, price);
            setAddName("");
            setAddPrice("");
        } catch {
            setAddError("Errore nell'aggiunta, riprova.");
        } finally {
            setSavingAdd(false);
        }
    };

    const showAddRow = values.length > 0 || isAdding;

    return (
        <div className={styles.list}>
            {values.length === 0 && !isAdding && (
                <EmptyState
                    variant="inline"
                    icon={null}
                    title={emptyTitle}
                    action={
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsAdding(true)}
                        >
                            Aggiungi
                        </Button>
                    }
                />
            )}

            {values.map(value =>
                editingId === value.id ? (
                    <div key={value.id} className={styles.editRow}>
                        <TextInput
                            containerClassName={styles.nameField}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder={namePlaceholder}
                            disabled={savingEditId === value.id}
                        />
                        <NumberInput
                            containerClassName={styles.priceField}
                            value={editPrice}
                            onChange={e => setEditPrice(e.target.value)}
                            placeholder={pricePlaceholder}
                            step="0.01"
                            disabled={savingEditId === value.id}
                        />
                        <div className={styles.rowActions}>
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={() => saveEdit(value.id)}
                                disabled={savingEditId === value.id}
                                loading={savingEditId === value.id}
                            >
                                Salva
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={cancelEdit}
                                disabled={savingEditId === value.id}
                            >
                                Annulla
                            </Button>
                        </div>
                        {editError && (
                            <Text variant="body-sm" colorVariant="error" className={styles.rowError}>
                                {editError}
                            </Text>
                        )}
                    </div>
                ) : (
                    <div key={value.id} className={styles.row}>
                        <Text variant="body" className={styles.nameField}>
                            {value.name}
                        </Text>
                        <Text variant="body" className={styles.priceField}>
                            {formatPrice(readPrice(value, priceMode), priceMode)}
                        </Text>
                        <div className={styles.rowActions}>
                            <TableRowActions
                                actions={[
                                    {
                                        label: "Modifica",
                                        onClick: () => startEdit(value)
                                    },
                                    {
                                        label: "Elimina",
                                        onClick: () => confirmDelete(value.id),
                                        variant: "destructive",
                                        separator: true
                                    }
                                ]}
                            />
                        </div>
                    </div>
                )
            )}

            {showAddRow && (
                <div className={styles.editRow}>
                    <TextInput
                        containerClassName={styles.nameField}
                        value={addName}
                        onChange={e => setAddName(e.target.value)}
                        placeholder={namePlaceholder}
                        disabled={savingAdd}
                    />
                    <NumberInput
                        containerClassName={styles.priceField}
                        value={addPrice}
                        onChange={e => setAddPrice(e.target.value)}
                        placeholder={pricePlaceholder}
                        step="0.01"
                        disabled={savingAdd}
                    />
                    <div className={styles.rowActions}>
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={saveAdd}
                            disabled={savingAdd}
                            loading={savingAdd}
                        >
                            Aggiungi
                        </Button>
                    </div>
                    {addError && (
                        <Text variant="body-sm" colorVariant="error" className={styles.rowError}>
                            {addError}
                        </Text>
                    )}
                </div>
            )}
        </div>
    );
}

export default OptionValueList;
