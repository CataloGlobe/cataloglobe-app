import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import {
    IconChevronRight,
    IconDotsVertical,
    IconFolder,
    IconGripVertical,
    IconTrash
} from "@tabler/icons-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
};

export function CatalogTreeNode({
    flatNode,
    selected,
    onSelect,
    onToggleExpand,
    onCreateSubCategory,
    onEditCategory,
    onDeleteCategory,
    disabled = false
}: CatalogTreeNodeProps) {
    const { node, depth, hasChildren, isExpanded } = flatNode;

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: node.id,
        disabled
    });

    return (
        <div
            ref={setNodeRef}
            className={`${styles.treeNodeRow} ${selected ? styles.treeNodeRowActive : ""} ${
                isDragging ? styles.treeNodeRowDragging : ""
            }`}
            style={{
                transform: CSS.Transform.toString(transform),
                transition
            }}
        >
            <div className={styles.treeNodeMain} style={{ paddingLeft: `${12 + depth * 18}px` }}>
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
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button className={styles.treeMenuTrigger} aria-label="Azioni categoria">
                                <IconDotsVertical size={14} />
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                className={styles.dropdownContent}
                                align="end"
                                sideOffset={4}
                            >
                                <DropdownMenu.Item
                                    className={styles.dropdownItem}
                                    onClick={() => onEditCategory(node.id)}
                                >
                                    Modifica
                                </DropdownMenu.Item>
                                {node.level < 3 && (
                                    <DropdownMenu.Item
                                        className={styles.dropdownItem}
                                        onClick={() => onCreateSubCategory(node.id)}
                                    >
                                        Crea sotto-categoria
                                    </DropdownMenu.Item>
                                )}
                                <DropdownMenu.Separator className={styles.dropdownSeparator} />
                                <DropdownMenu.Item
                                    className={`${styles.dropdownItem} ${styles.danger}`}
                                    onClick={() => onDeleteCategory(node.id)}
                                >
                                    <IconTrash size={14} />
                                    Elimina
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>
            </div>
        </div>
    );
}
