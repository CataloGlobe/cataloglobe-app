import { Link } from "react-router-dom";
import { ChevronLeftIcon } from "./icons";
import styles from "./ReservationHeader.module.scss";

type Props = {
    brandName: string;
    tenantLogoUrl: string | null;
    coverImage: string | null;
    backHref: string;
};

export default function ReservationHeader({ brandName, tenantLogoUrl, coverImage, backHref }: Props) {
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

            <Link to={backHref} className={styles.menuBtn} aria-label="Torna al menu">
                <ChevronLeftIcon />
                <span>Menu</span>
            </Link>

            <div className={styles.inner}>
                {tenantLogoUrl && (
                    <div className={styles.logo}>
                        <img src={tenantLogoUrl} alt="" loading="eager" decoding="async" />
                    </div>
                )}
                <span className={styles.eyebrow}>Prenotazione</span>
                <h1 className={styles.title}>{brandName}</h1>
            </div>
        </header>
    );
}
