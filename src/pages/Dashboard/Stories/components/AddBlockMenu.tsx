import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Type, Image, Video } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { StoryBlock } from "@/services/supabase/stories";
import styles from "./AddBlockMenu.module.scss";

interface AddBlockMenuProps {
    onAdd: (type: StoryBlock["type"]) => void;
    /** Disabilita la voce "Immagine" (tetto raggiunto: max 8 immagini per storia). */
    imageDisabled?: boolean;
}

const ITEMS: { type: StoryBlock["type"]; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { type: "text", label: "Testo", icon: Type },
    { type: "image", label: "Immagine", icon: Image },
    { type: "video", label: "Video", icon: Video }
];

/** Menu "Aggiungi" nell'header della sezione Contenuto — sostituisce i 3 bottoni in fondo lista. */
export function AddBlockMenu({ onAdd, imageDisabled }: AddBlockMenuProps) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <Button variant="secondary" size="sm" rightIcon={<ChevronDown size={14} />}>
                    Aggiungi
                </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={styles.content}
                    align="end"
                    sideOffset={4}
                    // Di default Radix rimanda il focus al trigger alla chiusura, DOPO
                    // l'effect di scroll+focus di StoryBlockEditor — vince lui e vanifica
                    // scroll/focus sul blocco appena creato (misurato con Playwright).
                    // Qui deleghiamo il focus al nuovo blocco stesso.
                    onCloseAutoFocus={e => e.preventDefault()}
                >
                    {ITEMS.map(item => (
                        <DropdownMenu.Item
                            key={item.type}
                            className={styles.item}
                            disabled={item.type === "image" && imageDisabled}
                            onSelect={() => onAdd(item.type)}
                        >
                            <item.icon size={16} />
                            {item.label}
                        </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
