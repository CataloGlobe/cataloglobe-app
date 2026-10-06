import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import type { CrmAccountState, CrmStage, CrmTrialKind } from "@/types/crm";

/**
 * Etichette dell'account collegato e regola del blocco a mano (decisioni di
 * Alex del 2026-10-01, pipeline-crm). I dati li copia sul locale il job
 * crm-sync-accounts: account_state, trial_kind, trial_ends_at.
 */

const DATE_IT = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Rome"
});

export interface CrmAccountLabel {
    label: string;
    variant: StatusBadgeVariant;
}

/**
 * «Prova con carta · scade il 31/10/2026», «Prova con codice · …» oppure
 * «Registrato, prova non partita». null negli altri casi (nessun account, o
 * uno stato che la fase dice già).
 */
export function crmAccountLabel(venue: {
    account_state: CrmAccountState | null;
    trial_kind: CrmTrialKind | null;
    trial_ends_at: string | null;
}): CrmAccountLabel | null {
    if (venue.account_state === "registrato") {
        return { label: "Registrato, prova non partita", variant: "neutral" };
    }
    if (venue.account_state !== "trialing") return null;
    const kind =
        venue.trial_kind === "codice"
            ? "Prova con codice"
            : venue.trial_kind === "carta"
              ? "Prova con carta"
              : "In prova";
    const ends = venue.trial_ends_at ? ` · scade il ${DATE_IT.format(new Date(venue.trial_ends_at))}` : "";
    return { label: `${kind}${ends}`, variant: "warning" };
}

/** Le fasi che segue il job degli abbonamenti. */
const ACCOUNT_STAGES: CrmStage[] = ["in_prova", "cliente_pagante"];

/**
 * Uno spostamento a mano dentro o fuori da In prova o Cliente pagante chiede
 * di bloccare la fase (con nota), altrimenti il job lo disfarebbe. Perso ha
 * il suo dialogo e il job non lo tocca; una carta già bloccata resta bloccata.
 */
export function needsStageLock(from: CrmStage, to: CrmStage, alreadyLocked: boolean): boolean {
    if (alreadyLocked || from === to || to === "perso") return false;
    return ACCOUNT_STAGES.includes(from) || ACCOUNT_STAGES.includes(to);
}

export const CRM_ACCOUNT_STATE_LABEL: Record<CrmAccountState, string> = {
    registrato: "registrato, prova non partita",
    trialing: "in prova",
    active: "attivo",
    past_due: "pagamento in ritardo",
    suspended: "sospeso",
    canceled: "disdetto"
};
