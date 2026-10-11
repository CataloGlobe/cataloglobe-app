import { useId } from "react";
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
    const descriptionId = useId();
    const translate = t as (key: string, o?: Record<string, unknown>) => string;
    const label = venueStatusLabel(status, translate, i18n.language, true);
    if (!label) return null;
    // La forma corta è il nome (quello che si vede, anche per chi comanda a voce);
    // la frase intera è la descrizione («lun» letto da solo non basta).
    const fullLabel = venueStatusLabel(status, translate, i18n.language);
    const described = fullLabel !== null && fullLabel !== label;
    return (
        <button
            type="button"
            className={styles.stato}
            data-stato={status.kind}
            onClick={onOpenHours}
            aria-describedby={described ? descriptionId : undefined}
        >
            <span className={styles.pallino} aria-hidden />
            <span className={styles.testo}>{label}</span>
            {described ? (
                <span id={descriptionId} hidden>
                    {fullLabel}
                </span>
            ) : null}
        </button>
    );
}
