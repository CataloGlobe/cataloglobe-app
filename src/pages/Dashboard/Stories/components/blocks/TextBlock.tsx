import { Textarea } from "@/components/ui/Textarea/Textarea";
import { StoryTextBlock } from "@/services/supabase/stories";

interface TextBlockProps {
    block: StoryTextBlock;
    onChange: (next: StoryTextBlock) => void;
    disabled?: boolean;
}

export function TextBlock({ block, onChange, disabled }: TextBlockProps) {
    return (
        <Textarea
            value={block.content}
            onChange={e => onChange({ ...block, content: e.target.value })}
            placeholder="Scrivi un paragrafo..."
            rows={5}
            disabled={disabled}
        />
    );
}
