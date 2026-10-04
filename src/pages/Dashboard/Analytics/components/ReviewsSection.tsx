import { useNavigate, useParams } from "react-router-dom";
import { BarList } from "@/components/ui/BarList/BarList";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Rating } from "@/components/ui/Rating/Rating";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import type { ReviewMetrics } from "@/services/supabase/analytics";
import styles from "../Analytics.module.scss";

type Props = {
    data: ReviewMetrics | null;
    isLoading: boolean;
};

/**
 * Recensioni (ex «Review Guard»): la media come numero eroe, la distribuzione
 * a una serie sola (§34.10), i rimandi a Google come conteggio. Le recensioni
 * in attesa col rimando alla coda arrivano col lotto della moderazione (A1).
 */
export default function ReviewsSection({ data, isLoading }: Props) {
    const navigate = useNavigate();
    const { businessId, activityId } = useParams<{ businessId: string; activityId?: string }>();
    // Dentro la sede, le recensioni della sede (§51.10).
    const reviewsPath = activityId
        ? `/business/${businessId}/locations/${activityId}/recensioni`
        : `/business/${businessId}/reviews`;
    const total = data?.total ?? 0;

    return (
        <Card
            title="Recensioni"
            actions={
                <Button variant="ghost" size="sm" onClick={() => navigate(reviewsPath)}>
                    Vai alle recensioni
                </Button>
            }
        >
            {isLoading ? (
                <Skeleton height="120px" />
            ) : total === 0 ? (
                <EmptyState variant="inline" title="Nessuna recensione nel periodo" />
            ) : (
                <div className={styles.reviews}>
                    <div className={styles.reviewsAverage}>
                        <Rating
                            value={data?.avg_rating ?? 0}
                            size="hero"
                            countLabel={`${total} ${total === 1 ? "recensione lasciata" : "recensioni lasciate"}`}
                        />
                        <Text as="p" variant="caption" colorVariant="muted">
                            {data?.google_redirects ?? 0} su {total} rimandat{total === 1 ? "a" : "e"} a Google
                        </Text>
                    </div>
                    <BarList
                        className={styles.reviewsDistribution}
                        aria-label="Distribuzione dei voti"
                        items={[5, 4, 3, 2, 1].map(stars => ({
                            id: String(stars),
                            label: <Rating value={stars} showValue={false} />,
                            value: data?.distribution.find(d => d.stars === stars)?.count ?? 0
                        }))}
                    />
                </div>
            )}
        </Card>
    );
}
