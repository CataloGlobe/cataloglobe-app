// =============================================================================
// CRM interno: etichette di fasi e fonti (puro, zero import)
// =============================================================================
// Fonte unica per /admin (via alias `@shared/`) e per le edge del CRM
// (messaggi Telegram). Le chiavi sono i valori dei CHECK di
// 20261001120000_crm_tables.sql.
// =============================================================================

export type CrmStageKey =
    | "nuovo"
    | "contattato"
    | "in_conversazione"
    | "telefonata_fissata"
    | "telefonata_fatta"
    | "demo_fissata"
    | "demo_fatta"
    | "in_prova"
    | "cliente_pagante"
    | "perso";

export type CrmSourceKey = "landing" | "meta_form" | "whatsapp" | "manuale";

/** Le 10 colonne della pipeline (wiki: pipeline-crm; telefonata e demo separate, mig 20261002140000). */
export const CRM_STAGE_LABEL: Record<CrmStageKey, string> = {
    nuovo: "Nuovo",
    contattato: "Contattato",
    in_conversazione: "In conversazione",
    telefonata_fissata: "Telefonata fissata",
    telefonata_fatta: "Telefonata fatta",
    demo_fissata: "Demo fissata",
    demo_fatta: "Demo fatta",
    in_prova: "In prova",
    cliente_pagante: "Cliente pagante",
    perso: "Perso"
};

export const CRM_SOURCE_LABEL: Record<CrmSourceKey, string> = {
    landing: "Landing",
    meta_form: "Modulo Meta",
    whatsapp: "Chat WhatsApp",
    manuale: "A mano"
};
