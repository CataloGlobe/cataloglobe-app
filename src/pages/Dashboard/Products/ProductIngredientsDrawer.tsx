import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import type { V2Ingredient } from "@/services/supabase/ingredients";
import { IngredientCombobox } from "./components/IngredientCombobox";

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    available: V2Ingredient[];
    loading: boolean;
    value: string[];
    /** Aggiorna il draft di pagina (ordine compreso). Non tocca il DB. */
    onApply: (next: string[]) => void;
    /** Crea un ingrediente nuovo: quello sì, subito (è struttura, §27.2). */
    onCreate: (name: string) => Promise<string>;
};

/**
 * Ingredienti del prodotto (lotto Prodotti P6, §50.9/2): come gli Allergeni,
 * chip nella Scheda e modifica qui. Il combobox è quello di prima — cerca,
 * crea, riordina — ma lavora su una copia: «Applica» la porta nel draft della
 * pagina, «Annulla» la butta.
 */
export function ProductIngredientsDrawer({ open, onClose, title, available, loading, value, onApply, onCreate }: Props) {
    const [draft, setDraft] = useState<string[]>(value);

    useEffect(() => {
        if (open) setDraft(value);
    }, [open, value]);

    const toggle = (id: string) => {
        setDraft(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
    };

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                title={`Modifica ${title.toLowerCase()}`}
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => {
                                onApply(draft);
                                onClose();
                            }}
                        >
                            Applica
                        </Button>
                    </>
                }
            >
                <IngredientCombobox
                    ingredients={available}
                    selectedIds={draft}
                    onToggle={toggle}
                    onReorder={setDraft}
                    onCreate={onCreate}
                    isLoadingIngredients={loading}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
