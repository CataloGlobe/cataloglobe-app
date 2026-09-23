import { useMemo, useRef, useState } from "react";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors,
    type Announcements,
    type ClientRect
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
    sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import styles from "../CatalogEngine.module.scss";
import { CatalogTreeNode } from "./CatalogTreeNode";
import { CatalogTreeFlatNode, CatalogTreeLabels, CatalogTreeNodeData } from "./CatalogTree.types";

type DropPosition = "before" | "inside" | "after";

type CatalogTreeProps = {
    nodes: CatalogTreeNodeData[];
    selectedCategoryId: string | null;
    expandedCategoryIds: Set<string>;
    onToggleExpand: (categoryId: string) => void;
    onSelectCategory: (categoryId: string) => void;
    onCreateSubCategory: (categoryId: string) => void;
    onRenameCategory: (categoryId: string) => void;
    onMoveCategory: (categoryId: string) => void;
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
    /** Sola lettura (`catalogs.write` assente): niente «+», kebab né trascinamento. */
    readOnly?: boolean;
    labels: CatalogTreeLabels;
    /**
     * Con la bozza aperta: i gesti che scrivono subito si spengono col perché,
     * e il trascinamento cambia solo l'ordine fra sorelle, non il livello.
     */
    structureLockReason?: string;
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
    onCreateSubCategory,
    onRenameCategory,
    onMoveCategory,
    onDeleteCategory,
    onReorderSiblings,
    onReparent,
    isReordering = false,
    readOnly = false,
    labels,
    structureLockReason
}: CatalogTreeProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);

    const pointerYRef = useRef<number>(0);
    const cleanupPointerRef = useRef<(() => void) | null>(null);
    // Da tastiera non c'è un puntatore da cui leggere sopra/dentro/sotto (#262):
    // il rilascio si decide dalla direzione, e solo fra sorelle.
    const keyboardDragRef = useRef(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

    const nameOf = (id: string | number | undefined) =>
        visibleNodes.find(fn => fn.node.id === id)?.node.name ?? "";

    const sameParent = (a: string | number, b: string | number) => {
        const nodeA = visibleNodes.find(fn => fn.node.id === a)?.node;
        const nodeB = visibleNodes.find(fn => fn.node.id === b)?.node;
        return Boolean(nodeA && nodeB && nodeA.parent_category_id === nodeB.parent_category_id);
    };

    const announcements: Announcements = {
        onDragStart: ({ active }) =>
            `Sposti ${nameOf(active.id)}. Frecce su e giù per cambiare posto, Invio per lasciarla, Esc per annullare.`,
        onDragOver: ({ active, over }) =>
            over && over.id !== active.id
                ? sameParent(active.id, over.id)
                    ? `Vicino a ${nameOf(over.id)}.`
                    : `${nameOf(over.id)} è a un altro livello: da tastiera si riordina fra ${labels.categoryPlural} dello stesso livello.`
                : undefined,
        onDragEnd: ({ active, over }) =>
            over && over.id !== active.id && sameParent(active.id, over.id)
                ? `${nameOf(active.id)} spostata vicino a ${nameOf(over.id)}. Si salva con Salva.`
                : `${nameOf(active.id)} resta dov'era.`,
        onDragCancel: ({ active }) => `Spostamento annullato: ${nameOf(active.id)} resta dov'era.`
    };

    if (visibleNodes.length === 0) {
        return (
            <EmptyState
                variant="inline"
                title={`Nessuna ${labels.category}`}
                description={
                    readOnly
                        ? undefined
                        : `Crea la prima con «+». Le ${labels.categoryPlural} si annidano fino a tre livelli.`
                }
            />
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{
                announcements,
                screenReaderInstructions: {
                    draggable: `Spazio per prendere la ${labels.category}, frecce per spostarla, Spazio per lasciarla, Esc per annullare.`
                }
            }}
            onDragStart={({ active, activatorEvent }) => {
                setActiveId(active.id as string);
                keyboardDragRef.current = activatorEvent instanceof KeyboardEvent;
                const handler = (e: PointerEvent) => {
                    pointerYRef.current = e.clientY;
                };
                window.addEventListener("pointermove", handler);
                cleanupPointerRef.current = () => window.removeEventListener("pointermove", handler);
            }}
            onDragOver={({ over }) => {
                setOverId(over ? (over.id as string) : null);
                if (!over) setDropPosition(null);
            }}
            onDragMove={({ over }) => {
                if (over && !keyboardDragRef.current) {
                    setDropPosition(computeDropPos(over.rect, pointerYRef.current));
                }
            }}
            onDragEnd={({ active, over }) => {
                cleanupPointerRef.current?.();
                cleanupPointerRef.current = null;
                const byKeyboard = keyboardDragRef.current;
                keyboardDragRef.current = false;

                const activeIndex = visibleNodeIds.indexOf(active.id as string);
                const overIndex = over ? visibleNodeIds.indexOf(over.id as string) : -1;
                const finalDropPos: DropPosition | null = !over
                    ? null
                    : byKeyboard
                        ? overIndex > activeIndex
                            ? "after"
                            : "before"
                        : computeDropPos(over.rect, pointerYRef.current);

                resetDragState();

                if (!over || !finalDropPos || active.id === over.id) return;

                const activeItemNode = visibleNodes.find(fn => fn.node.id === active.id)?.node;
                const overItemNode = visibleNodes.find(fn => fn.node.id === over.id)?.node;

                if (!activeItemNode || !overItemNode) return;
                if (draggingDescendantIds.has(overItemNode.id)) return;

                const siblings = activeItemNode.parent_category_id === overItemNode.parent_category_id;

                if ((finalDropPos === "before" || finalDropPos === "after") && siblings) {
                    // Riordino fra sorelle: in bozza.
                    const parentKey = activeItemNode.parent_category_id ?? ROOT_PARENT_KEY;
                    const siblingIds = siblingMap.get(parentKey) ?? [];
                    const oldIndex = siblingIds.indexOf(activeItemNode.id);
                    const newIndex = siblingIds.indexOf(overItemNode.id);
                    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
                    void onReorderSiblings(activeItemNode.parent_category_id, arrayMove(siblingIds, oldIndex, newIndex));
                    return;
                }

                // Da tastiera si riordina soltanto: cambiare livello è «Sposta in…».
                // Con la bozza aperta nemmeno col puntatore: scrive subito (#261).
                if (byKeyboard || structureLockReason || !onReparent) return;

                if (finalDropPos === "inside") {
                    if (!validParentIds.has(overItemNode.id) || overItemNode.level >= 3) return;
                } else {
                    const newParentId = overItemNode.parent_category_id ?? null;
                    if (!validParentIds.has(newParentId)) return;
                }

                void onReparent(activeItemNode.id, overItemNode.id, finalDropPos);
            }}
            onDragCancel={() => {
                cleanupPointerRef.current?.();
                cleanupPointerRef.current = null;
                keyboardDragRef.current = false;
                resetDragState();
            }}
        >
            <SortableContext items={visibleNodeIds} strategy={verticalListSortingStrategy}>
                <ul
                    className={styles.treeList}
                    aria-label={labels.categoryPlural.charAt(0).toUpperCase() + labels.categoryPlural.slice(1)}
                >
                    {visibleNodes.map(flatNode => {
                        const isOverThisNode =
                            activeId !== null && overId === flatNode.node.id && overId !== activeId;
                        const nodeDropPos = isOverThisNode ? dropPosition : null;
                        const isValidInsideTarget =
                            !structureLockReason &&
                            nodeDropPos === "inside" &&
                            validParentIds.has(flatNode.node.id) &&
                            flatNode.node.level < 3;

                        return (
                            <CatalogTreeNode
                                key={flatNode.node.id}
                                flatNode={flatNode}
                                labels={labels}
                                selected={selectedCategoryId === flatNode.node.id}
                                onSelect={onSelectCategory}
                                onToggleExpand={onToggleExpand}
                                onCreateSubCategory={onCreateSubCategory}
                                onRenameCategory={onRenameCategory}
                                onMoveCategory={onMoveCategory}
                                structureLockReason={structureLockReason}
                                onDeleteCategory={onDeleteCategory}
                                disabled={readOnly || isReordering}
                                readOnly={readOnly}
                                isDescendantOfDragging={draggingDescendantIds.has(flatNode.node.id)}
                                dropPosition={nodeDropPos}
                                isValidInsideTarget={isValidInsideTarget}
                            />
                        );
                    })}
                </ul>
            </SortableContext>
            <DragOverlay>
                {activeNode ? <div className={styles.dragOverlayGhost}>{activeNode.node.name}</div> : null}
            </DragOverlay>
        </DndContext>
    );
}
