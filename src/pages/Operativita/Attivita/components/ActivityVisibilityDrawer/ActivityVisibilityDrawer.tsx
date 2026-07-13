import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import { ActivityVisibilityContent } from "./ActivityVisibilityContent";
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
                            Gestisci visibilità
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {activityName}
                            {catalogName && ` • Catalogo: ${catalogName}`}
                        </Text>
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
                    />
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
};
