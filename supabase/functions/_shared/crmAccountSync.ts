// =============================================================================
// CRM interno: legame lead e account, regole pure (zero import)
// =============================================================================
//
// Decisione di Alex (2026-10-01): telefono identico (E.164) = collegamento
// automatico; email o nome del locale uguali = solo proposta. La fase segue
// l'abbonamento del tenant collegato:
//   trialing → In prova · active → Cliente pagante · altri stati → nessuno
// e si muove solo in avanti (mai da Cliente pagante a In prova). In prova
// solo quando la prova parte davvero: chi si registra senza farla partire
// resta nella sua fase («Registrato, prova non partita»).
// Decisioni del 2026-10-01: Perso non lo tocca mai il job; una carta con la
// «Fase bloccata a mano» non si sposta (il job scrive solo i cambi di
// abbonamento nella storia).
//
// Usato dall'edge `crm-sync-accounts` e provato da crmAccountSync.test.ts.
// =============================================================================

export type CrmStageKey =
    | "nuovo"
    | "contattato"
    | "in_conversazione"
    | "appuntamento"
    | "chiamata_fatta"
    | "in_prova"
    | "cliente_pagante"
    | "perso";

const RANK: Record<CrmStageKey, number> = {
    nuovo: 0,
    contattato: 1,
    in_conversazione: 2,
    appuntamento: 3,
    chiamata_fatta: 4,
    in_prova: 5,
    cliente_pagante: 6,
    perso: -1
};

export function stageForSubscription(status: string | null | undefined): CrmStageKey | null {
    if (status === "trialing") return "in_prova";
    if (status === "active") return "cliente_pagante";
    return null;
}

/** La fase verso cui spostare la carta, o null se resta dov'è. */
export function nextStageForAccount(
    current: CrmStageKey,
    subscriptionStatus: string | null | undefined,
    options: { locked?: boolean } = {}
): CrmStageKey | null {
    if (options.locked || current === "perso") return null;
    const target = stageForSubscription(subscriptionStatus);
    if (!target || target === current) return null;
    return RANK[target] > RANK[current] ? target : null;
}

export type CrmAccountState = "registrato" | "trialing" | "active" | "past_due" | "suspended" | "canceled";

/**
 * Stato dell'account per il CRM: senza subscription Stripe la prova non è
 * mai partita ('registrato'), anche se subscription_status è il default
 * 'suspended'. `stripe_subscription_id` non si azzera mai, nemmeno a disdetta.
 */
export function accountStateFor(tenant: {
    subscription_status: string | null;
    stripe_subscription_id: string | null;
}): CrmAccountState {
    if (!tenant.stripe_subscription_id) return "registrato";
    const status = tenant.subscription_status;
    if (status === "trialing" || status === "active" || status === "past_due" || status === "canceled") {
        return status;
    }
    return "suspended";
}

/**
 * Prova con codice = subscription creata con un codice `trial_no_card`
 * (stripe-checkout scrive `trial_no_card: "true"` nei metadata); senza, è la
 * prova con carta. Il database non lo conserva: si legge da Stripe.
 */
export function trialKindFromMetadata(metadata: Record<string, string> | null | undefined): "carta" | "codice" {
    return metadata?.trial_no_card === "true" ? "codice" : "carta";
}

export interface TenantCandidate {
    id: string;
    name: string;
    subscription_status: string | null;
    created_at: string;
}

const STATUS_PREFERENCE: Record<string, number> = { active: 2, trialing: 1 };

/**
 * Lo stesso proprietario può avere più aziende: si collega quella più avanti
 * (active, poi trialing), a parità la più recente.
 */
export function pickTenant(candidates: TenantCandidate[]): TenantCandidate | null {
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
        const byStatus =
            (STATUS_PREFERENCE[b.subscription_status ?? ""] ?? 0) -
            (STATUS_PREFERENCE[a.subscription_status ?? ""] ?? 0);
        if (byStatus !== 0) return byStatus;
        return b.created_at.localeCompare(a.created_at);
    })[0];
}

/** Nome confrontabile: minuscole, senza accenti né punteggiatura. */
export function normalizeVenueName(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
