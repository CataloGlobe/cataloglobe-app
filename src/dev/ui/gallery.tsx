/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import type { ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./DevUiPage.module.scss";

/** Una scheda del design system = una sezione della galleria. */
export interface GallerySection {
    id: string;
    title: string;
    /** Riferimento alla scheda (sezione 5 del design system). */
    sheet?: string;
    Component: () => ReactNode;
}

/** Uno stato della scheda: etichetta a sinistra, componente reale a destra. */
export function State({
    label,
    column = false,
    children
}: {
    label: string;
    column?: boolean;
    children: ReactNode;
}) {
    return (
        <div className={styles.state}>
            <div className={styles.stateLabel}>
                <Text variant="caption" colorVariant="muted">
                    {label}
                </Text>
            </div>
            <div className={`${styles.stateBody} ${column ? styles.stateBodyColumn : ""}`}>
                {children}
            </div>
        </div>
    );
}

export const noop = () => {};
