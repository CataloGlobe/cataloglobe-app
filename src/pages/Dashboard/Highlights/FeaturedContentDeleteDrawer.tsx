import { useEffect, useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    deleteFeaturedContent,
    countFeaturedContentDeleteImpact,
    type FeaturedContentDeleteImpact,
    type FeaturedContentWithProducts
} from "@/services/supabase/featuredContents";
import styles from "./FeaturedContentDeleteDrawer.module.scss";

type FeaturedContentDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    featured: FeaturedContentWithProducts | null;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
};

type ImpactItem = { count: number; singular: string; plural: string };

function buildImpactItems(impact: FeaturedContentDeleteImpact): ImpactItem[] {
    return [
        {
            count: impact.rules,
            singular: "regola di programmazione",
            plural: "regole di programmazione"
        },
        {
            count: impact.products,
            singular: "prodotto collegato",
            plural: "prodotti collegati"
        }
    ].filter(item => item.count > 0);
}

function formatImpactSentence(items: ImpactItem[]): string {
    return items
        .map(item => `${item.count} ${item.count === 1 ? item.singular : item.plural}`)
        .join(", ");
}

function formatSchedulesDisabled(count: number): string {
    if (count === 1) return "1 regola di programmazione spostata in bozze.";
    return `${count} regole di programmazione spostate in bozze.`;
}

export default function FeaturedContentDeleteDrawer({
    open,
    onClose,
    featured,
    tenantId,
    onSuccess
}: FeaturedContentDeleteDrawerProps) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);
    const [impact, setImpact] = useState<FeaturedContentDeleteImpact | null>(null);

    useEffect(() => {
        if (!open || !featured) return;
        setIsDeleting(false);
        setImpact(null);
        let cancelled = false;
        countFeaturedContentDeleteImpact(featured.id, tenantId)
            .then(result => {
                if (!cancelled) setImpact(result);
            })
            .catch(err => {
                console.warn("[FeaturedContentDeleteDrawer] impact fetch failed:", err);
            });
        return () => {
            cancelled = true;
        };
    }, [open, featured, tenantId]);

    const handleDelete = async () => {
        if (!featured) return;
        setIsDeleting(true);
        try {
            const result = await deleteFeaturedContent(featured.id, tenantId);

            const impactItems = impact ? buildImpactItems(impact) : [];
            const parts: string[] = ["Contenuto in evidenza eliminato."];
            if (impactItems.length > 0) {
                parts.push(`Rimosso da ${formatImpactSentence(impactItems)}.`);
            }
            if (result.schedules_disabled > 0) {
                parts.push(formatSchedulesDisabled(result.schedules_disabled));
            }

            showToast({ message: parts.join(" "), type: "success" });
            await onSuccess();
            onClose();
        } catch (error) {
            console.error("Errore nell'eliminazione del contenuto in evidenza:", error);
            const fallback = "Impossibile eliminare il contenuto in evidenza.";
            const message = error instanceof Error && error.message ? error.message : fallback;
            showToast({ message, type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!featured) return null;

    const impactItems = impact ? buildImpactItems(impact) : [];

    return (
        <SystemDrawer open={open} onClose={onClose} width={400}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeader}>
                        <Text variant="title-sm" weight={600} colorVariant="error">
                            Elimina contenuto in evidenza
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button variant="danger" onClick={handleDelete} loading={isDeleting}>
                            Conferma Eliminazione
                        </Button>
                    </>
                }
            >
                <div>
                    <div className={styles.warningBox}>
                        <IconAlertTriangle
                            size={24}
                            className={styles.warningIcon}
                            color="var(--color-warning-500)"
                        />
                        <div className={styles.warningText}>
                            <Text variant="body" weight={600}>
                                Azione distruttiva permanente
                            </Text>
                            <Text variant="body-sm">
                                Stai per eliminare <strong>{featured.title}</strong>.
                                Verrà rimosso da tutte le regole di programmazione e i
                                prodotti collegati.
                            </Text>
                        </div>
                    </div>

                    {impactItems.length > 0 && (
                        <div className={styles.impactSection}>
                            <div className={styles.impactTitle}>
                                <Text variant="body-sm" weight={600}>
                                    Questo contenuto è utilizzato in:
                                </Text>
                            </div>
                            <ul className={styles.impactList}>
                                {impactItems.map(item => (
                                    <li key={item.singular}>
                                        <Text variant="body-sm">
                                            {item.count}{" "}
                                            {item.count === 1 ? item.singular : item.plural}
                                        </Text>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
