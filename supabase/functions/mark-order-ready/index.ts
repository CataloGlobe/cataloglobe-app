// @ts-nocheck
//
// mark-order-ready — admin-side endpoint that transitions an order from
// `acknowledged` to `ready`. Used by staff to mark "order prepared,
// waiting to be delivered to the table".
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// See _shared/adminOrderTransition.ts for the full pipeline.

import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

Deno.serve(req =>
    performAdminOrderTransition(req, {
        function_name: "mark-order-ready",
        source_status: "acknowledged",
        target_status: "ready",
        timestamp_field: "ready_at"
    })
);
