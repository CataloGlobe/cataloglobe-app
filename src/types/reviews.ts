export interface ReviewsSummary {
    average_rating: number;
    total_count: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface PublicReview {
    rating: number;
    comment: string | null;
    created_at: string;
}
