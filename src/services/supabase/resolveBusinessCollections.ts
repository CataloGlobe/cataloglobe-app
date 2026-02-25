import { resolveActivityCatalogsV2 } from "./v2/resolveActivityCatalogsV2";

export async function resolveBusinessCollections(businessId: string, now: Date = new Date()) {
    return resolveActivityCatalogsV2(businessId, now);
}
