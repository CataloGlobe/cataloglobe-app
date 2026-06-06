// @ts-nocheck
//
// uncancel-to-ready — admin-side endpoint per l'undo immediato di
// "Elimina" quando l'ordine era stato cancellato dallo stato `ready`.
// Usata dal toast "Annulla" lato kanban Comande (anti-mis-click), non
// dal flusso di ripristino da Storico.
//
// Thin wrapper around the shared performAdminOrderTransition helper.
// Azzera SOLO i metadati di cancellazione (`cancelled_at`,
// `cancelled_by`, `cancellation_reason`). `acknowledged_at` e
// `ready_at` restano popolati: l'ordine torna nello stesso `ready`
// raggiunto in precedenza, quei timestamp sono veritieri e vanno
// preservati.
//
// See _shared/adminOrderTransition.ts per la pipeline completa.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { performAdminOrderTransition } from "../_shared/adminOrderTransition.ts";

serve(req =>
    performAdminOrderTransition(req, {
        function_name: "uncancel-to-ready",
        source_status: "cancelled",
        target_status: "ready",
        timestamp_field: null,
        clear_fields: ["cancelled_at", "cancelled_by", "cancellation_reason"]
    })
);
