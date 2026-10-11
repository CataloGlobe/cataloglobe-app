import { useTranslation } from "react-i18next";
import type { OpeningHoursEntry, UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import { useVenueStatus } from "./useVenueStatus";
import { venueStatusLabel } from "./venueLabel";
import styles from "./VenuePill.module.scss";

type Props = {
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    onOpenHours: () => void;
};

/** Stato del locale sotto il nome del menu. Senza orari non si vede. Il tocco apre le Informazioni. */
export default function VenuePill({ hours, closures, onOpenHours }: Props) {
    const { t, i18n } = useTranslation("public");
    const status = useVenueStatus(hours, closures);
    const label = venueStatusLabel(status, t as (key: string, o?: Record<string, unknown>) => string, i18n.language);
    if (!label) return null;
    return (
        <button type="button" className={styles.stato} data-stato={status.kind} onClick={onOpenHours}>
            <span className={styles.pallino} aria-hidden />
            <span className={styles.testo}>{label}</span>
        </button>
    );
}
