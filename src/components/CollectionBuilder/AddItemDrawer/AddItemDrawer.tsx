import { useEffect, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { CatalogType } from "@/types/catalog";
import { CreateItemDrawer, CreateItemDrawerRef } from "../CreateItemDrawer/CreateItemDrawer";
import { PickItemDrawer } from "../PickItemDrawer/PickItemDrawer";
import styles from "./AddItemDrawer.module.scss";
import { Tabs } from "@/components/ui/Tabs/Tabs";

type Tab = "pick" | "create";

type CreatePayload = {
    name: string;
    description?: string;
    base_price?: number;
    duration?: number;
    type: CatalogType;
    category_id: string;
};

type SelectionDiff = {
    add: string[];
    remove: string[];
};

type Props = {
    collectionType: CatalogType;
    existingItemIds: Set<string>;
    defaultTab?: Tab;
    onTabChange: (tab: "pick" | "create") => void;

    onPickDiffChange: (diff: SelectionDiff) => void;
    onCreate: (payload: CreatePayload) => Promise<void>;

    createRef: React.RefObject<CreateItemDrawerRef | null>;
};

export function AddItemDrawer({
    collectionType,
    existingItemIds,
    defaultTab = "pick",
    onTabChange,
    onPickDiffChange,
    onCreate,
    createRef
}: Props) {
    const [tab, setTab] = useState<Tab>(defaultTab);
    const [pickDiff, setPickDiff] = useState<SelectionDiff>({
        add: [],
        remove: []
    });

    useEffect(() => {
        setTab(defaultTab);
        onTabChange(defaultTab);
    }, [defaultTab, onTabChange]);

    useEffect(() => {
        onPickDiffChange(pickDiff);
    }, [pickDiff, onPickDiffChange]);

    return (
        <div className={styles.wrapper} aria-label="Aggiungi elemento">
            <Tabs<Tab>
                value={tab}
                onChange={nextTab => {
                    setTab(nextTab);
                    onTabChange(nextTab);
                }}
            >
                <Tabs.List>
                    <Tabs.Tab value="pick">
                        <Text weight={600} variant="caption">
                            Dal catalogo
                        </Text>
                    </Tabs.Tab>

                    <Tabs.Tab value="create">
                        <Text weight={600} variant="caption">
                            Nuovo
                        </Text>
                    </Tabs.Tab>
                </Tabs.List>

                <div className={styles.body}>
                    <Tabs.Panel value="pick">
                        <PickItemDrawer
                            collectionType={collectionType}
                            existingItemIds={existingItemIds}
                            onChange={setPickDiff}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="create" lazy>
                        <CreateItemDrawer
                            ref={createRef}
                            collectionType={collectionType}
                            onSubmit={onCreate}
                        />
                    </Tabs.Panel>
                </div>
            </Tabs>
        </div>
    );
}
