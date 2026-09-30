import React, { useEffect, useState } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { FormGrid, FormSection } from "@/components/ui/FormGrid";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import {
    createActivityGroup,
    updateActivityGroup,
    getGroupWithMembers,
    syncGroupMembers
} from "@/services/supabase/activity-groups";
import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import styles from "./ActivityGroupDrawer.module.scss";

interface ActivityGroupDrawerProps {
    open: boolean;
    mode: "create" | "edit";
    groupId?: string;
    onSuccess: () => void;
    onClose: () => void;
}

const FORM_ID = "activity-group-form";

/**
 * Drawer «Nuovo gruppo di sedi» / «Modifica gruppo di sedi»: nome,
 * descrizione e le sedi che ne fanno parte, una spunta per sede.
 * Il gruppo si popola solo a mano (§32.3).
 */
export const ActivityGroupDrawer: React.FC<ActivityGroupDrawerProps> = ({
    open,
    mode,
    groupId,
    onSuccess,
    onClose
}) => {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [name, setName] = useState("");
    const [nameError, setNameError] = useState<string | undefined>();
    const [description, setDescription] = useState("");
    const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
    const [isSystem, setIsSystem] = useState(false);
    const [allActivities, setAllActivities] = useState<V2Activity[]>([]);

    useEffect(() => {
        if (!open) return;
        // Ogni apertura riparte pulita: il drawer resta montato fra un uso e l'altro.
        setName("");
        setNameError(undefined);
        setDescription("");
        setSelectedActivityIds([]);
        setIsSystem(false);

        const loadInitialData = async () => {
            if (!tenantId) return;
            setIsLoading(true);
            try {
                const activities = await getActivities(tenantId);
                setAllActivities(activities);

                if (mode === "edit" && groupId) {
                    const { group, activityIds } = await getGroupWithMembers(groupId, tenantId);
                    setName(group.name);
                    setDescription(group.description || "");
                    setIsSystem(group.is_system);
                    setSelectedActivityIds(activityIds);
                }
            } catch (error) {
                console.error("Errore caricamento dati drawer gruppi:", error);
                showToast({ message: "Errore nel caricamento dei dati.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        };

        void loadInitialData();
    }, [open, groupId, mode, tenantId, showToast]);

    const handleToggleActivity = (id: string) => {
        setSelectedActivityIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!name.trim()) {
            setNameError("Il nome è obbligatorio.");
            showToast({ message: "Il nome è obbligatorio.", type: "error" });
            return;
        }
        if (!tenantId) return;

        setIsSaving(true);
        try {
            let currentGroupId = groupId;

            if (mode === "create") {
                const newGroup = await createActivityGroup({
                    tenant_id: tenantId,
                    name: name.trim(),
                    description: description.trim() || null
                });
                currentGroupId = newGroup.id;
            } else if (mode === "edit" && groupId) {
                await updateActivityGroup(groupId, tenantId, {
                    name: isSystem ? undefined : name.trim(), // il nome di un gruppo di sistema non si cambia
                    description: description.trim() || null
                });
            }

            if (currentGroupId) {
                await syncGroupMembers(currentGroupId, tenantId, selectedActivityIds);
            }

            showToast({
                message: `Gruppo ${mode === "create" ? "creato" : "aggiornato"} con successo.`,
                type: "success"
            });
            onSuccess();
        } catch (error) {
            console.error("Errore salvataggio gruppo sedi:", error);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const safeClose = () => {
        if (!isSaving) onClose();
    };

    return (
        <SystemDrawer open={open} onClose={safeClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        {mode === "create" ? "Nuovo gruppo di sedi" : "Modifica gruppo di sedi"}
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={safeClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            loading={isSaving}
                            disabled={isSaving || isLoading}
                        >
                            {mode === "create" ? "Crea gruppo" : "Salva modifiche"}
                        </Button>
                    </>
                }
            >
                <form id={FORM_ID} onSubmit={handleSubmit} className={styles.form}>
                    <FormGrid autoFocus={!isLoading}>
                        <TextInput
                            label="Nome del gruppo"
                            value={name}
                            onChange={e => {
                                setName(e.target.value);
                                if (nameError) setNameError(undefined);
                            }}
                            placeholder="Es. Ristoranti centro"
                            disabled={isSystem || isLoading}
                            helperText={isSystem ? "Il nome di un gruppo di sistema non si cambia." : undefined}
                            error={nameError}
                            required
                        />
                        <Textarea
                            label="Descrizione (opzionale)"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Aggiungi una breve descrizione…"
                            rows={3}
                            disabled={isLoading}
                        />
                    </FormGrid>

                    <FormSection title="Sedi nel gruppo" description="Le regole di Programmazione che puntano il gruppo valgono per queste sedi.">
                        {isLoading ? (
                            <div className={styles.members}>
                                <ListRow loading />
                                <ListRow loading />
                                <ListRow loading />
                            </div>
                        ) : allActivities.length === 0 ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessuna sede disponibile.
                            </Text>
                        ) : (
                            <div className={styles.members}>
                                {allActivities.map(activity => (
                                    <ListRow
                                        key={activity.id}
                                        leading={
                                            <CheckboxInput
                                                aria-label={activity.name}
                                                checked={selectedActivityIds.includes(activity.id)}
                                                onChange={() => handleToggleActivity(activity.id)}
                                            />
                                        }
                                        title={activity.name}
                                        subtitle={[activity.city, activity.address].filter(Boolean).join(", ")}
                                        selected={selectedActivityIds.includes(activity.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </FormSection>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
};
