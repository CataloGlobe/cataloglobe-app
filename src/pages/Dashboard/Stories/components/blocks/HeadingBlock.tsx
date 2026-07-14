import { TextInput } from "@/components/ui/Input/TextInput";
import { StoryHeadingBlock } from "@/services/supabase/stories";

interface HeadingBlockProps {
    block: StoryHeadingBlock;
    onChange: (next: StoryHeadingBlock) => void;
    disabled?: boolean;
}

/** Editor blocco Titolo — plain text, riga singola. Modellato su TextBlock. */
export function HeadingBlock({ block, onChange, disabled }: HeadingBlockProps) {
    return (
        <TextInput
            value={block.content}
            onChange={e => onChange({ ...block, content: e.target.value })}
            placeholder="Titolo della sezione"
            disabled={disabled}
        />
    );
}
