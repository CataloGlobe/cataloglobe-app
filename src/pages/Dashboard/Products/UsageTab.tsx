import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IconChevronRight } from "@tabler/icons-react";
import {
    type ProductCategoryAssignment,
    getProductCategoryAssignments
} from "@/services/supabase/productUsage";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
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
    tenantId: string;
    usageData: UsageData | null;
    usageLoading: boolean;
}

export function UsageTab({ productId, tenantId, usageData, usageLoading }: UsageTabProps) {
    const { businessId } = useParams<{ businessId: string }>();

    const [categoryAssignments, setCategoryAssignments] = useState<
        ProductCategoryAssignment[]
    >([]);
    const [loadingAssignments, setLoadingAssignments] = useState(true);

    useEffect(() => {
        if (!productId || !tenantId) return;
        let cancelled = false;
        setLoadingAssignments(true);
        getProductCategoryAssignments(productId, tenantId)
            .then(data => {
                if (!cancelled) setCategoryAssignments(data);
            })
            .catch(() => {
                if (!cancelled) setCategoryAssignments([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingAssignments(false);
            });
        return () => {
            cancelled = true;
        };
    }, [productId, tenantId]);

    if (usageLoading || loadingAssignments) {
        return (
            <div className={styles.grid}>
                <div className={styles.loading}>Caricamento utilizzo prodotto...</div>
            </div>
        );
    }

    const data = usageData ?? { catalogs: [], schedules: [], activities: [] };
    const counts = {
        activities: data.activities.length,
        catalogs: data.catalogs.length,
        schedules: data.schedules.length
    };

    return (
        <div className={styles.grid}>
            {/* ──────────────── Card 1 — Riepilogo utilizzo ──────────────── */}
            <SectionCard
                title="Riepilogo utilizzo"
                subtitle="Visualizza dove questo prodotto è utilizzato nella piattaforma."
            >
                <div className={styles.summaryStats}>
                    <span className={styles.summaryBadge}>
                        <span className={styles.summaryBadgeNumber}>{counts.activities}</span>
                        attività
                    </span>
                    <span className={styles.summaryBadge}>
                        <span className={styles.summaryBadgeNumber}>{counts.catalogs}</span>
                        {counts.catalogs === 1 ? "catalogo" : "cataloghi"}
                    </span>
                    <span className={styles.summaryBadge}>
                        <span className={styles.summaryBadgeNumber}>{counts.schedules}</span>
                        {counts.schedules === 1 ? "regola" : "regole"}
                    </span>
                </div>
                <div className={styles.microcopy}>
                    Per gestire i cataloghi vai a{" "}
                    <Link to={`/business/${businessId}/catalogs`}>Cataloghi</Link>. Per
                    modificare le regole di programmazione vai a{" "}
                    <Link to={`/business/${businessId}/scheduling`}>Programmazione</Link>.
                </div>
            </SectionCard>

            {/* ──────────────── Card 2 — Cataloghi (con breadcrumb categoria) ──────────────── */}
            <SectionCard title="Cataloghi">
                {categoryAssignments.length === 0 ? (
                    <div className={styles.empty}>
                        Questo prodotto non è incluso in nessun catalogo.
                    </div>
                ) : (
                    <ul className={styles.list}>
                        {categoryAssignments.map(a => (
                            <li
                                key={`${a.catalog.id}-${a.category.id}`}
                                className={styles.listItem}
                            >
                                <Link
                                    to={`/business/${businessId}/catalogs/${a.catalog.id}?highlightProduct=${productId}`}
                                    className={styles.link}
                                >
                                    <span className={styles.breadcrumb}>
                                        <span className={styles.breadcrumbCatalog}>
                                            {a.catalog.name}
                                        </span>
                                        <span className={styles.breadcrumbSeparator}>›</span>
                                        <span className={styles.breadcrumbCategory}>
                                            {a.category.name}
                                        </span>
                                    </span>
                                    <IconChevronRight className={styles.chevron} size={16} />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>

            {/* ──────────────── Card 3 — Programmazione ──────────────── */}
            <SectionCard title="Programmazione">
                {data.schedules.length === 0 ? (
                    <div className={styles.empty}>
                        Nessuna regola di programmazione coinvolge questo prodotto.
                    </div>
                ) : (
                    <ul className={styles.list}>
                        {data.schedules.map(schedule => (
                            <li key={schedule.id} className={styles.listItem}>
                                <Link
                                    to={`/business/${businessId}/scheduling/${schedule.id}`}
                                    className={styles.link}
                                >
                                    <span>{schedule.name}</span>
                                    <IconChevronRight
                                        className={styles.chevron}
                                        size={16}
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>

            {/* ──────────────── Card 4 — Attività coinvolte ──────────────── */}
            <SectionCard title="Attività coinvolte">
                {data.activities.length === 0 ? (
                    <div className={styles.empty}>
                        Questo prodotto non è attualmente visibile in nessuna attività.
                    </div>
                ) : (
                    <ul className={styles.list}>
                        {data.activities.map(activity => (
                            <li key={activity.id} className={styles.listItem}>
                                <Link
                                    to={`/business/${businessId}/locations/${activity.id}`}
                                    className={styles.link}
                                >
                                    <span>{activity.name}</span>
                                    <IconChevronRight
                                        className={styles.chevron}
                                        size={16}
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>
        </div>
    );
}
