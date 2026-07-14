import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import {
    ActivityVisibilityContent,
    type VisibilityCounts,
    type VisibilityView
} from "./ActivityVisibilityContent";
import styles from "./ActivityVisibilityDrawer.module.scss";

type Props = {
    open: boolean;
    onClose: () => void;
    activityId: string;
    activityName: string;
};

export const ActivityVisibilityDrawer: React.FC<Props> = ({
    open,
    onClose,
    activityId,
    activityName
}) => {
    const [catalogName, setCatalogName] = useState<string | null>(null);
    // Tab Prodotti/Ingredienti ancorate nell'header (Direzione A): stato vissuto
    // qui, non nel body scrollabile — riga sede/catalogo diventa riga di comando.
    const [view, setView] = useState<VisibilityView>("products");
    const [counts, setCounts] = useState<VisibilityCounts>({ products: 0, ingredients: null });

    // 720px: con la 4ª tab "Non disponibili" il SegmentedControl + ToolbarSearch
    // (280px fissa) non stanno più in una riga a 600px. 720 = area utile ~672px
    // (dopo 48px di padding DrawerLayout) → tab + ricerca su una riga senza wrap.
    return (
        <SystemDrawer open={open} onClose={onClose} width={720}>
            <DrawerLayout
                bodyLayout="flex"
                header={
                    <div className={styles.header}>
                        <Text variant="title-sm" weight={700}>
                            Gestisci disponibilità
                        </Text>
                        <div className={styles.headerRow}>
                            <Text variant="body-sm" colorVariant="muted">
                                {activityName}
                                {catalogName && ` • Catalogo: ${catalogName}`}
                            </Text>
                            <Tabs<VisibilityView> value={view} onChange={setView} variant="secondary">
                                <Tabs.List>
                                    <Tabs.Tab value="products" badge={counts.products}>
                                        Prodotti
                                    </Tabs.Tab>
                                    <Tabs.Tab value="ingredients" badge={counts.ingredients ?? undefined}>
                                        Ingredienti
                                    </Tabs.Tab>
                                </Tabs.List>
                            </Tabs>
                        </div>
                    </div>
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                }
            >
                {open && (
                    <ActivityVisibilityContent
                        activityId={activityId}
                        onMetaChange={meta => setCatalogName(meta.catalogName)}
                        countPlacement="top"
                        view={view}
                        onViewChange={setView}
                        onCountsChange={setCounts}
                    />
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
};
