import type { ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./CollectionPreviewFrame.module.scss";

export type DeviceMode = "mobile" | "tablet" | "desktop";

type Props = {
    mode: DeviceMode;
    children: ReactNode;
};

function getDeviceWidth(mode: DeviceMode): number {
    if (mode === "mobile") return 390;
    if (mode === "tablet") return 768;
    return 1200; // desktop (un po' più compatto di 1280 dentro una modale)
}

function getDeviceLabel(mode: DeviceMode): string {
    if (mode === "mobile") return "Mobile";
    if (mode === "tablet") return "Tablet";
    return "Desktop";
}

export default function CollectionPreviewFrame({ mode, children }: Props) {
    const width = getDeviceWidth(mode);

    return (
        <div className={styles.wrap} aria-label="Anteprima collezione">
            <div className={styles.topBar}>
                <Text variant="title-sm" weight={700}>
                    Anteprima
                </Text>

                <Text variant="caption" colorVariant="muted">
                    {getDeviceLabel(mode)} · {width}px
                </Text>
            </div>

            <div className={styles.viewportOuter}>
                <div className={`${styles.viewport} preview-${mode}`} style={{ width }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
