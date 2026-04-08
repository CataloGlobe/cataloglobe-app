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

const SERVICES = [
    "WiFi gratuito",
    "Tavoli all'aperto",
    "Prenotazioni",
    "Delivery",
    "Asporto",
    "Parcheggio",
    "Accessibile disabili",
    "Animali ammessi",
    "Aria condizionata"
];

interface ServicesSectionProps {
    activity: V2Activity;
    tenantId: string;
    onSaved: () => void;
}

export const ServicesSection: React.FC<ServicesSectionProps> = ({
    activity,
    tenantId,
    onSaved
}) => {
    const { showToast } = useToast();
    const [selected, setSelected] = useState<string[]>(activity.services ?? []);
    const [isPublic, setIsPublic] = useState(activity.services_public);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Sync from props when activity changes externally
    useEffect(() => {
        setSelected(activity.services ?? []);
    }, [activity.services]);

    useEffect(() => {
        setIsPublic(activity.services_public);
    }, [activity.services_public]);

    // Cleanup debounce timer
    useEffect(() => {
        return () => clearTimeout(saveTimeoutRef.current);
    }, []);

    const handleToggle = useCallback((service: string) => {
        setSelected(prev => {
            const next = prev.includes(service)
                ? prev.filter(s => s !== service)
                : [...prev, service];

            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(async () => {
                try {
                    await updateActivity(activity.id, tenantId, {
                        services: next
                    });
                    await onSaved();
                } catch {
                    showToast({ message: "Impossibile salvare i servizi.", type: "error" });
                }
            }, 800);

            return next;
        });
    }, [activity.id, tenantId, onSaved, showToast]);

    const handlePublicToggle = useCallback(async (checked: boolean) => {
        setIsPublic(checked);
        try {
            await updateActivity(activity.id, tenantId, {
                services_public: checked
            });
            await onSaved();
        } catch {
            showToast({ message: "Impossibile aggiornare la visibilità.", type: "error" });
        }
    }, [activity.id, tenantId, onSaved, showToast]);

    return (
        <Card className={pageStyles.card}>
            <div className={pageStyles.cardHeader}>
                <h3>Servizi offerti</h3>
                <Switch
                    label="Mostra nella pagina pubblica"
                    checked={isPublic}
                    onChange={handlePublicToggle}
                />
            </div>
            <div className={pageStyles.cardContent}>
                {selected.length === 0 && (
                    <Text as="p" variant="body-sm" colorVariant="muted" className={styles.pillHint}>
                        Seleziona i servizi offerti dalla sede
                    </Text>
                )}
                <div className={styles.pillGrid}>
                    {SERVICES.map(service => (
                        <Pill
                            key={service}
                            label={service}
                            active={selected.includes(service)}
                            onClick={() => handleToggle(service)}
                        />
                    ))}
                </div>
            </div>
        </Card>
    );
};
