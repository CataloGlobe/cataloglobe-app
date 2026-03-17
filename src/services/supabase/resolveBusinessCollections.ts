import { resolveActivityCatalogs } from "./resolveActivityCatalogs";

export async function resolveBusinessCollections(businessId: string, now: Date = new Date()) {
    return resolveActivityCatalogs(businessId, now);
}
