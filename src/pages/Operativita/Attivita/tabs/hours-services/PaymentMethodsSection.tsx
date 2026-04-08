import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui";
import { Pill } from "@/components/ui/Pill/Pill";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { updateActivity } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";
import pageStyles from "../../ActivityDetailPage.module.scss";
import styles from "./HoursServices.module.scss";

const PAYMENT_METHODS = [
    "Carta di credito",
    "Contanti",
    "Ticket Restaurant",
    "Satispay",
    "Apple Pay",
    "Google Pay",
    "Bonifico"
];

interface PaymentMethodsSectionProps {
    activity: V2Activity;
    tenantId: string;
    onSaved: () => void;
}

export const PaymentMethodsSection: React.FC<PaymentMethodsSectionProps> = ({
    activity,
    tenantId,
    onSaved
}) => {
    const { showToast } = useToast();
    const [selected, setSelected] = useState<string[]>(activity.payment_methods ?? []);
    const [isPublic, setIsPublic] = useState(activity.payment_methods_public);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Sync from props when activity changes externally
    useEffect(() => {
        setSelected(activity.payment_methods ?? []);
    }, [activity.payment_methods]);

    useEffect(() => {
        setIsPublic(activity.payment_methods_public);
    }, [activity.payment_methods_public]);

    // Cleanup debounce timer
    useEffect(() => {
        return () => clearTimeout(saveTimeoutRef.current);
    }, []);

    const handleToggle = useCallback((method: string) => {
        setSelected(prev => {
            const next = prev.includes(method)
                ? prev.filter(m => m !== method)
                : [...prev, method];

            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(async () => {
                try {
                    await updateActivity(activity.id, tenantId, {
                        payment_methods: next
                    });
                    await onSaved();
                } catch {
                    showToast({ message: "Impossibile salvare i metodi di pagamento.", type: "error" });
                }
            }, 800);

            return next;
        });
    }, [activity.id, tenantId, onSaved, showToast]);

    const handlePublicToggle = useCallback(async (checked: boolean) => {
        setIsPublic(checked);
        try {
            await updateActivity(activity.id, tenantId, {
                payment_methods_public: checked
            });
            await onSaved();
        } catch {
            showToast({ message: "Impossibile aggiornare la visibilità.", type: "error" });
        }
    }, [activity.id, tenantId, onSaved, showToast]);

    return (
        <Card className={pageStyles.card}>
            <div className={pageStyles.cardHeader}>
                <h3>Metodi di pagamento</h3>
                <Switch
                    label="Mostra nella pagina pubblica"
                    checked={isPublic}
                    onChange={handlePublicToggle}
                />
            </div>
            <div className={pageStyles.cardContent}>
                {selected.length === 0 && (
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.pillHint}>
                        Seleziona i metodi di pagamento accettati
                    </Text>
                )}
                <div className={styles.pillGrid}>
                    {PAYMENT_METHODS.map(method => (
                        <Pill
                            key={method}
                            label={method}
                            active={selected.includes(method)}
                            onClick={() => handleToggle(method)}
                        />
                    ))}
                </div>
            </div>
        </Card>
    );
};
