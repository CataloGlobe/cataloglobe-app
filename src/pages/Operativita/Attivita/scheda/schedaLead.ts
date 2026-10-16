import type { LeadPart } from "@/pages/Dashboard/Vetrina/vetrinaModel";
import { formatInactiveReason } from "@/utils/activityStatus";
import { hh, reopenText, type SchedaFacts } from "./schedaModel";

/**
 * La frase in cima alla Scheda nella D (Visual Redesign 2, PR 11b; copia
 * `pSch1`): se la sede è aperta e fino a quando, e cosa vedono i clienti.
 * `menu`: il menù in onda; `null` nessuno; `undefined` non ancora caricato.
 */
export function schedaLead(f: SchedaFacts, menu: string | null | undefined): LeadPart[] {
    const { a } = f;
    const name = a.name;
    if (a.status === "inactive") {
        const why = a.inactive_reason ? formatInactiveReason(a.inactive_reason) : "Sospesa";
        return [{ down: `${name} è sospesa` }, { text: `: chi apre il link legge «${why}», non il menù.` }];
    }
    const sees: LeadPart[] =
        menu === undefined ? [{ text: "." }] : menu ? [{ text: " e i clienti vedono " }, { name: menu }, { text: "." }] : [{ text: ", ma " }, { down: "non mostra nessun menù" }, { text: "." }];
    if (f.closure?.is_closed) {
        return [{ text: `Oggi ${name} è ` }, { down: "chiusa" }, { text: f.reopen ? `: ${reopenText(f.reopen, f.now)}.` : "." }];
    }
    if (!f.hasHours) return [{ text: `${name} non ha ancora gli orari` }, ...sees];
    const s = f.spans.find(x => f.now.minutes >= x.a && f.now.minutes < x.b);
    if (s) return [{ text: `Adesso ${name} è ` }, { strong: `aperta fino alle ${hh(s.b)}` }, ...sees];
    const nx = f.spans.find(x => x.a > f.now.minutes);
    const when = nx ? `riapre alle ${hh(nx.a)}` : f.reopen ? reopenText(f.reopen, f.now) : null;
    // Fra due turni o a fine giornata: quando si riapre, il menù lo dirà allora.
    return [{ text: `Adesso ${name} è chiusa${when ? `: ${when}` : ""}.` }];
}
