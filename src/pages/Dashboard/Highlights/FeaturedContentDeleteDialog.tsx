import { useCallback, useEffect, useState } from "react";
import { ConfirmDialogShell } from "@/components/ui/ConfirmDialog/ConfirmDialogShell";
import { Button } from "@/components/ui/Button/Button";
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

/**
 * Elimina un contenuto in evidenza: conferma con l'impatto (§50.11, come
 * Prodotti). Fail-closed: se il conteggio non arriva il dialogo lo dice,
 * «Elimina» resta spento e «Riprova» rilegge; mai una conferma che tace le
 * regole da cui il contenuto sparirebbe.
 */
export default function FeaturedContentDeleteDialog({
    open,
    onClose,
    featured,
    tenantId,
    onSuccess
}: FeaturedContentDeleteDialogProps) {
    const { showToast } = useToast();
    const [impact, setImpact] = useState<FeaturedContentDeleteImpact | null>(null);
    const [impactFailed, setImpactFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!open || !featured) return;
        setImpact(null);
        setImpactFailed(false);
        let cancelled = false;
        countFeaturedContentDeleteImpact(featured.id, tenantId)
            .then(result => {
                if (!cancelled) setImpact(result);
            })
            .catch(err => {
                console.warn("[FeaturedContentDeleteDialog] impact fetch failed:", err);
                if (!cancelled) setImpactFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [open, featured, tenantId, attempt]);

    const retry = useCallback(() => setAttempt(n => n + 1), []);

    const handleDelete = async (): Promise<void> => {
        if (!featured || impactFailed) return;
        setIsDeleting(true);
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
        } catch (error) {
            console.error("Errore nell'eliminazione del contenuto in evidenza:", error);
            showToast({ message: "Impossibile eliminare il contenuto.", type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <ConfirmDialogShell
            isOpen={open && featured !== null}
            onClose={onClose}
            locked={isDeleting}
            title={`Eliminare «${featured?.internal_name ?? ""}»?`}
            message={impactFailed ? undefined : impactSentence(impact)}
            error={impactFailed ? "Non riesco a controllare dove è usato: senza saperlo non lo elimino." : null}
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={isDeleting} data-autofocus>
                        Annulla
                    </Button>
                    {impactFailed && (
                        <Button variant="secondary" size="sm" onClick={retry}>
                            Riprova
                        </Button>
                    )}
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void handleDelete()}
                        loading={isDeleting}
                        disabled={impactFailed}
                    >
                        Elimina contenuto
                    </Button>
                </>
            }
        />
    );
}
