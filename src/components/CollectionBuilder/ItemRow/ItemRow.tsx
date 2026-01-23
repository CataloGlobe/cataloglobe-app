import Text from "@/components/ui/Text/Text";
import { IconButton } from "@/components/ui/Button/IconButton";
import { GripVertical } from "lucide-react";
import { ReactNode } from "react";
import { DraggableSyntheticListeners } from "@dnd-kit/core";
import styles from "./ItemRow.module.scss";

export interface ItemRowAction {
    icon: ReactNode;
    ariaLabel: string;
    onClick: () => void;
    variant?: "primary" | "secondary" | "danger";
}

export interface ItemRowProps {
    name: string;
    price?: number | null;

    dragHandleProps?: {
        listeners: DraggableSyntheticListeners;
    };

    actions: ItemRowAction[];
}

export function ItemRow({ name, price, dragHandleProps, actions }: ItemRowProps) {
    return (
        <li role="listitem" className={styles.itemRow}>
            <div className={styles.itemRowLeft}>
                {/* DRAG */}
                {dragHandleProps && (
                    <IconButton
                        className={styles.dragHandle}
                        icon={<GripVertical size={16} />}
                        aria-label="Riordina elemento"
                        {...dragHandleProps.listeners}
                    />
                )}

                {/* MAIN */}
                <div className={styles.itemMain}>
                    <Text weight={600}>{name}</Text>

                    {price != null && (
                        <Text variant="caption" colorVariant="muted">
                            € {price}
                        </Text>
                    )}
                </div>
            </div>

            {/* ACTIONS */}
            <div className={styles.itemActions}>
                {actions.map((action, index) => (
                    <IconButton
                        key={index}
                        variant={action.variant ?? "secondary"}
                        icon={action.icon}
                        aria-label={action.ariaLabel}
                        onClick={action.onClick}
                    />
                ))}
            </div>
        </li>
    );
}
