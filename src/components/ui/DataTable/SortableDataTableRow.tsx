import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

    return (
        <div ref={setNodeRef} style={style} data-dragging={isDragging || undefined} {...attributes}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(
                        child as React.ReactElement<{ dragHandleProps?: unknown }>,
                        { dragHandleProps: listeners }
                    );
                }
                return child;
            })}
        </div>
    );
}
