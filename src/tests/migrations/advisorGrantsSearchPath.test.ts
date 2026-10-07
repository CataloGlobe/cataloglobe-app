import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Advisor di staging del 2026-10-07: la migrazione toglie EXECUTE alle
// funzioni trigger e a delete_my_otp_verification per anon, e fissa il
// search_path delle funzioni segnalate. Letto dal testo: la migrazione non
// gira nei test unitari.

const sql = readFileSync("supabase/migrations/20261007160000_advisor_grants_search_path.sql", "utf8");

const TRIGGERS = [
    "check_activity_feature_flags",
    "close_empty_unverified_group",
    "enforce_ai_quota_on_translation_job",
    "enforce_feature_table_ordering_on_orders",
    "enforce_feature_table_reservation_on_reservations",
    "enforce_order_group_verification"
];

const SEARCH_PATH = [
    "purge_user_data",
    "analytics_orders_overview",
    "analytics_orders_trend",
    "analytics_orders_hourly",
    "analytics_top_ordered_products",
    "analytics_orders_latency",
    "analytics_orders_conversion",
    "analytics_reservations_overview",
    "analytics_reservations_trend",
    "analytics_reservations_hourly"
];

// Le RPC che anon deve poter chiamare (QR del tavolo, pagina pubblica, invito).
const PUBLIC_RPCS = ["resolve_table_by_token", "get_tenant_public_info", "get_public_tenant_ids", "get_invite_info_by_token"];

const statements = sql
    .split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .join("\n");

describe("migrazione advisor: grant e search_path", () => {
    it.each(TRIGGERS)("%s: niente EXECUTE per PUBLIC, anon, authenticated", fn => {
        expect(statements).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}() FROM PUBLIC, anon, authenticated;`);
    });

    it("delete_my_otp_verification resta chiamabile da authenticated", () => {
        expect(statements).toContain("REVOKE EXECUTE ON FUNCTION public.delete_my_otp_verification() FROM PUBLIC, anon;");
        expect(statements).toContain("GRANT EXECUTE ON FUNCTION public.delete_my_otp_verification() TO authenticated;");
    });

    it.each(SEARCH_PATH)("%s: search_path fisso", fn => {
        expect(statements).toMatch(new RegExp(`ALTER FUNCTION public\\.${fn}\\([^)]*\\) SET search_path = public;`));
    });

    it.each(PUBLIC_RPCS)("%s: non toccata", fn => {
        expect(statements).not.toContain(fn);
    });
});
