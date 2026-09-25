import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import CharacteristicsSection from "./components/CharacteristicsSection/CharacteristicsSection";

interface ProductCharacteristicsDrawerProps {
    open: boolean;
    onClose: () => void;
    vertical?: string;
    value: string[];
    /** Aggiorna il draft di pagina. NON tocca il DB — persiste solo `HeaderSaveAction`. */
    onConfirm: (next: string[]) => void;
}

/**
 * Drawer di editing caratteristiche — non salva sul DB, stessa semantica di
 * `ProductAllergensDrawer`. Riusa `CharacteristicsSection` (griglia +
 * `mutex_group` data-driven) così com'è, self-fetching della lista
 * disponibile a ogni apertura.
 */
export function ProductCharacteristicsDrawer({
    open,
    onClose,
    vertical,
    value,
    onConfirm
}: ProductCharacteristicsDrawerProps) {
    const [draft, setDraft] = useState<string[]>(value);

    useEffect(() => {
        if (open) setDraft(value);
    }, [open, value]);

    const handleConfirm = () => {
        onConfirm(draft);
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                title="Modifica caratteristiche"
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Annulla
                        </Button>
                        {/* «Applica»: va nella bozza della pagina, non sul DB (§49.1/2). */}
                        <Button variant="primary" onClick={handleConfirm}>
                            Applica
                        </Button>
                    </>
                }
            >
                <CharacteristicsSection
                    vertical={vertical}
                    value={draft}
                    onChange={setDraft}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
