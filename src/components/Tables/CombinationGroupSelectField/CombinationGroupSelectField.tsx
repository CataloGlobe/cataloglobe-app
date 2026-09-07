import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";

import {
    createTableCombinationGroup,
    listTableCombinationGroups
} from "@/services/supabase/tableCombinationGroups";
import type { V2TableCombinationGroup } from "@/types/orders";

import styles from "./CombinationGroupSelectField.module.scss";

/**
 * Dropdown del gruppo di accostamento, con creazione inline (stesso pattern di
 * ZoneSelectField: niente modali annidate dentro il drawer del tavolo).
 *
 * I tavoli dello stesso gruppo sono accostabili FRA LORO, tutti con tutti.
 * Il testo sotto al campo lo dice esplicitamente e suggerisce gruppi piccoli:
 * e' l'unico posto dove il ristoratore incontra questa regola.
 */
export interface CombinationGroupSelectFieldProps {
    tenantId: string;
    activityId: string;
    /** combination_group_id selezionato, null = tavolo non accostabile. */
    value: string | null;
    onChange: (groupId: string | null) => void;
    label?: string;
    disabled?: boolean;
    /** Notifica quando il mini-form "Crea nuovo gruppo" si apre/chiude: il
     *  parent blocca il submit del form contenitore finche' non e' risolto. */
    onModeChange?: (mode: "select" | "create") => void;
}

const NEW_GROUP_OPTION = "__new__";
const NO_GROUP_OPTION = "__none__";

export function CombinationGroupSelectField({
    tenantId,
    activityId,
    value,
    onChange,
    label = "Gruppo di accostamento",
    disabled = false,
    onModeChange
}: CombinationGroupSelectFieldProps) {
    const [groups, setGroups] = useState<V2TableCombinationGroup[]>([]);
    const [mode, setMode] = useState<"select" | "create">("select");
    const [newGroupName, setNewGroupName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const changeMode = useCallback(
        (next: "select" | "create") => {
            setMode(next);
            onModeChange?.(next);
        },
        [onModeChange]
    );

    const loadGroups = useCallback(async () => {
        try {
            const data = await listTableCombinationGroups(tenantId, activityId);
            setGroups(data);
        } catch {
            /* silent: il parent gestisce gli errori globali */
        }
    }, [tenantId, activityId]);

    useEffect(() => {
        void loadGroups();
    }, [loadGroups]);

    useEffect(() => {
        if (mode === "create" && inputRef.current) {
            inputRef.current.focus();
        }
    }, [mode]);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const next = e.target.value;
        if (next === NEW_GROUP_OPTION) {
            changeMode("create");
            setNewGroupName("");
            setError(null);
            return;
        }
        if (next === NO_GROUP_OPTION) {
            onChange(null);
            return;
        }
        onChange(next);
    };

    const handleCancel = () => {
        changeMode("select");
        setNewGroupName("");
        setError(null);
    };

    const handleCreate = async () => {
        const trimmed = newGroupName.trim();
        if (!trimmed) {
            setError("Inserisci un nome");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            const created = await createTableCombinationGroup(tenantId, {
                activity_id: activityId,
                name: trimmed
            });
            setGroups(prev =>
                [...prev, created].sort((a, b) =>
                    a.sort_order === b.sort_order
                        ? a.name.localeCompare(b.name)
                        : a.sort_order - b.sort_order
                )
            );
            onChange(created.id);
            changeMode("select");
            setNewGroupName("");
        } catch (err) {
            if (
                err instanceof Error &&
                err.message === "TABLE_COMBINATION_GROUP_NAME_CONFLICT"
            ) {
                setError("Esiste gia un gruppo con questo nome");
            } else {
                setError("Errore durante la creazione");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.wrapper}>
            <label className={styles.label}>
                <Text variant="body-sm" weight={500}>
                    {label}
                </Text>
            </label>

            {mode === "select" ? (
                <>
                    <select
                        className={styles.select}
                        value={value ?? NO_GROUP_OPTION}
                        onChange={handleSelectChange}
                        disabled={disabled}
                    >
                        <option value={NO_GROUP_OPTION}>
                            Nessuno — il tavolo non si accosta
                        </option>
                        {groups.length > 0 && (
                            <optgroup label="Gruppi esistenti">
                                {groups.map(g => (
                                    <option key={g.id} value={g.id}>
                                        {g.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        <option value={NEW_GROUP_OPTION}>+ Crea nuovo gruppo</option>
                    </select>
                    <Text variant="body-sm" className={styles.hint}>
                        I tavoli dello stesso gruppo vengono considerati accostabili
                        tutti fra loro. Tieni i gruppi piccoli e vicini di fatto (es.
                        &laquo;Fila finestra&raquo;): un gruppo troppo largo fa
                        proporre unioni fra tavoli lontani. Se lasci
                        &laquo;Nessuno&raquo; il tavolo viene assegnato sempre da solo.
                    </Text>
                </>
            ) : (
                <div className={styles.createForm}>
                    <TextInput
                        ref={inputRef}
                        value={newGroupName}
                        onChange={e => {
                            setNewGroupName(e.target.value);
                            if (error) setError(null);
                        }}
                        placeholder="es. Fila finestra"
                        disabled={isSubmitting}
                        onKeyDown={e => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void handleCreate();
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                handleCancel();
                            }
                        }}
                    />
                    <div className={styles.createActions}>
                        <Button
                            variant="secondary"
                            type="button"
                            onClick={handleCancel}
                            disabled={isSubmitting}
                        >
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="button"
                            leftIcon={<Plus size={14} />}
                            onClick={handleCreate}
                            loading={isSubmitting}
                        >
                            Crea gruppo
                        </Button>
                    </div>
                    {error && (
                        <Text variant="body-sm" className={styles.error}>
                            {error}
                        </Text>
                    )}
                </div>
            )}
        </div>
    );
}
