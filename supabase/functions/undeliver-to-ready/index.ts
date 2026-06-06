// @ts-nocheck
//
// undeliver-to-ready — admin-side endpoint che riporta un ordine da
// `delivered` a `ready`. Usata come undo di "Servita" quando l'ordine
// veniva dalla colonna "Pronte", cosi' torna esattamente dove era.
//
// Per il caso `delivered` ← `acknowledged` (skip-ready / "Servito
// direttamente") l'undo continua a passare per `restore-order`
// (delivered → acknowledged, azzera anche ready_at che era NULL).
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// Azzera SOLO `delivered_at`; `ready_at` resta popolato perche'
// l'ordine torna proprio nello stato `ready` raggiunto in precedenza,
// quel timestamp e' veritiero e va preservato.
//
// See _shared/adminOrderTransition.ts per la pipeline completa.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

serve(req =>
    performAdminOrderTransition(req, {
        function_name: "undeliver-to-ready",
        source_status: "delivered",
        target_status: "ready",
        timestamp_field: null,
        clear_fields: ["delivered_at"]
    })
);
