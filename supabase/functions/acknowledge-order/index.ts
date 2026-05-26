// @ts-nocheck
//
// acknowledge-order — admin-side endpoint that transitions an order from
// `submitted` to `acknowledged`. Used by staff to mark "I've seen it,
// I'm working on it".
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// See _shared/adminOrderTransition.ts for the full pipeline.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

serve(req =>
    performAdminOrderTransition(req, {
        function_name: "acknowledge-order",
        source_status: "submitted",
        target_status: "acknowledged",
        timestamp_field: "acknowledged_at"
    })
);
