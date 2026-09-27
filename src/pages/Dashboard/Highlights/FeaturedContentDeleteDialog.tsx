import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/context/Toast/ToastContext";
import {
    deleteFeaturedContent,
    countFeaturedContentDeleteImpact,
    type FeaturedContentDeleteImpact,
    type FeaturedContentWithProducts
} from "@/services/supabase/featuredContents";

type FeaturedContentDeleteDialogProps = {
    open: boolean;
    onClose: () => void;
    featured: FeaturedContentWithProducts | null;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** «Si toglie da 1 regola e da 2 prodotti collegati.» — l'impatto si legge prima. */
function impactSentence(impact: FeaturedContentDeleteImpact | null): string {
    if (!impact) return "Controllo dove è usato…";
    const parts = [
        impact.rules > 0 ? plural(impact.rules, "regola", "regole") : null,
        impact.products > 0 ? plural(impact.products, "prodotto collegato", "prodotti collegati") : null
    ].filter(Boolean);
    const where = parts.length > 0 ? `Si toglie da ${parts.join(" e da ")}. ` : "";
    const drafts = impact.rules > 0 ? "Le regole che restano senza contenuti passano in bozza. " : "";
    return `${where}${drafts}Non si torna indietro.`;
}

/** Elimina un contenuto in evidenza: ConfirmDialog con l'impatto (§50.11, come Prodotti). */
export default function FeaturedContentDeleteDialog({
    open,
    onClose,
    featured,
    tenantId,
    onSuccess
}: FeaturedContentDeleteDialogProps) {
    const { showToast } = useToast();
    const [impact, setImpact] = useState<FeaturedContentDeleteImpact | null>(null);

    useEffect(() => {
        if (!open || !featured) return;
        setImpact(null);
        let cancelled = false;
        countFeaturedContentDeleteImpact(featured.id, tenantId)
            .then(result => {
                if (!cancelled) setImpact(result);
            })
            .catch(err => {
                // Senza impatto la conferma resta possibile: dice solo che non si torna indietro.
                console.warn("[FeaturedContentDeleteDialog] impact fetch failed:", err);
                if (!cancelled) setImpact({ rules: 0, products: 0 });
            });
        return () => {
            cancelled = true;
        };
    }, [open, featured, tenantId]);

    const handleDelete = async (): Promise<boolean> => {
        if (!featured) return false;
        try {
            const result = await deleteFeaturedContent(featured.id, tenantId);
            const moved = result.schedules_disabled;
            showToast({
                message:
                    moved > 0
                        ? `Contenuto eliminato. ${plural(moved, "regola spostata", "regole spostate")} in bozze.`
                        : "Contenuto eliminato.",
                type: "success"
            });
            await onSuccess();
            onClose();
            return true;
        } catch (error) {
            console.error("Errore nell'eliminazione del contenuto in evidenza:", error);
            showToast({ message: "Impossibile eliminare il contenuto.", type: "error" });
            return false;
        }
    };

    return (
        <ConfirmDialog
            isOpen={open && featured !== null}
            onClose={onClose}
            onConfirm={handleDelete}
            title={`Eliminare «${featured?.internal_name ?? ""}»?`}
            message={impactSentence(impact)}
            confirmLabel="Elimina contenuto"
        />
    );
}
