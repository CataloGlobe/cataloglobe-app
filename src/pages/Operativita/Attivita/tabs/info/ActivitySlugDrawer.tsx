import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { FormSection } from "@/components/ui/FormGrid/FormGrid";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import { ActivitySlugForm } from "./ActivitySlugForm";
import { deleteActivitySlugAlias } from "@/services/supabase/activitySlugAliases";
import { useToast } from "@/context/Toast/ToastContext";
import type { ActivitySlugAlias, V2Activity } from "@/types/activity";
import styles from "./ActivitySlugDrawer.module.scss";

const FORM_ID = "activity-slug-form";

type ActivitySlugDrawerProps = {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    tenantId: string;
    /** Gli indirizzi precedenti: i vecchi slug che fanno ancora da redirect. */
    aliases: ActivitySlugAlias[];
    onSuccess: () => void;
    /** Dopo la rimozione di un alias: chi chiama ricarica la lista. */
    onAliasRemoved: () => void | Promise<void>;
    canEdit: boolean;
};

/**
 * Cambiare l'indirizzo web è un'operazione a sé (§31.4): verifica mentre
 * scrivi, parole riservate, conferma se la sede è pubblicata. Qui sotto la
 * sezione «Indirizzi precedenti» che la copy prometteva e non c'era
 * (registro Sedi #47): ogni alias si può rimuovere.
 */
export function ActivitySlugDrawer({
    open,
    onClose,
    activity,
    tenantId,
    aliases,
    onSuccess,
    onAliasRemoved,
    canEdit
}: ActivitySlugDrawerProps) {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [canSubmit, setCanSubmit] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const handleSuccess = () => {
        onSuccess();
        onClose();
    };

    const handleRemoveAlias = async (alias: ActivitySlugAlias) => {
        setRemovingId(alias.id);
        try {
            await deleteActivitySlugAlias(alias.id, tenantId);
            await onAliasRemoved();
            showToast({ message: "Indirizzo precedente rimosso: quel link non porta più qui.", type: "success" });
        } catch {
            showToast({ message: "Impossibile rimuovere l'indirizzo precedente.", type: "error" });
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                title="Cambia indirizzo web"
                onClose={onClose}
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving} disabled={!canSubmit || isSaving || !canEdit}>
                            Salva
                        </Button>
                    </>
                }
            >
                <div className={styles.body}>
                    <ActivitySlugForm
                        formId={FORM_ID}
                        entityData={activity}
                        tenantId={tenantId}
                        onSuccess={handleSuccess}
                        onSavingChange={setIsSaving}
                        onCanSubmitChange={setCanSubmit}
                    />
                    <FormSection
                        title="Indirizzi precedenti"
                        description={
                            aliases.length === 0
                                ? "Nessuno: questa sede ha sempre avuto l'indirizzo di adesso."
                                : "I vecchi indirizzi portano ancora qui. Rimuoverne uno spegne quel link."
                        }
                    >
                        {aliases.length > 0 && (
                            <div className={styles.aliases}>
                                {aliases.map(alias => (
                                    <ListRow
                                        key={alias.id}
                                        title={alias.slug}
                                        subtitle={`dal ${new Date(alias.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`}
                                        trailing={
                                            canEdit ? (
                                                <TableRowActions
                                                    ariaLabel={`Azioni indirizzo ${alias.slug}`}
                                                    actions={[
                                                        {
                                                            label: removingId === alias.id ? "Rimozione…" : "Rimuovi",
                                                            icon: Trash2,
                                                            variant: "destructive",
                                                            onClick: () => void handleRemoveAlias(alias)
                                                        }
                                                    ]}
                                                />
                                            ) : undefined
                                        }
                                    />
                                ))}
                            </div>
                        )}
                        {aliases.length === 0 && (
                            <Text variant="caption" colorVariant="muted">
                                Quando cambi indirizzo, il vecchio compare qui.
                            </Text>
                        )}
                    </FormSection>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
