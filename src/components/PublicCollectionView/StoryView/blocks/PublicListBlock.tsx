import { Check } from "lucide-react";
import type { StoryListBlock } from "@/services/supabase/stories";
import styles from "./PublicListBlock.module.scss";

type PublicListBlockProps = {
    block: StoryListBlock;
};

export default function PublicListBlock({ block }: PublicListBlockProps) {
    // Difesa: le voci vuote sono già filtrate al salvataggio, ma un blocco
    // legacy/orfano non deve rendere marcatori a vuoto.
    const items = block.items.filter(item => item.trim() !== "");
    if (items.length === 0) return null;

    const isCheck = block.variant === "check";

    return (
        <ul className={`${styles.list} ${isCheck ? styles.check : styles.bullet}`}>
            {items.map((item, index) => (
                <li key={index} className={styles.item}>
                    <span className={styles.marker} aria-hidden="true">
                        {isCheck && <Check size={16} strokeWidth={2.5} />}
                    </span>
                    <span className={styles.itemText}>{item}</span>
                </li>
            ))}
        </ul>
    );
}
