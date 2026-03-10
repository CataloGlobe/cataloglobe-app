import { Link, useParams } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import styles from "./UsageTab.module.scss";

interface UsageItem {
    id: string;
    name: string;
}

interface UsageData {
    catalogs: UsageItem[];
    schedules: UsageItem[];
    activities: UsageItem[];
}

interface UsageTabProps {
    productId: string;
    usageData: UsageData | null;
    usageLoading: boolean;
}

export function UsageTab({ productId, usageData, usageLoading }: UsageTabProps) {
    const { businessId } = useParams<{ businessId: string }>();
    console.log("usageData", usageData);

    if (usageLoading) {
        return (
            <Text variant="body-sm" colorVariant="muted">
                Caricamento utilizzo prodotto...
            </Text>
        );
    }

    const data = usageData ?? { catalogs: [], schedules: [], activities: [] };

    const activityCount = data.activities.length;
    const catalogCount = data.catalogs.length;
    const scheduleCount = data.schedules.length;

    const catalogLabel = catalogCount === 1 ? "catalogo" : "cataloghi";
    const scheduleLabel = scheduleCount === 1 ? "regola di programmazione" : "regole di programmazione";

    return (
        <div className={styles.root}>
            {/* Summary */}
            <div className={styles.summary}>
                <Text variant="body-sm" weight={600} style={{ marginBottom: "8px" }}>
                    Questo prodotto è utilizzato in:
                </Text>
                <ul className={styles.summaryList}>
                    <li className={styles.summaryItem}>
                        <span className={styles.summaryDot} />
                        <Text variant="body-sm">
                            <strong>{activityCount}</strong> attività
                        </Text>
                    </li>
                    <li className={styles.summaryItem}>
                        <span className={styles.summaryDot} />
                        <Text variant="body-sm">
                            <strong>{catalogCount}</strong> {catalogLabel}
                        </Text>
                    </li>
                    <li className={styles.summaryItem}>
                        <span className={styles.summaryDot} />
                        <Text variant="body-sm">
                            <strong>{scheduleCount}</strong> {scheduleLabel}
                        </Text>
                    </li>
                </ul>
            </div>

            <Text variant="body-sm" colorVariant="muted" className={styles.microcopy}>
                Questa sezione mostra dove il prodotto è utilizzato nel sistema. Per modificarne
                l'utilizzo, vai alla sezione{" "}
                <Link to={`/business/${businessId}/catalogs`} className={styles.inlineLink}>
                    Cataloghi
                </Link>{" "}
                o{" "}
                <Link to={`/business/${businessId}/scheduling`} className={styles.inlineLink}>
                    Programmazione
                </Link>
                .
            </Text>

            {/* Catalogs */}
            <section className={styles.section}>
                <Text variant="title-sm" weight={600} className={styles.sectionTitle}>
                    Cataloghi che includono questo prodotto
                </Text>

                {data.catalogs.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Questo prodotto non è incluso in nessun catalogo.
                    </Text>
                ) : (
                    <ul className={styles.list}>
                        {data.catalogs.map(catalog => (
                            <li key={catalog.id} className={styles.listItem}>
                                <Link
                                    to={`/business/${businessId}/catalogs/${catalog.id}?highlightProduct=${productId}`}
                                    className={styles.link}
                                >
                                    {catalog.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <div className={styles.divider} />

            {/* Schedules */}
            <section className={styles.section}>
                <Text variant="title-sm" weight={600} className={styles.sectionTitle}>
                    Programmazione
                </Text>

                {data.schedules.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna regola di programmazione coinvolge questo prodotto.
                    </Text>
                ) : (
                    <ul className={styles.list}>
                        {data.schedules.map(schedule => (
                            <li key={schedule.id} className={styles.listItem}>
                                <Link
                                    to={`/business/${businessId}/scheduling/${schedule.id}`}
                                    className={styles.link}
                                >
                                    {schedule.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <div className={styles.divider} />

            {/* Activities */}
            <section className={styles.section}>
                <Text variant="title-sm" weight={600} className={styles.sectionTitle}>
                    Attività coinvolte
                </Text>

                {data.activities.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Questo prodotto non è attualmente visibile in nessuna attività.
                    </Text>
                ) : (
                    <ul className={styles.list}>
                        {data.activities.map(activity => (
                            <li key={activity.id} className={styles.listItem}>
                                <Link
                                    to={`/business/${businessId}/locations/${activity.id}`}
                                    className={styles.link}
                                >
                                    {activity.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
