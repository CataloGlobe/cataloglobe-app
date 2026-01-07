import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./CollectionBuilderModal.module.scss";

import Text from "@/components/ui/Text/Text";
import { Button } from "../ui";
import { ChevronLeft, ChevronRight, Laptop, Smartphone, Tablet } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";

import CollectionPreviewFrame, {
    DeviceMode
} from "./CollectionPreviewFrame/CollectionPreviewFrame";
import CollectionStylePanel from "./CollectionStylePanel/CollectionStylePanel";
import CollectionView from "../PublicCollectionView/CollectionView/CollectionView";
import { CollectionSectionsPanel } from "./CollectionSectionsPanel/CollectionSectionsPanel";
import { SectionItemsPanel } from "./SectionItemsPanel/SectionItemsPanel";

import { Drawer } from "./Drawer/Drawer";

import {
    addItemToCollection,
    createItem,
    deleteSectionAndItems,
    getCollectionBuilderData,
    getCollectionItemsWithData,
    removeItemFromCollection,
    updateCollection,
    updateCollectionItem,
    updateItem,
    updateSectionLabel,
    updateSectionOrder
} from "@/services/supabase/collections";

import type { Collection, CollectionItemWithItem, CollectionSection, Item } from "@/types/database";
import type { CollectionStyle } from "@/types/collectionStyle";
import { resolveCollectionStyle, safeCollectionStyle } from "@/types/collectionStyle";
import { CatalogType } from "@/types/catalog";

import { useToast } from "@/context/Toast/ToastContext";
import { AddItemDrawer } from "./AddItemDrawer/AddItemDrawer";
import { CreateItemDrawerRef } from "./CreateItemDrawer/CreateItemDrawer";
import { EditItemDrawer, EditItemDrawerRef } from "./EditItemDrawer/EditItemDrawer";

type Props = {
    isOpen: boolean;
    collectionId: string | null;
    onClose: () => void;
};

type ActiveTab = "content" | "style";

type BuilderState = {
    collection: Collection;
    sections: CollectionSection[];
    items: CollectionItemWithItem[];
};

type DrawerState =
    | { type: "none" }
    | { type: "add"; defaultTab?: "pick" | "create" }
    | { type: "edit" };

export default function CollectionBuilderModal({ isOpen, collectionId, onClose }: Props) {
    /* ---------------------------------------------------------------------
     * REFS
     * ------------------------------------------------------------------- */
    const modalRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);
    const createItemRef = useRef<CreateItemDrawerRef | null>(null);
    const editItemRef = useRef<EditItemDrawerRef | null>(null);

    /* ---------------------------------------------------------------------
     * STATE
     * ------------------------------------------------------------------- */
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<BuilderState | null>(null);

    const [tab, setTab] = useState<ActiveTab>("content");
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

    const [mode, setMode] = useState<DeviceMode>("mobile");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const [styleDraft, setStyleDraft] = useState<CollectionStyle>({});
    const [drawer, setDrawer] = useState<DrawerState>({ type: "none" });
    const [addDrawerTab, setAddDrawerTab] = useState<"pick" | "create">("pick");
    const [pickDiff, setPickDiff] = useState<{ add: string[]; remove: string[] }>({
        add: [],
        remove: []
    });

    const [editingItem, setEditingItem] = useState<Item | null>(null);

    const { showToast } = useToast();

    /* ---------------------------------------------------------------------
     * MEMO
     * ------------------------------------------------------------------- */
    const savedStyle = useMemo(() => safeCollectionStyle(data?.collection.style ?? null), [data]);

    const resolvedStyle = useMemo(
        () => resolveCollectionStyle(savedStyle, styleDraft),
        [savedStyle, styleDraft]
    );

    const sections = useMemo(() => {
        if (!data) return [];
        return [...data.sections].sort((a, b) => a.order_index - b.order_index);
    }, [data]);

    const items = useMemo(() => data?.items ?? [], [data?.items]);

    const itemsInActiveSection = useMemo(() => {
        if (!activeSectionId) return [];
        return items
            .filter(it => it.section_id === activeSectionId)
            .sort((a, b) => a.order_index - b.order_index);
    }, [items, activeSectionId]);

    const existingItemIds = useMemo(() => {
        return new Set((data?.items ?? []).map(row => row.item.id));
    }, [data?.items]);

    const normalizedCollectionType = useMemo<CatalogType>(() => {
        switch (data?.collection.collection_type) {
            case "menu":
            case "products":
            case "services":
            case "events":
            case "offers":
                return data.collection.collection_type;
            default:
                return "generic";
        }
    }, [data?.collection.collection_type]);

    /* ---------------------------------------------------------------------
     * DATA LOADING
     * ------------------------------------------------------------------- */
    const load = useCallback(async (cid: string) => {
        setLoading(true);
        try {
            const base = await getCollectionBuilderData(cid);
            const items = await getCollectionItemsWithData(cid);

            setData({
                collection: base.collection,
                sections: base.sections,
                items
            });

            setActiveSectionId(base.sections[0]?.id ?? null);
            setStyleDraft(safeCollectionStyle(base.collection.style));
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshItems = useCallback(async (cid: string) => {
        const refreshed = await getCollectionItemsWithData(cid);
        setData(prev => (prev ? { ...prev, items: refreshed } : prev));
    }, []);

    /* ---------------------------------------------------------------------
     * EFFECTS
     * ------------------------------------------------------------------- */
    useEffect(() => {
        if (!isOpen || !collectionId) return;
        void load(collectionId);
    }, [isOpen, collectionId, load]);

    const closeDrawer = useCallback(() => {
        setDrawer({ type: "none" });
        setEditingItem(null);
        setAddDrawerTab("pick");
    }, []);

    const handleCloseModal = useCallback(() => {
        closeDrawer();
        onClose();
    }, [closeDrawer, onClose]);

    useEffect(() => {
        if (!isOpen) return;

        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();

                if (drawer.type !== "none") {
                    setDrawer({ type: "none" });
                    return;
                }

                handleCloseModal();
            }
        };

        const onTabTrap = (e: KeyboardEvent) => {
            if (e.key !== "Tab" || !modalRef.current) return;

            const focusables = getFocusableElements(modalRef.current);
            if (focusables.length === 0) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        window.addEventListener("keydown", onKey);
        window.addEventListener("keydown", onTabTrap);

        setTimeout(() => modalRef.current?.focus(), 0);

        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("keydown", onTabTrap);
        };
    }, [isOpen, drawer.type, handleCloseModal]);

    useEffect(() => {
        if (!isOpen) {
            previouslyFocusedRef.current?.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setDrawer({ type: "none" });
            setEditingItem(null);
        }
    }, [isOpen]);

    /* ---------------------------------------------------------------------
     * HANDLERS
     * ------------------------------------------------------------------- */
    const handleToggleVisibility = useCallback(
        async (collectionItemId: string, visible: boolean) => {
            if (!collectionId) return;

            await updateCollectionItem(collectionItemId, { visible });
            await refreshItems(collectionId);
        },
        [collectionId, refreshItems]
    );

    const handleSaveStyle = useCallback(async () => {
        if (!data) return;

        try {
            const safeDraft = safeCollectionStyle(styleDraft);

            const updated = await updateCollection(data.collection.id, {
                style: safeDraft
            });

            setData(prev => (prev ? { ...prev, collection: updated } : prev));
            setStyleDraft(safeCollectionStyle(updated.style));

            showToast({
                type: "success",
                message: "Stile salvato correttamente",
                duration: 2500
            });
        } catch {
            showToast({
                type: "error",
                message: "Errore nel salvataggio dello stile",
                duration: 3000
            });
        }
    }, [data, styleDraft, showToast]);

    const handleReorder = useCallback(
        async (activeId: string, overId: string) => {
            if (!data) return;

            const sectionItems = itemsInActiveSection;

            const oldIndex = sectionItems.findIndex(it => it.id === activeId);
            const newIndex = sectionItems.findIndex(it => it.id === overId);

            if (oldIndex === -1 || newIndex === -1) return;

            const reordered = arrayMove(sectionItems, oldIndex, newIndex);

            // optimistic update
            setData(prev => {
                if (!prev) return prev;

                const updatedItems = prev.items.map(it => {
                    const idx = reordered.findIndex(r => r.id === it.id);
                    return idx === -1 ? it : { ...it, order_index: idx };
                });

                return { ...prev, items: updatedItems };
            });

            // persist
            await Promise.all(
                reordered.map((it, index) => updateCollectionItem(it.id, { order_index: index }))
            );
        },
        [data, itemsInActiveSection]
    );

    const handleReorderSections = useCallback(
        async (activeId: string, overId: string) => {
            if (!data) return;

            const oldIndex = data.sections.findIndex(s => s.id === activeId);
            const newIndex = data.sections.findIndex(s => s.id === overId);

            if (oldIndex === -1 || newIndex === -1) return;

            const reordered = arrayMove(data.sections, oldIndex, newIndex);

            // optimistic update
            setData(prev =>
                prev
                    ? {
                          ...prev,
                          sections: reordered.map((s, index) => ({
                              ...s,
                              order_index: index
                          }))
                      }
                    : prev
            );

            // persist
            await Promise.all(reordered.map((s, index) => updateSectionOrder(s.id, index)));
        },
        [data]
    );

    const handleRenameSection = useCallback(async (sectionId: string, label: string) => {
        if (!label.trim()) return;

        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                sections: prev.sections.map(s =>
                    s.id === sectionId ? { ...s, label: label.trim() } : s
                )
            };
        });

        await updateSectionLabel(sectionId, label.trim());
    }, []);

    const handleDeleteSection = useCallback(
        async (sectionId: string) => {
            if (!data) return;

            // optimistic update
            setData(prev => {
                if (!prev) return prev;

                return {
                    ...prev,
                    sections: prev.sections.filter(s => s.id !== sectionId),
                    items: prev.items.filter(it => it.section_id !== sectionId)
                };
            });

            // aggiorna active section se serve
            if (activeSectionId === sectionId) {
                const remaining = sections.filter(s => s.id !== sectionId);
                setActiveSectionId(remaining[0]?.id ?? null);
            }

            await deleteSectionAndItems(sectionId);

            await refreshItems(data.collection.id);
        },
        [data, activeSectionId, sections, refreshItems]
    );

    const reloadSectionsAndItems = useCallback(async (cid: string) => {
        const [base, freshItems] = await Promise.all([
            getCollectionBuilderData(cid), // contiene sections dal DB
            getCollectionItemsWithData(cid)
        ]);

        setData(prev =>
            prev
                ? { ...prev, sections: base.sections, items: freshItems }
                : { collection: base.collection, sections: base.sections, items: freshItems }
        );

        return { sections: base.sections, items: freshItems };
    }, []);

    const applyPickDiff = async () => {
        if (!data) return;

        // 1) aggiunte
        for (const itemId of pickDiff.add) {
            await addItemToCollection(data.collection.id, itemId);
        }

        // 2) rimozioni
        for (const itemId of pickDiff.remove) {
            const row = data.items.find(it => it.item.id === itemId);
            if (!row) continue;
            await removeItemFromCollection(row.id);
        }

        // 3) refetch atomico
        const { sections } = await reloadSectionsAndItems(data.collection.id);

        // 4) UX: active section
        setActiveSectionId(prev => prev ?? sections[0]?.id ?? null);

        // 5) reset + close
        setPickDiff({ add: [], remove: [] });
        setDrawer({ type: "none" });
    };

    /* ---------------------------------------------------------------------
     * RENDER GUARD
     * ------------------------------------------------------------------- */
    if (!isOpen || !collectionId) return null;

    /* ---------------------------------------------------------------------
     * RENDER
     * ------------------------------------------------------------------- */
    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-builder-title"
            onClick={handleCloseModal}
        >
            <div
                className={styles.modal}
                ref={modalRef}
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
            >
                {/* HEADER */}
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-md" weight={600}>
                            {data?.collection.name ?? "Collezione"}
                        </Text>

                        <div className={styles.tabs} role="tablist">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === "content"}
                                className={tab === "content" ? styles.tabActive : styles.tab}
                                onClick={() => setTab("content")}
                            >
                                <Text weight={600}>Contenuto</Text>
                            </button>

                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === "style"}
                                className={tab === "style" ? styles.tabActive : styles.tab}
                                onClick={() => setTab("style")}
                            >
                                <Text weight={600}>Stile</Text>
                            </button>
                        </div>
                    </div>

                    <div className={styles.headerRight}>
                        {tab === "content" ? (
                            <Button onClick={() => setTab("style")} label="Anteprima" />
                        ) : (
                            <div className={styles.deviceGroup} role="radiogroup">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={mode === "mobile"}
                                    className={
                                        mode === "mobile" ? styles.deviceActive : styles.device
                                    }
                                    onClick={() => setMode("mobile")}
                                >
                                    <Smartphone size={20} />
                                </button>

                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={mode === "tablet"}
                                    className={
                                        mode === "tablet" ? styles.deviceActive : styles.device
                                    }
                                    onClick={() => setMode("tablet")}
                                >
                                    <Tablet size={20} />
                                </button>

                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={mode === "desktop"}
                                    className={
                                        mode === "desktop" ? styles.deviceActive : styles.device
                                    }
                                    onClick={() => setMode("desktop")}
                                >
                                    <Laptop />
                                </button>
                            </div>
                        )}

                        {tab === "style" && (
                            <Button variant="primary" onClick={handleSaveStyle} label="Salva" />
                        )}

                        <Button variant="secondary" onClick={handleCloseModal} label="Chiudi" />
                    </div>
                </header>

                {/* BODY */}
                <div className={`${styles.body} ${!isSidebarOpen ? styles.bodyCollapsed : ""}`}>
                    <button
                        type="button"
                        className={styles.collapseToggle}
                        aria-label={isSidebarOpen ? "Nascondi pannello" : "Mostra pannello"}
                        onClick={() => setIsSidebarOpen(v => !v)}
                    >
                        {isSidebarOpen ? <ChevronLeft /> : <ChevronRight />}
                    </button>

                    {/* LEFT */}
                    <aside className={styles.left}>
                        {tab === "content" ? (
                            sections.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Text variant="title-sm" weight={600}>
                                        La tua collezione è vuota
                                    </Text>
                                    <Text colorVariant="muted">
                                        Aggiungi elementi dal catalogo per creare automaticamente le
                                        categorie.
                                    </Text>
                                    <Button
                                        variant="primary"
                                        label="Aggiungi elementi"
                                        onClick={() => {
                                            setAddDrawerTab("pick");
                                            setDrawer({ type: "add", defaultTab: "pick" });
                                        }}
                                    />
                                </div>
                            ) : (
                                <CollectionSectionsPanel
                                    sections={sections}
                                    activeSectionId={activeSectionId}
                                    onSelectSection={setActiveSectionId}
                                    onReorderSections={handleReorderSections}
                                    onRenameSection={handleRenameSection}
                                    onDeleteSection={handleDeleteSection}
                                />
                            )
                        ) : (
                            <CollectionStylePanel
                                styleDraft={styleDraft}
                                resolvedStyle={resolvedStyle}
                                onChange={next => setStyleDraft(prev => ({ ...prev, ...next }))}
                            />
                        )}
                    </aside>

                    {/* RIGHT */}
                    <section className={styles.right}>
                        {tab === "content" && (
                            <>
                                <SectionItemsPanel
                                    sectionLabel={
                                        sections.find(s => s.id === activeSectionId)?.label ?? ""
                                    }
                                    items={itemsInActiveSection}
                                    onToggleVisibility={handleToggleVisibility}
                                    onAddItem={() => {
                                        setAddDrawerTab("pick");
                                        setDrawer({ type: "add", defaultTab: "pick" });
                                    }}
                                    onEditItem={row => {
                                        setEditingItem(row.item);
                                        setDrawer({ type: "edit" });
                                    }}
                                    onRemoveItem={async collectionItemId => {
                                        if (!data) return;

                                        try {
                                            const removedItem = items.find(
                                                it => it.id === collectionItemId
                                            );
                                            if (!removedItem) return;

                                            await removeItemFromCollection(collectionItemId);
                                            await refreshItems(data.collection.id);

                                            showToast({
                                                message: "Elemento rimosso dalla categoria.",
                                                type: "success",
                                                duration: 4000,
                                                actionLabel: "Annulla",
                                                onAction: async () => {
                                                    try {
                                                        await addItemToCollection(
                                                            removedItem.collection_id,
                                                            removedItem.item.id
                                                        );

                                                        await refreshItems(data.collection.id);
                                                    } catch (e) {
                                                        console.error(
                                                            "Errore aggiunta business:",
                                                            e
                                                        );
                                                        showToast({
                                                            message:
                                                                "Errore durante il ripristino dell'elemento.",
                                                            type: "error",
                                                            duration: 2500
                                                        });
                                                    }
                                                }
                                            });
                                        } catch (e) {
                                            console.error("Errore rimozione elemento:", e);
                                            showToast({
                                                message:
                                                    "Errore durante la rimozione dell'elemento.",
                                                type: "error",
                                                duration: 2500
                                            });
                                        }
                                    }}
                                    onReorder={handleReorder}
                                />

                                {/* DRAWER */}
                                <Drawer
                                    isOpen={drawer.type !== "none"}
                                    title={
                                        drawer.type === "edit"
                                            ? "Modifica elemento"
                                            : "Aggiungi elemento"
                                    }
                                    onClose={closeDrawer}
                                    footer={
                                        drawer.type === "add" && addDrawerTab === "pick" ? (
                                            <Button
                                                variant="primary"
                                                label="Applica modifiche"
                                                disabled={
                                                    pickDiff.add.length === 0 &&
                                                    pickDiff.remove.length === 0
                                                }
                                                onClick={applyPickDiff}
                                            />
                                        ) : drawer.type === "add" && addDrawerTab === "create" ? (
                                            <Button
                                                variant="primary"
                                                label="Crea elemento"
                                                onClick={() => createItemRef.current?.submit()}
                                            />
                                        ) : drawer.type === "edit" ? (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    label="Annulla"
                                                    onClick={closeDrawer}
                                                />
                                                <Button
                                                    variant="primary"
                                                    label="Salva modifiche"
                                                    onClick={() => editItemRef.current?.submit()}
                                                />
                                            </>
                                        ) : null
                                    }
                                >
                                    {drawer.type === "add" && data && (
                                        <AddItemDrawer
                                            createRef={createItemRef}
                                            collectionType={normalizedCollectionType}
                                            existingItemIds={existingItemIds}
                                            defaultTab={drawer.defaultTab ?? "pick"}
                                            onPickDiffChange={setPickDiff}
                                            onTabChange={setAddDrawerTab}
                                            onCreate={async payload => {
                                                if (!data) return;

                                                const item = await createItem(payload);
                                                await addItemToCollection(
                                                    data.collection.id,
                                                    item.id
                                                );

                                                await reloadSectionsAndItems(data.collection.id);
                                                setDrawer({ type: "none" });
                                            }}
                                        />
                                    )}

                                    {drawer.type === "edit" && editingItem && (
                                        <EditItemDrawer
                                            ref={editItemRef}
                                            item={editingItem}
                                            collectionType={normalizedCollectionType}
                                            onSubmit={async payload => {
                                                // 1) aggiorna item globale
                                                await updateItem(payload.id, {
                                                    name: payload.name,
                                                    description: payload.description ?? null,
                                                    base_price: payload.base_price ?? null,
                                                    duration: payload.duration ?? null
                                                });

                                                // 2) refresh lista in collection
                                                if (data) await refreshItems(data.collection.id);

                                                // 3) chiudi
                                                closeDrawer();

                                                showToast({
                                                    type: "success",
                                                    message: "Elemento aggiornato",
                                                    duration: 2500
                                                });
                                            }}
                                        />
                                    )}
                                </Drawer>
                            </>
                        )}

                        {tab === "style" && (
                            <CollectionPreviewFrame mode={mode}>
                                <CollectionView
                                    mode="preview"
                                    businessName="PREVIEW"
                                    businessImage=""
                                    collectionTitle={data?.collection.name ?? "Collezione"}
                                    sections={sections.map(s => ({
                                        id: s.id,
                                        name: s.label,
                                        items: items
                                            .filter(ci => ci.visible && ci.section_id === s.id)
                                            .sort((a, b) => a.order_index - b.order_index)
                                            .map(ci => ({
                                                id: ci.id,
                                                name: ci.item.name,
                                                description: ci.item.description ?? null,
                                                image: ci.item.metadata?.image ?? null,
                                                price:
                                                    ci.item.base_price != null
                                                        ? Number(ci.item.base_price)
                                                        : null
                                            }))
                                    }))}
                                    style={resolvedStyle}
                                />
                            </CollectionPreviewFrame>
                        )}
                    </section>
                </div>

                {loading && (
                    <div className={styles.loadingOverlay} aria-live="polite">
                        <Text>Caricamento…</Text>
                    </div>
                )}
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------
 * UTILS
 * ---------------------------------------------------------------------- */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selectors = [
        "a[href]",
        "button:not([disabled])",
        "textarea:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        '[tabindex]:not([tabindex="-1"])'
    ];

    return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(",")));
}
