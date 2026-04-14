import { Star, ExternalLink, MessageSquare, TrendingUp } from "lucide-react";
import type { ReviewMetrics } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: ReviewMetrics | null;
    isLoading: boolean;
};

function StarIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
        >
            <path d="M6 1l1.3 2.6 2.9.4-2.1 2 .5 2.9L6 7.5 3.4 8.9l.5-2.9-2.1-2 2.9-.4z" />
        </svg>
    );
}

function StarRating({ value }: { value: number }) {
    return (
        <span className={styles.starRating}>
            {[1, 2, 3, 4, 5].map(i => (
                <span
                    key={i}
                    className={i <= Math.round(value) ? styles.starFilled : styles.starEmpty}
                >
                    <StarIcon filled={i <= Math.round(value)} />
                </span>
            ))}
        </span>
    );
}

function starColor(stars: number): string {
    if (stars >= 4) return "#f59e0b";
    if (stars === 3) return "#94a3b8";
    return "#ef4444";
}

export default function ReviewGuardCard({ data, isLoading }: Props) {
    const conversionRate =
        data && data.total > 0
            ? ((data.google_redirects / data.total) * 100).toFixed(1)
            : "0.0";

    const maxCount = data
        ? Math.max(...(data.distribution.map(d => d.count)), 1)
        : 1;

    // Fill all stars 1-5 even if missing from distribution
    const fullDistribution = [5, 4, 3, 2, 1].map(stars => {
        const found = data?.distribution.find(d => d.stars === stars);
        return { stars, count: found?.count ?? 0 };
    });

    return (
        <article className={styles.chartCard} aria-label="Review Guard">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Review Guard
                </Text>
            </header>

            <div className={styles.chartCardBody} style={{ minHeight: "unset" }}>
                {isLoading ? (
                    <div className={styles.tableSkeletons}>
                        <Skeleton height="64px" radius="8px" />
                        <Skeleton height="120px" radius="8px" />
                    </div>
                ) : !data || data.total === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessuna recensione nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <div className={styles.reviewContent}>
                        {/* Mini KPI 2×2 */}
                        <div className={styles.reviewKpiGrid}>
                            <div className={styles.reviewKpi}>
                                <div className={styles.reviewKpiIcon}>
                                    <MessageSquare size={14} />
                                </div>
                                <Text variant="caption" colorVariant="muted">Recensioni</Text>
                                <Text variant="title-sm" weight={600}>{data.total}</Text>
                            </div>

                            <div className={styles.reviewKpi}>
                                <div className={styles.reviewKpiIcon}>
                                    <Star size={14} />
                                </div>
                                <Text variant="caption" colorVariant="muted">Media stelle</Text>
                                <div className={styles.reviewKpiStarRow}>
                                    <Text variant="title-sm" weight={600}>
                                        {data.avg_rating.toFixed(1)}
                                    </Text>
                                    <StarRating value={data.avg_rating} />
                                </div>
                            </div>

                            <div className={styles.reviewKpi}>
                                <div className={`${styles.reviewKpiIcon} ${styles.reviewKpiIconGreen}`}>
                                    <ExternalLink size={14} />
                                </div>
                                <Text variant="caption" colorVariant="muted">Redirect Google</Text>
                                <Text variant="title-sm" weight={600} style={{ color: "#16a34a" }}>
                                    {data.google_redirects}
                                </Text>
                            </div>

                            <div className={styles.reviewKpi}>
                                <div className={styles.reviewKpiIcon}>
                                    <TrendingUp size={14} />
                                </div>
                                <Text variant="caption" colorVariant="muted">Tasso conversione</Text>
                                <Text variant="title-sm" weight={600}>{conversionRate}%</Text>
                            </div>
                        </div>

                        {/* Distribuzione stelle */}
                        <div className={styles.reviewDistribution}>
                            {fullDistribution.map(({ stars, count }) => (
                                <div key={stars} className={styles.reviewDistributionRow}>
                                    <span className={styles.reviewDistributionLabel}>
                                        <span style={{ color: starColor(stars) }}>
                                            <StarIcon filled />
                                        </span>
                                        <Text variant="caption" weight={500}>{stars}</Text>
                                    </span>
                                    <div className={styles.reviewBar}>
                                        <div
                                            className={styles.reviewBarFill}
                                            style={{
                                                width: `${(count / maxCount) * 100}%`,
                                                background: starColor(stars)
                                            }}
                                        />
                                    </div>
                                    <Text variant="caption" colorVariant="muted" style={{ minWidth: 24, textAlign: "right" }}>
                                        {count}
                                    </Text>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
}
