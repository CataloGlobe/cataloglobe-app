import { Textarea } from "@/components/ui/Textarea/Textarea";
import { TextInput } from "@/components/ui/Input/TextInput";
import { StoryQuoteBlock } from "@/services/supabase/stories";
import styles from "./QuoteBlock.module.scss";

interface QuoteBlockProps {
    block: StoryQuoteBlock;
    onChange: (next: StoryQuoteBlock) => void;
    disabled?: boolean;
}

/** Editor blocco Citazione — plain text (frase + attribuzione). Modellato su TextBlock. */
export function QuoteBlock({ block, onChange, disabled }: QuoteBlockProps) {
    return (
        <div className={styles.root}>
            <Textarea
                value={block.content}
                onChange={e => onChange({ ...block, content: e.target.value })}
                placeholder="La frase da mettere in evidenza"
                rows={3}
                disabled={disabled}
            />
            <TextInput
                label="Attribuzione (opzionale)"
                value={block.attribution ?? ""}
                onChange={e => onChange({ ...block, attribution: e.target.value })}
                placeholder="Es. Nonna Rosa"
                disabled={disabled}
            />
        </div>
    );
}
