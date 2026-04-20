import React, { useMemo, useRef, useState } from "react";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors,
    type ClientRect
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { IconFolder, IconPlus } from "@tabler/icons-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import styles from "../CatalogEngine.module.scss";
import { CatalogTreeNode } from "./CatalogTreeNode";
import { CatalogTreeFlatNode, CatalogTreeNodeData } from "./CatalogTree.types";

type DropPosition = "before" | "inside" | "after";

type CatalogTreeProps = {
    nodes: CatalogTreeNodeData[];
    selectedCategoryId: string | null;
    expandedCategoryIds: Set<string>;
    onToggleExpand: (categoryId: string) => void;
    onSelectCategory: (categoryId: string) => void;
    onCreateRootCategory: () => void;
    onCreateSubCategory: (categoryId: string) => void;
    onEditCategory: (categoryId: string) => void;
    onDeleteCategory: (categoryId: string) => void;
    onReorderSiblings: (
        parentCategoryId: string | null,
        orderedSiblingIds: string[]
    ) => Promise<void>;
    onReparent?: (
        categoryId: string,
        targetId: string,
        position: DropPosition
    ) => Promise<void>;
    isReordering?: boolean;
};

const ROOT_PARENT_KEY = "__root__";

// ── Helpers ──────────────────────────────────────────────────────────────────

function flattenVisibleNodes(
    nodes: CatalogTreeNodeData[],
    expandedCategoryIds: Set<string>,
    depth: number = 0
): CatalogTreeFlatNode[] {
    const output: CatalogTreeFlatNode[] = [];
    for (const node of nodes) {
        const hasChildren = node.children.length > 0;
        const isExpanded = hasChildren && expandedCategoryIds.has(node.id);
        output.push({ node, depth, hasChildren, isExpanded });
        if (isExpanded) {
            output.push(...flattenVisibleNodes(node.children, expandedCategoryIds, depth + 1));
        }
    }
    return output;
}

function buildSiblingMap(nodes: CatalogTreeNodeData[]) {
    const siblingMap = new Map<string, string[]>();
    const walk = (currentNodes: CatalogTreeNodeData[]) => {
        for (const current of currentNodes) {
            const parentKey = current.parent_category_id ?? ROOT_PARENT_KEY;
            const siblings = siblingMap.get(parentKey) ?? [];
            siblings.push(current.id);
            siblingMap.set(parentKey, siblings);
            if (current.children.length > 0) walk(current.children);
        }
    };
    walk(nodes);
    return siblingMap;
}

function flattenAllNodes(nodes: CatalogTreeNodeData[]): CatalogTreeNodeData[] {
    const result: CatalogTreeNodeData[] = [];
    for (const node of nodes) {
        result.push(node);
        if (node.children.length > 0) result.push(...flattenAllNodes(node.children));
    }
    return result;
}

function getMaxDepthBelowTree(node: CatalogTreeNodeData): number {
    if (node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(c => getMaxDepthBelowTree(c)));
}

function computeDropPos(rect: ClientRect, pointerY: number): DropPosition {
    const relativeY = pointerY - rect.top;
    if (relativeY < rect.height * 0.25) return "before";
    if (relativeY > rect.height * 0.75) return "after";
    return "inside";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogTree({
    nodes,
    selectedCategoryId,
    expandedCategoryIds,
    onToggleExpand,
    onSelectCategory,
    onCreateRootCategory,
    onCreateSubCategory,
    onEditCategory,
    onDeleteCategory,
    onReorderSiblings,
    onReparent,
    isReordering = false
}: CatalogTreeProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);

    const pointerYRef = useRef<number>(0);
    const cleanupPointerRef = useRef<(() => void) | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor)
    );

    const visibleNodes = useMemo(
        () => flattenVisibleNodes(nodes, expandedCategoryIds),
        [nodes, expandedCategoryIds]
    );

    const siblingMap = useMemo(() => buildSiblingMap(nodes), [nodes]);

    const visibleNodeIds = useMemo(() => visibleNodes.map(item => item.node.id), [visibleNodes]);

    const activeNode = useMemo(
        () => (activeId ? (visibleNodes.find(fn => fn.node.id === activeId) ?? null) : null),
        [activeId, visibleNodes]
    );

    const draggingDescendantIds = useMemo((): Set<string> => {
        if (!activeNode) return new Set();
        const result = new Set<string>();
        const walk = (children: CatalogTreeNodeData[]) => {
            for (const child of children) {
                result.add(child.id);
                walk(child.children);
            }
        };
        walk(activeNode.node.children);
        return result;
    }, [activeNode]);

    // Set of node IDs (+ null for root) that can be valid new parents for the active node
    const validParentIds = useMemo((): Set<string | null> => {
        if (!activeNode) return new Set();
        const maxDepthBelow = getMaxDepthBelowTree(activeNode.node);
        const result = new Set<string | null>();
        // null = root → active would become level 1
        if (1 + maxDepthBelow <= 3) result.add(null);
        for (const node of flattenAllNodes(nodes)) {
            if (node.id === activeNode.node.id) continue;
            if (draggingDescendantIds.has(node.id)) continue;
            if (node.level + 1 + maxDepthBelow <= 3) result.add(node.id);
        }
        return result;
    }, [activeNode, nodes, draggingDescendantIds]);

    const resetDragState = () => {
        setActiveId(null);
        setOverId(null);
        setDropPosition(null);
    };

    return (
        <div className={styles.catalogTree}>
            <div className={styles.treeHeader}>
                <Text variant="caption" weight={700} className={styles.treeHeading}>
                    Albero categorie
                </Text>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={onCreateRootCategory}
                    aria-label="Crea categoria principale"
                >
                    <IconPlus size={14} />
                </Button>
            </div>

            {visibleNodes.length === 0 ? (
                <div className={styles.treeEmptyState}>
                    <IconFolder size={36} stroke={1.25} />
                    <Text variant="body-sm" weight={600}>
                        Nessuna categoria
                    </Text>
                    <Text variant="caption" colorVariant="muted">
                        Crea una categoria root per iniziare.
                    </Text>
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={({ active }) => {
                        setActiveId(active.id as string);
                        const handler = (e: PointerEvent) => {
                            pointerYRef.current = e.clientY;
                        };
                        window.addEventListener("pointermove", handler);
                        cleanupPointerRef.current = () =>
                            window.removeEventListener("pointermove", handler);
                    }}
                    onDragOver={({ over }) => {
                        const newOverId = over ? (over.id as string) : null;
                        setOverId(newOverId);
                        if (!over) setDropPosition(null);
                    }}
                    onDragMove={({ over }) => {
                        if (over) {
                            setDropPosition(computeDropPos(over.rect, pointerYRef.current));
                        }
                    }}
                    onDragEnd={({ active, over }) => {
                        cleanupPointerRef.current?.();
                        cleanupPointerRef.current = null;

                        const finalDropPos = over
                            ? computeDropPos(over.rect, pointerYRef.current)
                            : null;

                        resetDragState();

                        if (!over || !finalDropPos || active.id === over.id) return;

                        const activeItemNode = visibleNodes.find(
                            fn => fn.node.id === active.id
                        )?.node;
                        const overItemNode = visibleNodes.find(
                            fn => fn.node.id === over.id
                        )?.node;

                        if (!activeItemNode || !overItemNode) return;
                        if (draggingDescendantIds.has(overItemNode.id)) return;

                        const sameParent =
                            activeItemNode.parent_category_id ===
                            overItemNode.parent_category_id;

                        if (
                            (finalDropPos === "before" || finalDropPos === "after") &&
                            sameParent
                        ) {
                            // Reorder siblings — existing behaviour
                            const parentKey =
                                activeItemNode.parent_category_id ?? ROOT_PARENT_KEY;
                            const siblings = siblingMap.get(parentKey) ?? [];
                            const oldIndex = siblings.indexOf(activeItemNode.id);
                            const newIndex = siblings.indexOf(overItemNode.id);
                            if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
                            const reordered = arrayMove(siblings, oldIndex, newIndex);
                            void onReorderSiblings(activeItemNode.parent_category_id, reordered);
                            return;
                        }

                        // Reparenting — validate then delegate to CatalogEngine
                        if (!onReparent) return;

                        if (finalDropPos === "inside") {
                            // Target must be a valid parent and not already L3
                            if (
                                !validParentIds.has(overItemNode.id) ||
                                overItemNode.level >= 3
                            )
                                return;
                        } else {
                            // before/after cross-parent: new parent is overNode's parent
                            const newParentId = overItemNode.parent_category_id ?? null;
                            if (!validParentIds.has(newParentId)) return;
                        }

                        void onReparent(activeItemNode.id, overItemNode.id, finalDropPos);
                    }}
                    onDragCancel={() => {
                        cleanupPointerRef.current?.();
                        cleanupPointerRef.current = null;
                        resetDragState();
                    }}
                >
                    <SortableContext items={visibleNodeIds} strategy={verticalListSortingStrategy}>
                        <div className={styles.treeList}>
                            {useMemo(() => {
                                const groups: CatalogTreeFlatNode[][] = [];
                                let currentGroup: CatalogTreeFlatNode[] = [];

                                visibleNodes.forEach(flatNode => {
                                    if (flatNode.depth === 0) {
                                        if (currentGroup.length > 0) groups.push(currentGroup);
                                        currentGroup = [flatNode];
                                    } else {
                                        currentGroup.push(flatNode);
                                    }
                                });
                                if (currentGroup.length > 0) groups.push(currentGroup);

                                return groups.map((group, groupIdx) => (
                                    <div key={`group-${groupIdx}`} className={styles.treeGroup}>
                                        {group.map(flatNode => {
                                            const isOverThisNode =
                                                activeId !== null &&
                                                overId === flatNode.node.id &&
                                                overId !== activeId;
                                            const nodeDropPos = isOverThisNode
                                                ? dropPosition
                                                : null;
                                            const isValidInsideTarget =
                                                nodeDropPos === "inside" &&
                                                validParentIds.has(flatNode.node.id) &&
                                                flatNode.node.level < 3;

                                            return (
                                                <CatalogTreeNode
                                                    key={flatNode.node.id}
                                                    flatNode={flatNode}
                                                    selected={
                                                        selectedCategoryId === flatNode.node.id
                                                    }
                                                    onSelect={onSelectCategory}
                                                    onToggleExpand={onToggleExpand}
                                                    onCreateSubCategory={onCreateSubCategory}
                                                    onEditCategory={onEditCategory}
                                                    onDeleteCategory={onDeleteCategory}
                                                    disabled={isReordering || activeId !== null}
                                                    isDescendantOfDragging={draggingDescendantIds.has(
                                                        flatNode.node.id
                                                    )}
                                                    dropPosition={nodeDropPos}
                                                    isValidInsideTarget={isValidInsideTarget}
                                                />
                                            );
                                        })}
                                    </div>
                                ));
                            }, [
                                visibleNodes,
                                selectedCategoryId,
                                onSelectCategory,
                                onToggleExpand,
                                onCreateSubCategory,
                                onEditCategory,
                                onDeleteCategory,
                                isReordering,
                                activeId,
                                overId,
                                dropPosition,
                                draggingDescendantIds,
                                validParentIds
                            ])}
                        </div>
                    </SortableContext>
                    <DragOverlay>
                        {activeNode ? (
                            <div className={styles.dragOverlayGhost}>
                                <span className={styles.dragOverlayIcon}>
                                    <IconFolder size={15} />
                                </span>
                                <span className={styles.dragOverlayName}>
                                    {activeNode.node.name}
                                </span>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            )}
        </div>
    );
}
