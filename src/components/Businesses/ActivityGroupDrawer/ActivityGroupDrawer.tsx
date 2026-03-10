import React, { useEffect, useState } from "react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import {
    createActivityGroup,
    updateActivityGroup,
    getGroupWithMembers,
    syncGroupMembers
} from "@/services/supabase/v2/activity-groups";
import { getActivities } from "@/services/supabase/v2/activities";
import { V2Activity } from "@/types/v2/activity";
import styles from "./ActivityGroupDrawer.module.scss";

interface ActivityGroupDrawerProps {
    mode: "create" | "edit";
    groupId?: string;
    onSuccess: () => void;
    onClose: () => void;
}

export const ActivityGroupDrawer: React.FC<ActivityGroupDrawerProps> = ({
    mode,
    groupId,
    onSuccess,
    onClose
}) => {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
    const [isSystem, setIsSystem] = useState(false);

    // Data lists
    const [allActivities, setAllActivities] = useState<V2Activity[]>([]);

    useEffect(() => {
        const loadInitialData = async () => {
            if (!tenantId) return;
            setIsLoading(true);
            try {
                // Carica tutte le attività
                const activities = await getActivities(tenantId);
                setAllActivities(activities);

                // Se in edit, carica i dati del gruppo e i membri
                if (mode === "edit" && groupId) {
                    const { group, activityIds } = await getGroupWithMembers(groupId, tenantId!);
                    setName(group.name);
                    setDescription(group.description || "");
                    setIsSystem(group.is_system);
                    setSelectedActivityIds(activityIds);
                }
            } catch (error) {
                console.error("Errore caricamento dati drawer gruppi:", error);
                showToast({
                    message: "Errore nel caricamento dei dati.",
                    type: "error"
                });
            } finally {
                setIsLoading(false);
            }
        };

        loadInitialData();
    }, [groupId, mode, tenantId]);

    const handleToggleActivity = (id: string) => {
        setSelectedActivityIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSave = async () => {
        if (!name.trim()) {
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
                await updateActivityGroup(groupId, tenantId!, {
                    name: isSystem ? undefined : name.trim(), // Non permettere cambio nome se sistema
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
            console.error("Errore salvataggio gruppo attività:", error);
            showToast({
                message: "Errore durante il salvataggio.",
                type: "error"
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className={styles.loading}>Caricamento...</div>;
    }

    return (
        <div className={styles.drawerContent}>
            <div className={styles.formSection}>
                <TextInput
                    label="Nome gruppo"
                    value={name}
                    onChange={e => setName((e.target as HTMLInputElement).value)}
                    placeholder="Esempio: Ristoranti Centro"
                    disabled={isSystem}
                    required
                />
                <Textarea
                    label="Descrizione (opzionale)"
                    value={description}
                    onChange={e => setDescription((e.target as HTMLTextAreaElement).value)}
                    placeholder="Aggiungi una breve descrizione..."
                    rows={3}
                />
            </div>

            <div className={styles.membershipSection}>
                <Text variant="body-sm" weight={600} className={styles.sectionTitle}>
                    Seleziona Attività
                </Text>
                <div className={styles.activityList}>
                    {allActivities.length === 0 ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Nessuna attività disponibile.
                        </Text>
                    ) : (
                        allActivities.map(activity => (
                            <label key={activity.id} className={styles.activityItem}>
                                <input
                                    type="checkbox"
                                    checked={selectedActivityIds.includes(activity.id)}
                                    onChange={() => handleToggleActivity(activity.id)}
                                />
                                <div className={styles.activityInfo}>
                                    <Text variant="body-sm" weight={500}>
                                        {activity.name}
                                    </Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {activity.city}, {activity.address}
                                    </Text>
                                </div>
                            </label>
                        ))
                    )}
                </div>
            </div>

            <div className={styles.footer}>
                <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                    Annulla
                </Button>
                <Button variant="primary" onClick={handleSave} loading={isSaving}>
                    {mode === "create" ? "Crea gruppo" : "Salva modifiche"}
                </Button>
            </div>
        </div>
    );
};
