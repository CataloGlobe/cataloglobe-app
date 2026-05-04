import { useTranslation } from "react-i18next";
import styles from "./PublicBrandHeader.module.scss";

type Props = {
    logoUrl?: string | null;
    brandName?: string;
    showPlaceholder?: boolean;
};

export default function PublicBrandHeader({ logoUrl, brandName, showPlaceholder }: Props) {
    const { t } = useTranslation("public");
    if (!logoUrl && !showPlaceholder) return null;
    return (
        <div className={styles.header}>
            {logoUrl ? (
                <img
                    src={logoUrl}
                    alt={brandName ? t("brand.logo_alt_named", { name: brandName }) : t("brand.logo_alt_default")}
                    className={styles.logo}
                />
            ) : (
                <div className={styles.logoPlaceholder} aria-hidden />
            )}
        </div>
    );
}
