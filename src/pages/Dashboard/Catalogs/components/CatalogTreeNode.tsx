import { useId } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { IconChevronRight, IconFolder, IconFolderOpen, IconGripVertical, IconListDetails } from "@tabler/icons-react";
import { Badge } from "@/components/ui/Badge/Badge";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Text from "@/components/ui/Text/Text";
import styles from "../CatalogEngine.module.scss";
import { CatalogTreeFlatNode, CatalogTreeLabels } from "./CatalogTree.types";
import { categoryActions } from "./categoryActions";

type CatalogTreeNodeProps = {
    flatNode: CatalogTreeFlatNode;
    selected: boolean;
    labels: CatalogTreeLabels;
    onSelect: (categoryId: string) => void;
    onToggleExpand: (categoryId: string) => void;
    onCreateSubCategory: (categoryId: string) => void;
    onRenameCategory: (categoryId: string) => void;
    onMoveCategory: (categoryId: string) => void;
    onDeleteCategory: (categoryId: string) => void;
    structureLockReason?: string;
    disabled?: boolean;
    readOnly?: boolean;
    isDescendantOfDragging?: boolean;
    dropPosition?: "before" | "inside" | "after" | null;
    isValidInsideTarget?: boolean;
};

/**
 * Una riga dell'albero delle categorie: piatta, 32 px (40 sul telefono) come
 * la voce della sidebar, perché l'albero è navigazione. Slot fissi da
 * sinistra: maniglia (una colonna sola per tutti i livelli) · rientro con le
 * linee guida · chevron · icona · nome · contatore/kebab. Il nome sceglie, il
 * chevron espande: due bersagli distinti. Il kebab prende il posto del
 * contatore al passaggio, al focus e sulla riga scelta, così il nome al terzo
 * livello resta intero anche a 280.
 */
export function CatalogTreeNode({
    flatNode,
    selected,
    labels,
    onSelect,
    onToggleExpand,
    onCreateSubCategory,
    onRenameCategory,
    onMoveCategory,
    onDeleteCategory,
    structureLockReason,
    disabled = false,
    readOnly = false,
    isDescendantOfDragging = false,
    dropPosition = null,
    isValidInsideTarget = false
}: CatalogTreeNodeProps) {
    const { node, depth, hasChildren, isExpanded } = flatNode;
    const countId = useId();

    // Cartella per chi ha figli (aperta quando è espansa), elenco per le foglie:
    // si legge a colpo d'occhio cosa contiene altre categorie e cosa prodotti.
    const TypeIcon = hasChildren ? (isExpanded ? IconFolderOpen : IconFolder) : IconListDetails;

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: node.id,
        disabled
    });

    const total = node.totalProductCount;
    const inChildren = total - node.directProductCount;
    const products = (n: number) => `${n} ${n === 1 ? labels.product : labels.productPlural}`;
    // Il numero sulla riga è il totale con le sotto-categorie; la testata della
    // categoria conta solo i suoi. Quando differiscono, lo dice la descrizione.
    const countDescription =
        total === 0
            ? "vuota: i clienti non la vedono"
            : inChildren > 0
                ? `${products(total)}, ${inChildren} nelle sotto-${labels.categoryPlural}`
                : products(total);

    const className = [
        styles.treeRow,
        selected ? styles.treeRowSelected : "",
        isDragging ? styles.treeRowDragging : "",
        isDescendantOfDragging ? styles.treeRowChildDragging : "",
        dropPosition === "before" ? styles.dropBefore : "",
        dropPosition === "after" ? styles.dropAfter : "",
        dropPosition === "inside" && isValidInsideTarget ? styles.dropInside : "",
        dropPosition === "inside" && !isValidInsideTarget ? styles.dropInsideInvalid : ""
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <li
            ref={setNodeRef}
            className={className}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                "--tree-depth": depth
            } as React.CSSProperties}
        >
            {!readOnly && (
                <button
                    type="button"
                    className={styles.treeHandle}
                    aria-label={`Riordina ${node.name}`}
                    disabled={disabled}
                    {...attributes}
                    {...listeners}
                >
                    <IconGripVertical size={14} />
                </button>
            )}

            <span className={styles.treeIndent} aria-hidden="true" />

            {hasChildren ? (
                <button
                    type="button"
                    className={`${styles.treeExpand} ${isExpanded ? styles.treeExpandOpen : ""}`}
                    onClick={() => onToggleExpand(node.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Comprimi" : "Espandi"} ${node.name}`}
                >
                    <IconChevronRight size={14} />
                </button>
            ) : (
                <span className={styles.treeExpandSpacer} aria-hidden="true" />
            )}

            <TypeIcon size={16} stroke={1.75} className={styles.treeIcon} aria-hidden="true" />

            <button
                type="button"
                className={styles.treeSelect}
                onClick={() => onSelect(node.id)}
                aria-current={selected ? "true" : undefined}
                aria-describedby={countId}
            >
                <Text as="span" variant="body-sm" weight={selected ? 600 : 500} className={styles.treeLabel}>
                    {node.name}
                </Text>
            </button>

            <span className={styles.treeTrailing}>
                <span className={styles.treeCount}>
                    <span aria-hidden="true">
                        {total === 0 ? (
                            <Badge variant="outline">vuota</Badge>
                        ) : (
                            <Badge variant="neutral" className={styles.treeBadge}>
                                {total}
                            </Badge>
                        )}
                    </span>
                    <span id={countId} className={styles.srOnly}>
                        {countDescription}
                    </span>
                </span>

                {!readOnly && (
                    <span className={styles.treeActions}>
                        <TableRowActions
                            ariaLabel={`Azioni ${node.name}`}
                            actions={categoryActions({
                                level: node.level,
                                categoryLabel: labels.category,
                                structureLockReason,
                                onRename: () => onRenameCategory(node.id),
                                onMove: () => onMoveCategory(node.id),
                                onCreateSub: () => onCreateSubCategory(node.id),
                                onDelete: () => onDeleteCategory(node.id)
                            })}
                        />
                    </span>
                )}
            </span>
        </li>
    );
}
