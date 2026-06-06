// @ts-nocheck
//
// unready-order — admin-side endpoint che rimette un ordine da `ready`
// a `acknowledged` ("Rimetti in lavorazione"). Usata dallo staff per
// correggere un Pronto scattato per errore.
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// Resetta `ready_at` perche' torniamo allo stato pre-pronto; NON tocca
// `acknowledged_at` (quel timestamp resta veritiero: l'ordine e' di
// nuovo nello stato `acknowledged` raggiunto in precedenza).
//
// See _shared/adminOrderTransition.ts per la pipeline completa.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

serve(req =>
    performAdminOrderTransition(req, {
        function_name: "unready-order",
        source_status: "ready",
        target_status: "acknowledged",
        timestamp_field: null,
        clear_fields: ["ready_at"]
    })
);
