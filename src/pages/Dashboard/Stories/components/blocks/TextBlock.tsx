import { useRef } from "react";
import { Bold, Italic } from "lucide-react";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { StoryTextBlock } from "@/services/supabase/stories";
import styles from "./TextBlock.module.scss";

interface TextBlockProps {
    block: StoryTextBlock;
    onChange: (next: StoryTextBlock) => void;
    disabled?: boolean;
}

export function TextBlock({ block, onChange, disabled }: TextBlockProps) {
    const ref = useRef<HTMLTextAreaElement>(null);

    // Avvolge la selezione nei marcatori (`**` grassetto, `*` corsivo). Se la
    // selezione è vuota, il caret finisce in mezzo (`**|**`) per scrivere dentro.
    const wrap = (marker: string) => {
        const el = ref.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const value = block.content;
        const next =
            value.slice(0, start) + marker + value.slice(start, end) + marker + value.slice(end);
        onChange({ ...block, content: next });

        // Ripristina la selezione DOPO il re-render controllato: stesso pattern
        // rAF di StoryBlockEditor. La porzione resta selezionata, spostata di
        // marker.length; selezione vuota → caret tra i due marcatori.
        const nextStart = start + marker.length;
        const nextEnd = end + marker.length;
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(nextStart, nextEnd);
        });
    };

    return (
        <div className={styles.root}>
            <div className={styles.toolbar}>
                <button
                    type="button"
                    aria-label="Grassetto"
                    title="Grassetto"
                    className={styles.toolBtn}
                    disabled={disabled}
                    // Make-or-break iOS: senza preventDefault il tap ruba il focus
                    // al textarea e azzera la selezione prima che wrap() la legga.
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => wrap("**")}
                >
                    <Bold size={15} />
                </button>
                <button
                    type="button"
                    aria-label="Corsivo"
                    title="Corsivo"
                    className={styles.toolBtn}
                    disabled={disabled}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => wrap("*")}
                >
                    <Italic size={15} />
                </button>
            </div>

            <Textarea
                ref={ref}
                value={block.content}
                onChange={e => onChange({ ...block, content: e.target.value })}
                placeholder="Scrivi un paragrafo..."
                rows={5}
                disabled={disabled}
            />
        </div>
    );
}
