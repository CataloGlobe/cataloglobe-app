// @ts-nocheck
//
// deliver-order — admin-side endpoint that transitions an order from
// `acknowledged` or `ready` to `delivered`. Used by staff to mark the
// order as brought to the table. Accepts both source states so workflows
// that skip the explicit "ready" step (small staff, fast kitchen) keep
// working alongside ones that use it.
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// See _shared/adminOrderTransition.ts for the full pipeline.

import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

Deno.serve(req =>
    performAdminOrderTransition(req, {
        function_name: "deliver-order",
        source_status: ["acknowledged", "ready"],
        target_status: "delivered",
        timestamp_field: "delivered_at"
    })
);
