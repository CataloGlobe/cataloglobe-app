import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";

import {
    createTableZone,
    listTableZones
} from "@/services/supabase/tableZones";
import type { V2TableZone } from "@/types/orders";

import styles from "./ZoneSelectField.module.scss";

export interface ZoneSelectFieldProps {
    tenantId: string;
    activityId: string;
    /** zone_id selezionato, null = "Nessuna zona". */
    value: string | null;
    onChange: (zoneId: string | null) => void;
    label?: string;
    disabled?: boolean;
    /** Notifica esterna quando l'utente crea inline una nuova zona — utile
     *  al parent (es. TableZoneManagementDrawer) per refresh lista zone. */
    onZoneCreated?: (zone: V2TableZone) => void;
    /** Lista zone esterna (override). Se passata, il componente NON fa fetch
     *  iniziale. Utile quando il parent gia gestisce la lista (drawer zone). */
    externalZones?: V2TableZone[];
    /** Notifica esterna quando il mini-form "Crea nuova zona" si apre/chiude.
     *  Usato dal parent per bloccare submit del form contenitore finche il
     *  mini-form non e' confermato (Crea) o annullato. */
    onModeChange?: (mode: "select" | "create") => void;
}

const NEW_ZONE_OPTION = "__new__";
const NO_ZONE_OPTION = "__none__";

export function ZoneSelectField({
    tenantId,
    activityId,
    value,
    onChange,
    label = "Zona",
    disabled = false,
    onZoneCreated,
    externalZones,
    onModeChange
}: ZoneSelectFieldProps) {
    const [zones, setZones] = useState<V2TableZone[]>(externalZones ?? []);
    const [mode, setMode] = useState<"select" | "create">("select");
    const [newZoneName, setNewZoneName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Wrapper centralizzato: aggiorna mode locale + notifica parent.
    const changeMode = useCallback(
        (next: "select" | "create") => {
            setMode(next);
            onModeChange?.(next);
        },
        [onModeChange]
    );

    const loadZones = useCallback(async () => {
        if (externalZones !== undefined) {
            setZones(externalZones);
            return;
        }
        try {
            const data = await listTableZones(tenantId, activityId);
            setZones(data);
        } catch {
            /* silent: il parent gestisce errori globali */
        }
    }, [tenantId, activityId, externalZones]);

    useEffect(() => {
        void loadZones();
    }, [loadZones]);

    useEffect(() => {
        if (mode === "create" && inputRef.current) {
            inputRef.current.focus();
        }
    }, [mode]);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const next = e.target.value;
        if (next === NEW_ZONE_OPTION) {
            changeMode("create");
            setNewZoneName("");
            setError(null);
            return;
        }
        if (next === NO_ZONE_OPTION) {
            onChange(null);
            return;
        }
        onChange(next);
    };

    const handleCancel = () => {
        changeMode("select");
        setNewZoneName("");
        setError(null);
    };

    const handleCreate = async () => {
        const trimmed = newZoneName.trim();
        if (!trimmed) {
            setError("Inserisci un nome");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            const created = await createTableZone(tenantId, {
                activity_id: activityId,
                name: trimmed
            });
            setZones(prev =>
                [...prev, created].sort((a, b) =>
                    a.sort_order === b.sort_order
                        ? a.name.localeCompare(b.name)
                        : a.sort_order - b.sort_order
                )
            );
            onChange(created.id);
            onZoneCreated?.(created);
            changeMode("select");
            setNewZoneName("");
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_ZONE_NAME_CONFLICT") {
                setError("Esiste gia una zona con questo nome");
            } else {
                setError("Errore durante la creazione");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Quando externalZones cambia (parent ricarica), sync lista interna.
    useEffect(() => {
        if (externalZones !== undefined) {
            setZones(externalZones);
        }
    }, [externalZones]);

    const selectValue = value ?? NO_ZONE_OPTION;

    return (
        <div className={styles.wrapper}>
            <label className={styles.label}>
                <Text variant="body-sm" weight={500}>
                    {label}
                </Text>
            </label>

            {mode === "select" ? (
                <select
                    className={styles.select}
                    value={selectValue}
                    onChange={handleSelectChange}
                    disabled={disabled}
                >
                    <option value={NO_ZONE_OPTION}>Nessuna zona</option>
                    {zones.length > 0 && (
                        <optgroup label="Zone esistenti">
                            {zones.map(z => (
                                <option key={z.id} value={z.id}>
                                    {z.name}
                                </option>
                            ))}
                        </optgroup>
                    )}
                    <option value={NEW_ZONE_OPTION}>+ Crea nuova zona</option>
                </select>
            ) : (
                <div className={styles.createForm}>
                    <TextInput
                        ref={inputRef}
                        value={newZoneName}
                        onChange={e => {
                            setNewZoneName(e.target.value);
                            if (error) setError(null);
                        }}
                        placeholder="es. Sala interna"
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
                            Crea zona
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
