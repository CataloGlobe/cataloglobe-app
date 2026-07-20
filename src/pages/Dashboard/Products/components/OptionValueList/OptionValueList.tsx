import { useEffect, useRef, useState } from "react";
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
    /** Precompila il prezzo della riga di aggiunta (transizione Unico → Per formato). */
    initialAddPrice?: number;
    /** Apre subito la riga di aggiunta con focus sul nome (stessa transizione). */
    autoFocusAdd?: boolean;
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

/** `absolute` mostra solo €; `delta` aggiunge anche il `+` a sinistra —
 * il segno è l'informazione che distingue un addon da un formato. */
function priceAdornments(priceMode: OptionValuePriceMode) {
    return priceMode === "delta"
        ? { startAdornment: "+", endAdornment: "€" }
        : { endAdornment: "€" };
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
    onDelete,
    initialAddPrice,
    autoFocusAdd = false
}: OptionValueListProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [editError, setEditError] = useState<string | null>(null);
    const [savingEditId, setSavingEditId] = useState<string | null>(null);

    const [isAdding, setIsAdding] = useState(autoFocusAdd);
    const [addName, setAddName] = useState("");
    const [addPrice, setAddPrice] = useState(
        initialAddPrice !== undefined ? String(initialAddPrice) : ""
    );
    const [addError, setAddError] = useState<string | null>(null);
    const [savingAdd, setSavingAdd] = useState(false);
    const addNameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoFocusAdd) addNameRef.current?.focus();
        // Solo al mount — la precompilazione serve solo alla transizione
        // Unico → Per formato, un'unica volta.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                            inputClassName={styles.controlInput}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder={namePlaceholder}
                            disabled={savingEditId === value.id}
                        />
                        <NumberInput
                            containerClassName={styles.priceField}
                            inputClassName={styles.controlInput}
                            {...priceAdornments(priceMode)}
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
                                className={styles.controlButton}
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
                                className={styles.controlButton}
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
                        <Text variant="body" className={styles.priceValueRead}>
                            {formatPrice(readPrice(value, priceMode), priceMode)}
                        </Text>
                        <div className={styles.readActions}>
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
                        ref={addNameRef}
                        containerClassName={styles.nameField}
                        inputClassName={styles.controlInput}
                        value={addName}
                        onChange={e => setAddName(e.target.value)}
                        placeholder={namePlaceholder}
                        disabled={savingAdd}
                    />
                    <NumberInput
                        containerClassName={styles.priceField}
                        inputClassName={styles.controlInput}
                        {...priceAdornments(priceMode)}
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
                            className={styles.controlButton}
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
