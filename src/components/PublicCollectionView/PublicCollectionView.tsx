import type { Business } from "@/types/database";
import { ResolvedCollections } from "@/services/supabase/resolveActivityCatalogs";
import PublicCollectionRenderer from "@/features/public/components/PublicCollectionRenderer";

type Props = {
    business: Pick<Business, "name" | "cover_image">;
    resolved: ResolvedCollections;
};

export default function PublicCollectionView({ business, resolved }: Props) {
    return <PublicCollectionRenderer business={business} resolved={resolved} />;
}
