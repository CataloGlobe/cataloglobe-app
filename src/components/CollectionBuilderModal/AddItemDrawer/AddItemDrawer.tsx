import { useEffect, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { CatalogType } from "@/types/catalog";
import { CreateItemDrawer, CreateItemDrawerRef } from "../CreateItemDrawer/CreateItemDrawer";
import { PickItemDrawer } from "../PickItemDrawer/PickItemDrawer";
import styles from "./AddItemDrawer.module.scss";

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

    const tabs = useMemo(
        () => [
            { id: "pick" as const, label: "Dal catalogo" },
            { id: "create" as const, label: "Nuovo" }
        ],
        []
    );

    useEffect(() => {
        setTab(defaultTab);
        onTabChange(defaultTab);
    }, [defaultTab, onTabChange]);

    useEffect(() => {
        onPickDiffChange(pickDiff);
    }, [pickDiff, onPickDiffChange]);

    return (
        <div className={styles.wrapper} aria-label="Aggiungi elemento">
            <div className={styles.tabs} role="tablist">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        className={tab === t.id ? styles.tabActive : styles.tab}
                        onClick={() => {
                            setTab(t.id);
                            onTabChange(t.id);
                        }}
                    >
                        <Text weight={600} variant="caption">
                            {t.label}
                        </Text>
                    </button>
                ))}
            </div>

            <div className={styles.body}>
                {tab === "pick" ? (
                    <PickItemDrawer
                        collectionType={collectionType}
                        existingItemIds={existingItemIds}
                        onChange={setPickDiff}
                    />
                ) : (
                    <CreateItemDrawer
                        ref={createRef}
                        collectionType={collectionType}
                        onSubmit={onCreate}
                    />
                )}
            </div>
        </div>
    );
}
