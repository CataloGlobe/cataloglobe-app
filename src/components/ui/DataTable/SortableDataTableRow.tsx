import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import styles from "./DataTable.module.scss";

interface SortableDataTableRowProps {
    id: string;
    children: React.ReactNode;
    draggingOpacity?: number;
}

export function SortableDataTableRow({
    id,
    children,
    draggingOpacity = 0.5
}: SortableDataTableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
        position: "relative",
        opacity: isDragging ? draggingOpacity : 1
    };

    // Gli attributi di dnd-kit (`role="button"`, `tabIndex`, la descrizione
    // del trascinamento) vanno alla maniglia insieme ai listener: la maniglia
    // è l'unico controllo della riga. Sulla riga ne facevano un bottone
    // focalizzabile che conteneva altri bottoni e non rispondeva alla tastiera.
    const dragHandleProps = { ...attributes, ...listeners };

    return (
        <div ref={setNodeRef} style={style} data-dragging={isDragging || undefined}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(
                        child as React.ReactElement<{ dragHandleProps?: unknown }>,
                        { dragHandleProps }
                    );
                }
                return child;
            })}
        </div>
    );
}

/**
 * Maniglia di riordino: 16px, `gray-400`, cursore grab. Va nella cella della
 * colonna di riordino, con i `dragHandleProps` che `SortableDataTableRow`
 * passa al cell render (quarto argomento di `cell`): attributi e listener,
 * quindi è lei il controllo, anche da tastiera (Spazio, frecce, Spazio).
 * Nome accessibile con la riga: `aria-label={`Riordina ${nome}`}`.
 */
export function DataTableDragHandle({
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            aria-label="Trascina per riordinare"
            className={`${styles.dragHandle} ${className ?? ""}`}
            {...props}
        >
            <GripVertical size={16} />
        </button>
    );
}
