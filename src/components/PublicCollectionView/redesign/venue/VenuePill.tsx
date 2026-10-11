import { useTranslation } from "react-i18next";
import type { OpeningHoursEntry, UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import { useVenueStatus } from "./useVenueStatus";
import type { VenueStatus } from "./venueStatus";
import styles from "./VenuePill.module.scss";

type Props = {
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    onOpenHours: () => void;
};

/** Nome del giorno nella lingua della pagina, con la maiuscola che gli spetta (lunedì, Montag, Monday). */
function weekdayName(dow: number, lang: string): string {
    // 1 gennaio 2024 era un lunedì.
    return new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + dow)));
}

function labelFor(status: VenueStatus, t: (key: string, o?: Record<string, unknown>) => string, lang: string): string | null {
    switch (status.kind) {
        case "unknown":
            return null;
        case "open":
            return t("venue.open");
        case "closing-soon":
            return t("venue.closing_soon", { minutes: status.minutes });
        case "closed": {
            const next = status.opensAt;
            if (!next) return t("venue.closed");
            if (next.dayOffset === 0) return t("venue.closed_opens_today", { time: next.time });
            if (next.dayOffset === 1) return t("venue.closed_opens_tomorrow", { time: next.time });
            return t("venue.closed_opens_day", { day: weekdayName(next.dow, lang), time: next.time });
        }
    }
}

/** Stato del locale sotto il nome del menu. Senza orari non si vede. Il tocco apre le Informazioni. */
export default function VenuePill({ hours, closures, onOpenHours }: Props) {
    const { t, i18n } = useTranslation("public");
    const status = useVenueStatus(hours, closures);
    const label = labelFor(status, t as (key: string, o?: Record<string, unknown>) => string, i18n.language);
    if (!label) return null;
    return (
        <button type="button" className={styles.stato} data-stato={status.kind} onClick={onOpenHours}>
            <span className={styles.pallino} aria-hidden />
            <span className={styles.testo}>{label}</span>
        </button>
    );
}
