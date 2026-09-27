import { InlineBanner } from "@components/ui";
import Text from "@/components/ui/Text/Text";
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
                <div className={styles.body}>
                    <Text as="span" variant="body-sm" weight={600} className={styles.title}>Suggerimenti palette</Text>
                    <ul className={styles.list}>
                        {warnings.map(w => (
                            <li key={w.id} className={styles.item}>
                                <Text as="span" variant="body-sm">{w.message}</Text>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </InlineBanner>
    );
};
