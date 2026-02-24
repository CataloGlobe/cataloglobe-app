import { resolveActivityCatalogsV2 } from "./v2/resolveActivityCatalogsV2";

type ResolvedCollections = {
    primary: string | null;
    overlay: string | null;
};

export async function resolveBusinessCollections(
    businessId: string,
    now: Date = new Date()
): Promise<ResolvedCollections> {
    return resolveActivityCatalogsV2(businessId, now);
}
