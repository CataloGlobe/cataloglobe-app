import styles from "./PublicBrandHeader.module.scss";

type Props = {
    logoUrl: string;
    brandName?: string;
};

export default function PublicBrandHeader({ logoUrl, brandName }: Props) {
    return (
        <div className={styles.header}>
            <img
                src={logoUrl}
                alt={brandName ? `Logo ${brandName}` : "Logo"}
                className={styles.logo}
            />
        </div>
    );
}
