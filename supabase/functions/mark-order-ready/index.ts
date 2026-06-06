// @ts-nocheck
//
// mark-order-ready — admin-side endpoint that transitions an order from
// `acknowledged` to `ready`. Used by staff to mark "order prepared,
// waiting to be delivered to the table".
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// See _shared/adminOrderTransition.ts for the full pipeline.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

serve(req =>
    performAdminOrderTransition(req, {
        function_name: "mark-order-ready",
        source_status: "acknowledged",
        target_status: "ready",
        timestamp_field: "ready_at"
    })
);
