import { Select } from "@/components/ui/Select/Select";
import { TextInput } from "@/components/ui/Input/TextInput";
import { StoryVideoBlock, StoryVideoProvider } from "@/services/supabase/stories";
import styles from "./VideoBlock.module.scss";

const PROVIDER_OPTIONS: { value: StoryVideoProvider; label: string }[] = [
    { value: "youtube", label: "YouTube" },
    { value: "vimeo", label: "Vimeo" }
];

interface VideoBlockProps {
    block: StoryVideoBlock;
    onChange: (next: StoryVideoBlock) => void;
    disabled?: boolean;
}

export function VideoBlock({ block, onChange, disabled }: VideoBlockProps) {
    return (
        <div className={styles.row}>
            <Select
                label="Provider"
                value={block.provider}
                onChange={e => onChange({ ...block, provider: e.target.value as StoryVideoProvider })}
                options={PROVIDER_OPTIONS}
                disabled={disabled}
            />
            <TextInput
                label="URL o ID video"
                value={block.ref}
                onChange={e => onChange({ ...block, ref: e.target.value })}
                placeholder="Es: https://youtube.com/watch?v=..."
                disabled={disabled}
            />
        </div>
    );
}
