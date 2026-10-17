import type React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import type { CatalogOrderItem } from "@/services/supabase/catalogOrder";
import styles from "./CatalogOrderDrawer.module.scss";

/** Una riga del pannello dell'ordine: maniglia, posizione, nome, frecce. */
export function CatalogOrderRow({
  item,
  index,
  last,
  onMove,
}: {
  item: CatalogOrderItem;
  index: number;
  last: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={styles.row}
      data-dragging={isDragging || undefined}
    >
      <button
        type="button"
        className={styles.handle}
        aria-label={`Trascina ${item.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <span className={styles.pos} aria-hidden>
        {index + 1}
      </span>
      <span className={styles.name}>{item.name}</span>
      <button
        type="button"
        className={styles.arrow}
        aria-label={`Sposta su ${item.name}`}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        className={styles.arrow}
        aria-label={`Sposta giù ${item.name}`}
        disabled={last}
        onClick={() => onMove(index, index + 1)}
      >
        <ChevronDown size={16} />
      </button>
    </li>
  );
}
