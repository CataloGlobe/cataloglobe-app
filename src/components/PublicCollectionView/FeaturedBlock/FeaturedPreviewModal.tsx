import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import PublicSheet from "../PublicSheet/PublicSheet";
import { FeaturedContentDetail } from "./FeaturedContentDetail";
import styles from "./FeaturedPreviewModal.module.scss";

type Props = {
    block: V2FeaturedContent | null;
    isOpen: boolean;
    onClose: () => void;
};

export function FeaturedPreviewModal({ block, isOpen, onClose }: Props) {
    const { t } = useTranslation("public");
    // displayBlock persiste durante l'animazione di chiusura.
    // Quando onClose() viene chiamato, il parent imposta block=null e isOpen=false
    // simultaneamente. Senza questo stato, `if (!block) return null` smonterebbe
    // PublicSheet prima che AnimatePresence possa eseguire l'exit animation.
    const [displayBlock, setDisplayBlock] = useState(block);
    useEffect(() => {
        if (block) setDisplayBlock(block);
    }, [block]);

    if (!displayBlock) return null;

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel={displayBlock.title}
            headerContent={
                <div className={styles.sheetHeader}>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label={t("featured.preview_close_aria")}
                    >
                        {t("featured.preview_close_aria")}
                    </button>
                </div>
            }
        >
            <FeaturedContentDetail block={displayBlock} />
        </PublicSheet>
    );
}
