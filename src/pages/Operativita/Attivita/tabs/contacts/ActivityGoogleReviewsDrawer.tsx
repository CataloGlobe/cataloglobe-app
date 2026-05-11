import React, { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { updateActivity } from "@/services/supabase/activities";
import { useToast } from "@/context/Toast/ToastContext";
import { GooglePlacesSearch } from "./GooglePlacesSearch";
import type { V2Activity } from "@/types/activity";

type ActivityGoogleReviewsDrawerProps = {
    open: boolean;
    onClose: () => void;
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
};

export const ActivityGoogleReviewsDrawer: React.FC<ActivityGoogleReviewsDrawerProps> = ({
    open,
    onClose,
    activity,
    tenantId,
    onSuccess
}) => {
    const { showToast } = useToast();
    const [localUrl, setLocalUrl] = useState(activity.google_review_url ?? "");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setLocalUrl(activity.google_review_url ?? "");
        }
    }, [open, activity.google_review_url]);

    const handleSave = async () => {
        const initial = activity.google_review_url ?? "";
        if (localUrl === initial) {
            onClose();
            return;
        }
        setIsSaving(true);
        try {
            await updateActivity(activity.id, tenantId, {
                google_review_url: localUrl ? localUrl : null
            });
            await onSuccess();
            showToast({
                message: localUrl
                    ? "Google Reviews collegato."
                    : "Google Reviews scollegato.",
                type: "success"
            });
            onClose();
        } catch {
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            Collega Google Reviews
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Cerca la tua attività su Google per collegare le recensioni alla pagina pubblica.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" onClick={handleSave} loading={isSaving}>
                            Salva
                        </Button>
                    </>
                }
            >
                <GooglePlacesSearch
                    value={localUrl}
                    onChange={url => setLocalUrl(url)}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
};
