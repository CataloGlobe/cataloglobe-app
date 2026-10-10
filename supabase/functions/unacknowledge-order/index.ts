// @ts-nocheck
//
// unacknowledge-order — admin-side endpoint che rimette un ordine da
// `acknowledged` a `submitted` ("Rimetti in Nuove"). Usata dallo staff
// per correggere un Conferma scattato per errore.
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// Resetta `acknowledged_at` perche' torniamo allo stato pre-conferma;
// nessun timestamp dedicato per la transizione indietro (solo
// `updated_at`, gestito dal helper).
//
// `ready_at` non viene toccato: per definizione di `acknowledged` e'
// gia' NULL (ready_at viene popolato solo dalla transizione
// acknowledged -> ready).
//
// See _shared/adminOrderTransition.ts per la pipeline completa.

import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

Deno.serve(req =>
    performAdminOrderTransition(req, {
        function_name: "unacknowledge-order",
        source_status: "acknowledged",
        target_status: "submitted",
        timestamp_field: null,
        clear_fields: ["acknowledged_at"]
    })
);
