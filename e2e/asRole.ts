import type { Page } from "@playwright/test";

/** I permessi veri dei due ruoli di sede (`docs/permissions-matrix.md` §6). */
export const PERMESSI_DI_SEDE: Record<"manager" | "staff" | "viewer", string[]> = {
    manager: [
        "activity.read", "activity.manage", "activity_hours.write", "activity_groups.read", "catalogs.read",
        "products.read", "product_availability.write", "featured.read", "featured.write", "stories.read",
        "stories.write", "styles.read", "scheduling.read", "scheduling.write", "tables.read", "tables.manage",
        "orders.read", "orders.manage", "reservations.read", "reservations.manage", "reviews.read",
        "reviews.moderate", "analytics.read", "notifications.receive", "team.read", "team.invite",
        "team.manage_roles", "team.remove", "tenant.read", "guests.read", "guests.manage", "seatings.read",
        "seatings.manage", "support.read", "support.write"
    ],
    staff: [
        "activity.read", "catalogs.read", "products.read", "featured.read", "stories.read", "styles.read",
        "tables.read", "tables.manage", "orders.read", "orders.manage", "reservations.read", "reservations.manage",
        "reviews.read", "reviews.moderate", "notifications.receive", "tenant.read", "seatings.read",
        "seatings.manage", "support.read", "support.write"
    ],
    viewer: [
        "activity.read", "catalogs.read", "products.read", "featured.read", "stories.read", "styles.read",
        "scheduling.read", "tables.read", "orders.read", "reservations.read", "reviews.read", "analytics.read",
        "tenant.read", "seatings.read"
    ]
};

/**
 * L'utente e2e diventa `role` delle sole sedi `activityId` (una o più), col
 * piano `plan`: le risposte vere di `get_my_permissions` e
 * `user_tenants_view` riscritte in pagina. Da chiamare prima di aprire la
 * pagina.
 */
export async function asRole(
    page: Page,
    role: "manager" | "staff" | "viewer",
    activityId: string | readonly string[],
    plan: "pro" | "base"
): Promise<void> {
    const activityIds = typeof activityId === "string" ? [activityId] : [...activityId];
    await page.route(/\/rest\/v1\/rpc\/get_my_permissions/, async route => {
        try {
            const response = await route.fetch();
            const rows = (await response.json()) as Array<Record<string, unknown>>;
            for (const row of rows) {
                row.role = role;
                row.activity_ids = activityIds;
                row.permissions = PERMESSI_DI_SEDE[role];
            }
            await route.fulfill({ response, json: rows });
        } catch {
            // Pagina chiusa a metà richiesta: niente da riscrivere.
        }
    });
    if (plan === "base") await asBasePlan(page);
}

/** Il piano dell'azienda diventa «base»: niente Comande, Prenotazioni, Mappa. */
export async function asBasePlan(page: Page): Promise<void> {
    await page.route(/\/rest\/v1\/user_tenants_view/, async route => {
        try {
            const response = await route.fetch();
            const rows = (await response.json()) as Array<Record<string, unknown>>;
            for (const row of rows) row.plan = "base";
            await route.fulfill({ response, json: rows });
        } catch {
            // idem
        }
    });
}
