import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { Pill } from "@/components/ui/Pill/Pill";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import Text from "@/components/ui/Text/Text";
import type { V2SystemAllergen } from "@/services/supabase/allergens";
import styles from "./ProductAllergensDrawer.module.scss";

interface ProductAllergensDrawerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    available: V2SystemAllergen[];
    loading: boolean;
    value: number[];
    /** Aggiorna il draft di pagina. NON tocca il DB — persiste solo `HeaderSaveAction`. */
    onConfirm: (next: number[]) => void;
}

/**
 * Drawer di editing allergeni — non salva sul DB. `Conferma` aggiorna il
 * draft della Scheda (sollevato in `ProductPage`); l'unico punto che
 * persiste è `HeaderSaveAction`. `Annulla`/chiusura scarta le modifiche
 * locali del drawer, il draft di pagina resta invariato.
 */
export function ProductAllergensDrawer({
    open,
    onClose,
    title,
    available,
    loading,
    value,
    onConfirm
}: ProductAllergensDrawerProps) {
    const [draft, setDraft] = useState<number[]>(value);

    // Risincronizza il draft locale col valore corrente ogni volta che il
    // drawer si apre — così riparte sempre dalla selezione di pagina attuale.
    useEffect(() => {
        if (open) setDraft(value);
    }, [open, value]);

    const toggle = (id: number) => {
        setDraft(prev => (prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]));
    };

    const handleConfirm = () => {
        onConfirm(draft);
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica {title.toLowerCase()}
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
                {loading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento allergeni...
                    </Text>
                ) : (
                    <div className={styles.grid}>
                        {available.map(a => (
                            <Pill
                                key={a.id}
                                label={a.label_it}
                                icon={<AllergenIcon code={a.code} size={16} variant="bare" />}
                                active={draft.includes(a.id)}
                                onClick={() => toggle(a.id)}
                            />
                        ))}
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
