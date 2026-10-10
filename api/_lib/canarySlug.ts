/**
 * Slug della sede di test che il monitor di stato apre come canary
 * (`api/_lib/statusServices.ts`). Fonte unica: lo usa anche ssr-render per
 * tenerla fuori da Google in produzione.
 */
export const DEFAULT_STATUS_CANARY_SLUG = "san-pietro-porta-venezia";

export function statusCanarySlug(): string {
    return process.env.STATUS_CANARY_SLUG ?? DEFAULT_STATUS_CANARY_SLUG;
}
