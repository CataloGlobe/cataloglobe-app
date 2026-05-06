import { TriangleAlert } from "lucide-react";
import { InlineBanner } from "@components/ui";
import type { PaletteWarning } from "./usePaletteWarnings";
import styles from "./PaletteWarningsBox.module.scss";

type Props = {
    warnings: PaletteWarning[];
};

export const PaletteWarningsBox = ({ warnings }: Props) => {
    if (warnings.length === 0) return null;

    return (
        <InlineBanner variant="warning">
            <div className={styles.box}>
                <TriangleAlert size={16} className={styles.icon} aria-hidden="true" />
                <div className={styles.body}>
                    <span className={styles.title}>Suggerimenti palette</span>
                    <ul className={styles.list}>
                        {warnings.map(w => (
                            <li key={w.id} className={styles.item}>
                                {w.message}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </InlineBanner>
    );
};
