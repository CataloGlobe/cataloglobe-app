import styles from "./PublicBrandHeader.module.scss";

type Props = {
    logoUrl?: string | null;
    brandName?: string;
    showPlaceholder?: boolean;
};

export default function PublicBrandHeader({ logoUrl, brandName, showPlaceholder }: Props) {
    if (!logoUrl && !showPlaceholder) return null;
    return (
        <div className={styles.header}>
            {logoUrl ? (
                <img
                    src={logoUrl}
                    alt={brandName ? `Logo ${brandName}` : "Logo"}
                    className={styles.logo}
                />
            ) : (
                <div className={styles.logoPlaceholder} aria-hidden />
            )}
        </div>
    );
}
