// @ts-nocheck
//
// restore-order — admin-side endpoint that reverses a `delivered` order
// back to `acknowledged`. Used by staff to recover from accidental
// "Servito" taps on the Storico tab (Step 5a).
//
// Out of scope (intenzionalmente): ripristino di ordini `cancelled`. La
// cancellazione resta terminale per ora (caso futuro, vedi roadmap).
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// Resetta `delivered_at` e `ready_at` perche' tornano allo stato pre-
// completamento; non setta alcun timestamp dedicato per la transizione
// di ripristino (solo `updated_at`, gestito dal helper).
//
// See _shared/adminOrderTransition.ts per la pipeline completa.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

serve(req =>
    performAdminOrderTransition(req, {
        function_name: "restore-order",
        source_status: "delivered",
        target_status: "acknowledged",
        timestamp_field: null,
        clear_fields: ["delivered_at", "ready_at"]
    })
);
