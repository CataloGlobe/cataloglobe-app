import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { IconChevronRight, IconFolder, IconGripVertical, IconTrash } from "@tabler/icons-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import styles from "../CatalogEngine.module.scss";
import { CatalogTreeFlatNode } from "./CatalogTree.types";

type CatalogTreeNodeProps = {
    flatNode: CatalogTreeFlatNode;
    selected: boolean;
    onSelect: (categoryId: string) => void;
    onToggleExpand: (categoryId: string) => void;
    onCreateSubCategory: (categoryId: string) => void;
    onEditCategory: (categoryId: string) => void;
    onDeleteCategory: (categoryId: string) => void;
    disabled?: boolean;
    isDescendantOfDragging?: boolean;
    dropPosition?: "before" | "inside" | "after" | null;
    isValidInsideTarget?: boolean;
};

export function CatalogTreeNode({
    flatNode,
    selected,
    onSelect,
    onToggleExpand,
    onCreateSubCategory,
    onEditCategory,
    onDeleteCategory,
    disabled = false,
    isDescendantOfDragging = false,
    dropPosition = null,
    isValidInsideTarget = false
}: CatalogTreeNodeProps) {
    const { node, depth, hasChildren, isExpanded } = flatNode;

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: node.id,
        disabled
    });

    const className = [
        styles.treeNodeRow,
        selected ? styles.treeNodeRowActive : "",
        isDragging ? styles.treeNodeRowDragging : "",
        depth === 0 ? styles.treeNodeDepth0 : "",
        isDescendantOfDragging ? styles.treeNodeChildDragging : "",
        dropPosition === "before" ? styles.dropBefore : "",
        dropPosition === "after" ? styles.dropAfter : "",
        dropPosition === "inside" && isValidInsideTarget ? styles.dropInside : "",
        dropPosition === "inside" && !isValidInsideTarget ? styles.dropInsideInvalid : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            ref={setNodeRef}
            className={className}
            style={{
                transform: CSS.Transform.toString(transform),
                transition
            }}
        >
            {/* data-depth drives the ::before guide-line in SCSS; --tree-depth feeds the depth-aware calc() */}
            <div
                className={styles.treeNodeMain}
                data-depth={depth}
                style={{
                    paddingLeft: `${8 + depth * 20}px`,
                    "--tree-depth": depth
                } as React.CSSProperties}
            >
                <button
                    type="button"
                    className={styles.treeDragHandle}
                    aria-label="Riordina categoria"
                    disabled={disabled}
                    {...attributes}
                    {...listeners}
                >
                    <IconGripVertical size={14} />
                </button>

                {hasChildren ? (
                    <button
                        type="button"
                        className={`${styles.treeExpandBtn} ${isExpanded ? styles.treeExpandOpen : ""}`}
                        onClick={() => onToggleExpand(node.id)}
                        aria-label={isExpanded ? "Comprimi categoria" : "Espandi categoria"}
                    >
                        <IconChevronRight size={14} />
                    </button>
                ) : (
                    <span className={styles.treeExpandSpacer} />
                )}

                <button
                    type="button"
                    className={styles.treeSelectBtn}
                    onClick={() => onSelect(node.id)}
                    aria-current={selected ? "true" : undefined}
                >
                    <span className={styles.treeLabelIcon} aria-hidden="true">
                        <IconFolder size={15} />
                    </span>
                    <Text
                        variant="body-sm"
                        weight={selected ? 600 : 500}
                        className={styles.treeLabelText}
                    >
                        {node.name}
                    </Text>
                </button>
            </div>

            <div className={styles.treeNodeMeta}>
                <span className={styles.treeNodeCount}>{node.totalProductCount}</span>

                <div className={styles.treeNodeActions}>
                    <TableRowActions
                        actions={[
                            { label: "Modifica", onClick: () => onEditCategory(node.id) },
                            {
                                label: "Crea sotto-categoria",
                                onClick: () => onCreateSubCategory(node.id),
                                hidden: node.level >= 3
                            },
                            {
                                label: "Elimina",
                                icon: IconTrash,
                                onClick: () => onDeleteCategory(node.id),
                                variant: "destructive",
                                separator: true
                            }
                        ]}
                    />
                </div>
            </div>
        </div>
    );
}
