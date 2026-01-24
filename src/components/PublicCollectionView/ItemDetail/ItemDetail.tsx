import Text from "@/components/ui/Text/Text";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import styles from "./ItemDetail.module.scss";

import type { CollectionViewSectionItem } from "../CollectionView/CollectionView";
import { Button } from "@/components/ui";

type Props = {
    item: CollectionViewSectionItem | null;
    isOpen: boolean;
    onClose: () => void;
};

export default function ItemDetail({ item, isOpen, onClose }: Props) {
    if (!item) return null;

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="sm" height="sm">
            <ModalLayoutHeader>
                <div className={styles.headerLeft}>
                    <Text as="h2" variant="title-md" weight={700}>
                        {item.name}
                    </Text>
                </div>

                <div className={styles.headerRight}>
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                </div>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                <div className={styles.root}>
                    {/* IMMAGINE */}
                    {item.image ? (
                        <img
                            src={item.image}
                            alt={item.name}
                            className={styles.image}
                            loading="lazy"
                        />
                    ) : (
                        <div className={styles.placeholderImage} />
                    )}

                    {/* CONTENUTO */}
                    <div className={styles.content}>
                        {item.price != null && (
                            <Text variant="body" weight={600} className={styles.price}>
                                € {item.price.toFixed(2)}
                            </Text>
                        )}

                        {item.description && (
                            <Text
                                variant="body"
                                colorVariant="muted"
                                className={styles.description}
                            >
                                {item.description}
                            </Text>
                        )}

                        {/* 🔮 SLOT FUTURI
                        - allergeni
                        - ingredienti
                        - CTA
                        - badge
                    */}
                    </div>
                </div>
            </ModalLayoutContent>
        </ModalLayout>
    );
}
