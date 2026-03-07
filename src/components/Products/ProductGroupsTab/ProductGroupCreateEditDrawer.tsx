import React, { useEffect, useState, useMemo } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createProductGroup,
    updateProductGroup,
    ProductGroup
} from "@/services/supabase/v2/productGroups";
import styles from "./ProductGroupsTab.module.scss";

export type GroupFormMode = "create" | "edit";

type ProductGroupCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    mode: GroupFormMode;
    groupData: ProductGroup | null; // For edit
    allGroups: ProductGroup[]; // To populate parent select
    onSuccess: () => void;
    tenantId?: string;
};

export function ProductGroupCreateEditDrawer({
    open,
    onClose,
    mode,
    groupData,
    allGroups,
    onSuccess,
    tenantId
}: ProductGroupCreateEditDrawerProps) {
    const { showToast } = useToast();
    const isEditing = mode === "edit";

    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState("");
    const [parentGroupId, setParentGroupId] = useState<string | null>(null);

    // Filter available parent groups:
    // - Must be root groups (parent_group_id === null)
    // - Cannot be the group itself if editing
    const parentOptions = useMemo(() => {
        const rootGroups = allGroups.filter(g => g.parent_group_id === null);
        if (isEditing && groupData) {
            return rootGroups.filter(g => g.id !== groupData.id);
        }
        return rootGroups;
    }, [allGroups, isEditing, groupData]);

    const selectOptions = [
        { value: "", label: "Nessun gruppo padre (Root)" },
        ...parentOptions.map(g => ({
            value: g.id,
            label: g.name
        }))
    ];

    useEffect(() => {
        if (open) {
            setIsSaving(false);

            if (isEditing && groupData) {
                setName(groupData.name);
                setParentGroupId(groupData.parent_group_id);
            } else {
                setName("");
                setParentGroupId(null);
            }
        }
    }, [open, isEditing, groupData]);

    const handleSave = async () => {
        if (!tenantId) {
            showToast({ message: "Errore: tenantId mancante.", type: "error" });
            return;
        }

        if (!name.trim()) {
            showToast({ message: "Il nome del gruppo è obbligatorio.", type: "info" });
            return;
        }

        setIsSaving(true);
        try {
            if (isEditing && groupData) {
                await updateProductGroup(groupData.id, {
                    name: name.trim(),
                    parent_group_id: parentGroupId || null
                });
                showToast({ message: "Gruppo aggiornato con successo.", type: "success" });
            } else {
                await createProductGroup({
                    tenant_id: tenantId,
                    name: name.trim(),
                    parent_group_id: parentGroupId || null
                });
                showToast({ message: "Gruppo creato con successo.", type: "success" });
            }

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Errore salvataggio gruppo:", error);
            showToast({
                message: error.message || "Errore durante il salvataggio del gruppo.",
                type: "error"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const header = (
        <div>
            <Text variant="title-sm" weight={600}>
                {isEditing ? "Modifica gruppo" : "Crea nuovo gruppo"}
            </Text>
            <Text variant="body-sm" colorVariant="muted" style={{ marginTop: 4 }}>
                {isEditing
                    ? "Modifica i dettagli del gruppo di prodotti."
                    : "Aggiungi un nuovo gruppo per organizzare i tuoi prodotti."}
            </Text>
        </div>
    );

    const footer = (
        <>
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                Annulla
            </Button>
            <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={isSaving}>
                Salva
            </Button>
        </>
    );

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout header={header} footer={footer}>
                <div className={styles.formBody}>
                    <div className={styles.formSection}>
                        <div className={styles.formRow}>
                            <TextInput
                                label="Nome gruppo"
                                placeholder="Es: Bevande, Snack..."
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.formRow}>
                            <Select
                                label="Gruppo padre (opzionale)"
                                value={parentGroupId || ""}
                                onChange={e => setParentGroupId(e.target.value || null)}
                                options={selectOptions}
                            />
                            <Text variant="caption" colorVariant="muted" style={{ marginTop: 4 }}>
                                Solo i gruppi principali possono avere sottogruppi. Massima
                                profondità: 1 livello.
                            </Text>
                        </div>
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
