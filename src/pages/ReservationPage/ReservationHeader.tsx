import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon } from "./icons";
import styles from "./ReservationHeader.module.scss";

type Props = {
    brandName: string;
    tenantLogoUrl: string | null;
    coverImage: string | null;
    backHref: string;
    /** Slot in alto a destra (selettore lingua). Menu resta a sinistra. */
    rightSlot?: ReactNode;
};

export default function ReservationHeader({ brandName, tenantLogoUrl, coverImage, backHref, rightSlot }: Props) {
    const { t } = useTranslation("public");
    const hasCover = !!coverImage;
    return (
        <header className={styles.header} data-has-cover={hasCover ? "true" : "false"}>
            {hasCover && (
                <img
                    className={styles.cover}
                    src={coverImage as string}
                    alt=""
                    loading="eager"
                    decoding="async"
                />
            )}
            <div className={styles.scrim} aria-hidden="true" />

            <Link to={backHref} className={styles.menuBtn} aria-label={t("reservation.back_to_menu")}>
                <ChevronLeftIcon />
                <span>{t("reservation.back_button")}</span>
            </Link>

            {rightSlot && (
                <div className={styles.rightSlot}>{rightSlot}</div>
            )}

            <div className={styles.inner}>
                {tenantLogoUrl && (
                    <div className={styles.logo}>
                        <img src={tenantLogoUrl} alt="" loading="eager" decoding="async" />
                    </div>
                )}
                <span className={styles.eyebrow}>{t("reservation.title")}</span>
                <h1 className={styles.title}>{brandName}</h1>
            </div>
        </header>
    );
}
