// @ts-nocheck
//
// cancel-order-admin — admin-side endpoint that cancels an order from
// `submitted`, `acknowledged`, or `ready` state. Used by staff when an
// order can't be fulfilled (out of stock, table left, etc.).
//
// `delivered` is intentionally NOT cancellable: for consegnati la
// correzione corretta e' la rettifica (storno parziale per item via
// rectify-order), non l'annullamento totale.
//
// Accepts an optional `reason` (free text) which is persisted on
// `orders.cancellation_reason` and echoed back in the response.
// `cancelled_by` is hard-set to "admin" to distinguish from customer-
// initiated cancellations.
//
// Thin wrapper around the shared performAdminOrderTransition helper.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

serve(req =>
    performAdminOrderTransition(req, {
        function_name: "cancel-order-admin",
        source_status: ["submitted", "acknowledged", "ready"],
        target_status: "cancelled",
        timestamp_field: "cancelled_at",
        parse_extra_body: raw => {
            const reason = raw.reason;
            if (reason !== undefined && reason !== null) {
                if (typeof reason !== "string") {
                    return { error: "`reason` must be a string or null." };
                }
                const trimmed = reason.trim();
                if (trimmed.length > 500) {
                    return { error: "`reason` must be at most 500 characters." };
                }
                return { reason: trimmed.length > 0 ? trimmed : null };
            }
            return { reason: null };
        },
        build_extra_update_fields: extras => ({
            cancelled_by: "admin",
            cancellation_reason: extras.reason ?? null
        }),
        extra_returning_columns: ["cancelled_by", "cancellation_reason"],
        build_extra_response_fields: updated => ({
            cancelled_by: updated.cancelled_by,
            cancellation_reason: updated.cancellation_reason
        })
    })
);
