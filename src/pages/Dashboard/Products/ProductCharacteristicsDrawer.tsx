import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
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
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica caratteristiche
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Annulla
                        </Button>
                        <Button variant="primary" onClick={handleConfirm}>
                            Conferma
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
