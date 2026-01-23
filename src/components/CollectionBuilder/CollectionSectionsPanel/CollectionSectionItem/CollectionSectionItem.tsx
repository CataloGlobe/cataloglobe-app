import { memo, useEffect, useRef, useState } from "react";
import { CollectionSection } from "@/types/database";
import Text from "@/components/ui/Text/Text";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { IconButton } from "@/components/ui/Button/IconButton";
import { DraggableSyntheticListeners } from "@dnd-kit/core";
import styles from "../CollectionSectionsPanel.module.scss";

interface CollectionSectionItemProps {
    section: CollectionSection;
    isActive: boolean;
    listeners: DraggableSyntheticListeners;
    onSelect: (id: string) => void;
    onRename: (id: string, label: string) => Promise<void> | void;
    onDelete: (section: CollectionSection) => void;
}

function CollectionSectionItemComponent({
    section,
    isActive,
    listeners,
    onSelect,
    onRename,
    onDelete
}: CollectionSectionItemProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(section.label);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing]);

    const commitRename = async () => {
        const next = draft.trim();
        if (!next || next === section.label.trim()) {
            setDraft(section.label);
            setEditing(false);
            return;
        }
        await onRename(section.id, next);
        setEditing(false);
    };

    return (
        <div className={styles.row}>
            {/* SELECT AREA */}
            <button
                type="button"
                className={isActive ? styles.active : styles.select}
                onClick={() => onSelect(section.id)}
                aria-current={isActive ? "true" : undefined}
            >
                <GripVertical size={16} {...listeners} className={styles.dragHandle} aria-hidden />

                {editing ? (
                    <TextInput
                        ref={inputRef}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void commitRename();
                            }
                            if (e.key === "Escape") {
                                e.preventDefault();
                                setDraft(section.label);
                                setEditing(false);
                            }
                        }}
                    />
                ) : (
                    <Text>{section.label}</Text>
                )}
            </button>

            {/* ACTIONS */}
            {!editing && (
                <div className={styles.actions}>
                    <IconButton
                        variant="ghost"
                        icon={<Pencil size={14} />}
                        aria-label="Modifica categoria"
                        onClick={() => setEditing(true)}
                    />
                    <IconButton
                        variant="ghost"
                        icon={<Trash2 size={14} />}
                        aria-label="Elimina categoria"
                        onClick={() => onDelete(section)}
                    />
                </div>
            )}
        </div>
    );
}

export const CollectionSectionItem = memo(CollectionSectionItemComponent);
