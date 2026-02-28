import React, { useMemo, useState } from "react";
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove
} from "@dnd-kit/sortable";
import { IconFolder, IconPlus } from "@tabler/icons-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import styles from "../CatalogEngine.module.scss";
import { CatalogTreeNode } from "./CatalogTreeNode";
import { CatalogTreeFlatNode, CatalogTreeNodeData } from "./CatalogTree.types";

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
    onReorderSiblings: (parentCategoryId: string | null, orderedSiblingIds: string[]) => Promise<void>;
    isReordering?: boolean;
};

const ROOT_PARENT_KEY = "__root__";

function flattenVisibleNodes(
    nodes: CatalogTreeNodeData[],
    expandedCategoryIds: Set<string>,
    depth: number = 0
): CatalogTreeFlatNode[] {
    const output: CatalogTreeFlatNode[] = [];

    for (const node of nodes) {
        const hasChildren = node.children.length > 0;
        const isExpanded = hasChildren && expandedCategoryIds.has(node.id);

        output.push({
            node,
            depth,
            hasChildren,
            isExpanded
        });

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

            if (current.children.length > 0) {
                walk(current.children);
            }
        }
    };

    walk(nodes);
    return siblingMap;
}

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
    isReordering = false
}: CatalogTreeProps) {
    const [isDragging, setIsDragging] = useState(false);

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
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={({ active, over }) => {
                        setIsDragging(false);
                        if (!over || active.id === over.id) return;

                        const activeNode = visibleNodes.find(item => item.node.id === active.id)?.node;
                        const overNode = visibleNodes.find(item => item.node.id === over.id)?.node;

                        if (!activeNode || !overNode) return;

                        if (activeNode.parent_category_id !== overNode.parent_category_id) {
                            return;
                        }

                        const parentKey = activeNode.parent_category_id ?? ROOT_PARENT_KEY;
                        const siblings = siblingMap.get(parentKey) ?? [];

                        const oldIndex = siblings.indexOf(activeNode.id);
                        const newIndex = siblings.indexOf(overNode.id);
                        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

                        const reordered = arrayMove(siblings, oldIndex, newIndex);
                        void onReorderSiblings(activeNode.parent_category_id, reordered);
                    }}
                    onDragCancel={() => setIsDragging(false)}
                >
                    <SortableContext items={visibleNodeIds} strategy={verticalListSortingStrategy}>
                        <div className={styles.treeList}>
                            {visibleNodes.map(flatNode => (
                                <CatalogTreeNode
                                    key={flatNode.node.id}
                                    flatNode={flatNode}
                                    selected={selectedCategoryId === flatNode.node.id}
                                    onSelect={onSelectCategory}
                                    onToggleExpand={onToggleExpand}
                                    onCreateSubCategory={onCreateSubCategory}
                                    onEditCategory={onEditCategory}
                                    onDeleteCategory={onDeleteCategory}
                                    disabled={isReordering || isDragging}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}

