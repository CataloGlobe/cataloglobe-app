import type { StoryTextBlock } from "@/services/supabase/stories";
import { parseInlineEmphasis } from "./parseInlineEmphasis";
import styles from "./PublicTextBlock.module.scss";

type PublicTextBlockProps = {
    block: StoryTextBlock;
    /** Primo blocco testo della storia → trattamento "sommario" (corpo maggiore). */
    isLead?: boolean;
};

export default function PublicTextBlock({ block, isLead }: PublicTextBlockProps) {
    // Enfasi inline ristretta (grassetto/corsivo). Il parser emette solo nodi
    // React (strong/em/testo): i `value` sono stringhe grezze che React escapa
    // → nessun markup HTML iniettabile.
    const nodes = parseInlineEmphasis(block.content);

    return (
        <p className={`${styles.text} ${isLead ? styles.lead : ""}`}>
            {nodes.map((node, i) => {
                if (node.type === "strong") return <strong key={i}>{node.value}</strong>;
                if (node.type === "em") return <em key={i}>{node.value}</em>;
                return node.value;
            })}
        </p>
    );
}
