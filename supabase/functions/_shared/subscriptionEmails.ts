// @ts-nocheck
import { getEmailFooterHtml, getEmailFooterText } from "./company-config.ts";

// ---------------------------------------------------------------------------
// Template email transazionali per i cambi abbonamento (italiano, brandizzati).
// Ogni funzione ritorna { subject, html, text }. Stile card coerente con gli
// altri edge email (font-stack -apple-system, card max-width:520px).
// ---------------------------------------------------------------------------

const PLAN_LABEL: Record<string, string> = { base: "Base", pro: "Pro" };

function planLabel(plan: string): string {
    return PLAN_LABEL[plan] ?? plan;
}

function seatsLabel(seats: number): string {
    return `${seats} ${seats === 1 ? "sede" : "sedi"}`;
}

function formatDateIt(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function formatEuroCents(cents: number): string {
    return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/** Card HTML standard: titolo + corpo (paragrafi già in HTML) + footer legale. */
function card(title: string, bodyHtml: string): string {
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:40px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
        <h1 style="margin:0 0 16px;font-size:22px;color:#111827">${title}</h1>
        ${bodyHtml}
        ${getEmailFooterHtml()}
    </div>
</div>`.trim();
}

function p(text: string): string {
    return `<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.5">${text}</p>`;
}

// --- Upgrade -----------------------------------------------------------------
export function upgradeEmail(opts: {
    plan: string;
    seats: number;
    amountPaidTodayCents?: number | null;
    monthlyTotalCents: number;
    renewalDateIso: string | null;
    isTrialing: boolean;
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.plan);
    const seats = seatsLabel(opts.seats);
    const monthly = formatEuroCents(opts.monthlyTotalCents);
    const renewal = formatDateIt(opts.renewalDateIso);
    const hasCharge = opts.amountPaidTodayCents != null && opts.amountPaidTodayCents > 0;

    const noChargeLine = opts.isTrialing
        ? `Non ti verrà addebitato nulla finché sei in prova.`
        : `L'importo di oggi è stato riproporzionato per i giorni rimanenti del periodo.`;
    const chargeLine = hasCharge
        ? `Addebito di oggi (riproporzionato per i giorni rimanenti del periodo): <strong>${formatEuroCents(opts.amountPaidTodayCents!)}</strong>.`
        : noChargeLine;

    const subject = "Piano aggiornato — CataloGlobe";
    const html = card(
        "Piano aggiornato",
        p(`Il tuo piano è ora <strong>${label} · ${seats}</strong>.`) +
            p(chargeLine) +
            p(`Dal <strong>${renewal}</strong> pagherai <strong>${monthly}/mese</strong>.`)
    );
    const text = `Piano aggiornato — CataloGlobe

Il tuo piano è ora ${label} · ${seats}.
${hasCharge ? `Addebito di oggi (riproporzionato): ${formatEuroCents(opts.amountPaidTodayCents!)}.` : noChargeLine}
Dal ${renewal} pagherai ${monthly}/mese.

${getEmailFooterText()}`;

    return { subject, html, text };
}

// --- Passaggio all'annuale (passo 4a) ----------------------------------------
// Dedicated template: `upgradeEmail` hard-codes "/mese" and takes the renewal
// date from the pre-change period end, both wrong after an interval change
// (Stripe re-anchors the cycle to today). Amounts come from the real invoice.
export function intervalUpgradeEmail(opts: {
    plan: string;
    seats: number;
    /** amount_paid of the invoice Stripe created at the change (null if unknown). */
    amountPaidTodayCents: number | null;
    /** Sum of the proration lines (negative cents = credit for the unused month). */
    prorationCreditCents: number;
    /** Full recurring yearly total from the Price tiers. */
    yearlyTotalCents: number;
    /** New renewal date (today + 1 year), or trial end while trialing. */
    renewalDateIso: string | null;
    isTrialing: boolean;
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.plan);
    const seats = seatsLabel(opts.seats);
    const yearly = formatEuroCents(opts.yearlyTotalCents);
    const renewal = formatDateIt(opts.renewalDateIso);
    const subject = "Passaggio all'annuale confermato — CataloGlobe";

    if (opts.isTrialing) {
        const html = card(
            "Passaggio all'annuale confermato",
            p(`Il tuo abbonamento passerà alla fatturazione annuale alla fine della prova: <strong>${label} · ${seats}</strong>.`) +
                p(`Nessun addebito oggi. Il primo addebito, di <strong>${yearly}</strong>, è previsto per il <strong>${renewal}</strong>.`)
        );
        const text = `Passaggio all'annuale confermato — CataloGlobe

Il tuo abbonamento passerà alla fatturazione annuale alla fine della prova: ${label} · ${seats}.
Nessun addebito oggi. Il primo addebito, di ${yearly}, è previsto per il ${renewal}.

${getEmailFooterText()}`;
        return { subject, html, text };
    }

    const credit = Math.max(0, -opts.prorationCreditCents);
    const paid = opts.amountPaidTodayCents != null ? formatEuroCents(opts.amountPaidTodayCents) : null;
    const chargeLine = paid
        ? `Oggi abbiamo addebitato <strong>${paid}</strong>: l'anno intero (${yearly}) meno il non consumato del mese in corso (${formatEuroCents(credit)}).`
        : `Oggi abbiamo addebitato l'anno intero (${yearly}) meno il non consumato del mese in corso.`;
    const chargeText = paid
        ? `Oggi abbiamo addebitato ${paid}: l'anno intero (${yearly}) meno il non consumato del mese in corso (${formatEuroCents(credit)}).`
        : `Oggi abbiamo addebitato l'anno intero (${yearly}) meno il non consumato del mese in corso.`;

    const html = card(
        "Passaggio all'annuale confermato",
        p(`Il tuo abbonamento è passato alla fatturazione annuale: <strong>${label} · ${seats}</strong>.`) +
            p(chargeLine) +
            p(`Il ciclo riparte da oggi. Prossimo rinnovo: <strong>${renewal}</strong>, a ${yearly}.`)
    );
    const text = `Passaggio all'annuale confermato — CataloGlobe

Il tuo abbonamento è passato alla fatturazione annuale: ${label} · ${seats}.
${chargeText}
Il ciclo riparte da oggi. Prossimo rinnovo: ${renewal}, a ${yearly}.

${getEmailFooterText()}`;
    return { subject, html, text };
}

// --- Passaggio al mensile (passo 4b) ------------------------------------------
// Dedicated template: `downgradeEmail` names plan and seats only, and here
// both are unchanged — it would read as a change to itself. The point of this
// message is that NOTHING changes until the paid year ends.
export function intervalDowngradeEmail(opts: {
    plan: string;
    seats: number;
    /** Full recurring monthly total from the Price tiers. */
    monthlyTotalCents: number;
    /** End of the current period (active) or trial end (trialing). */
    effectiveDateIso: string | null;
    isTrialing: boolean;
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.plan);
    const seats = seatsLabel(opts.seats);
    const monthly = formatEuroCents(opts.monthlyTotalCents);
    const date = formatDateIt(opts.effectiveDateIso);

    if (opts.isTrialing) {
        const subject = "Passaggio al mensile confermato — CataloGlobe";
        const html = card(
            "Passaggio al mensile confermato",
            p(`La fatturazione del tuo abbonamento <strong>${label} · ${seats}</strong> è ora mensile.`) +
                p(`Nessun addebito ora: il primo addebito di <strong>${monthly}</strong> arriva alla fine della prova, il <strong>${date}</strong>.`)
        );
        const text = `Passaggio al mensile confermato — CataloGlobe

La fatturazione del tuo abbonamento ${label} · ${seats} è ora mensile.
Nessun addebito ora: il primo addebito di ${monthly} arriva alla fine della prova, il ${date}.

${getEmailFooterText()}`;
        return { subject, html, text };
    }

    const subject = "Passaggio al mensile programmato — CataloGlobe";
    const html = card(
        "Passaggio al mensile programmato",
        p(`Abbiamo registrato la tua richiesta di passare alla fatturazione mensile per <strong>${label} · ${seats}</strong>.`) +
            p(`Il passaggio avviene il <strong>${date}</strong>, alla scadenza dell'anno in corso. Fino ad allora non cambia nulla: stesso servizio, nessun rimborso, nessun addebito.`) +
            p(`Da quella data pagherai <strong>${monthly} al mese</strong>.`) +
            p("Puoi annullare la richiesta in qualsiasi momento prima di quella data, dalla pagina Abbonamento.")
    );
    const text = `Passaggio al mensile programmato — CataloGlobe

Abbiamo registrato la tua richiesta di passare alla fatturazione mensile per ${label} · ${seats}.
Il passaggio avviene il ${date}, alla scadenza dell'anno in corso. Fino ad allora non cambia nulla: stesso servizio, nessun rimborso, nessun addebito.
Da quella data pagherai ${monthly} al mese.
Puoi annullare la richiesta in qualsiasi momento prima di quella data, dalla pagina Abbonamento.

${getEmailFooterText()}`;
    return { subject, html, text };
}

// --- Downgrade programmato ---------------------------------------------------
export function downgradeEmail(opts: {
    plan: string;
    seats: number;
    effectiveDateIso: string | null;
    losesQrFeatures: boolean;
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.plan);
    const seats = seatsLabel(opts.seats);
    const date = formatDateIt(opts.effectiveDateIso);
    const qrNote = opts.losesQrFeatures
        ? "Ordini e prenotazioni da QR verranno disattivati al rinnovo."
        : "";

    const subject = "Cambio di piano programmato — CataloGlobe";
    const html = card(
        "Cambio di piano programmato",
        p(`Cambio programmato: passerai a <strong>${label} · ${seats}</strong> il <strong>${date}</strong>.`) +
            (qrNote ? p(qrNote) : "")
    );
    const text = `Cambio di piano programmato — CataloGlobe

Cambio programmato: passerai a ${label} · ${seats} il ${date}.${qrNote ? `\n${qrNote}` : ""}

${getEmailFooterText()}`;

    return { subject, html, text };
}

// --- Disdetta ----------------------------------------------------------------
export function cancelEmail(opts: { activeUntilIso: string | null; isTrialing: boolean }): {
    subject: string;
    html: string;
    text: string;
} {
    const date = formatDateIt(opts.activeUntilIso);
    const subject = "Disdetta confermata — CataloGlobe";
    const mainLine = opts.isTrialing
        ? `La tua prova è stata disdetta. Resterà <strong>attiva fino al ${date}</strong> e non ti verrà addebitato nulla: la prova è gratuita.`
        : `Il tuo abbonamento è stato disdetto. Resterà <strong>attivo fino al ${date}</strong>; nessun rimborso per il periodo già pagato.`;
    const mainLineText = opts.isTrialing
        ? `La tua prova è stata disdetta. Resterà attiva fino al ${date} e non ti verrà addebitato nulla: la prova è gratuita.`
        : `Il tuo abbonamento è stato disdetto. Resterà attivo fino al ${date}; nessun rimborso per il periodo già pagato.`;
    const html = card(
        "Disdetta confermata",
        p(mainLine) +
            p("Puoi riattivarlo in qualsiasi momento prima del rinnovo dalla pagina Abbonamento.")
    );
    const text = `Disdetta confermata — CataloGlobe

${mainLineText}
Puoi riattivarlo in qualsiasi momento prima del rinnovo dalla pagina Abbonamento.

${getEmailFooterText()}`;

    return { subject, html, text };
}

// --- Riattivazione -----------------------------------------------------------
export function reactivateEmail(opts: { renewalDateIso: string | null }): {
    subject: string;
    html: string;
    text: string;
} {
    const date = formatDateIt(opts.renewalDateIso);
    const subject = "Abbonamento riattivato — CataloGlobe";
    const html = card(
        "Abbonamento riattivato",
        p("La disdetta è stata annullata: il tuo abbonamento continuerà regolarmente.") +
            p(`Prossimo rinnovo il <strong>${date}</strong>.`)
    );
    const text = `Abbonamento riattivato — CataloGlobe

La disdetta è stata annullata: il tuo abbonamento continuerà regolarmente.
Prossimo rinnovo il ${date}.

${getEmailFooterText()}`;

    return { subject, html, text };
}

// --- Cambio combinato: sedi subito + downgrade programmato (happy path) ------
export function combinedChangeEmail(opts: {
    seats: number;
    targetPlan: string;
    chargedAmountCents?: number | null;
    effectiveDateIso: string | null;
    isTrialing: boolean;
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.targetPlan);
    const seats = seatsLabel(opts.seats);
    const date = formatDateIt(opts.effectiveDateIso);
    const charged = opts.chargedAmountCents != null && opts.chargedAmountCents > 0;
    const noChargeLine = opts.isTrialing
        ? `Non ti verrà addebitato nulla finché sei in prova.`
        : "Le sedi sono state riproporzionate a tariffa Pro per i giorni rimanenti del periodo.";
    const chargeLine = charged
        ? `Le sedi sono state addebitate oggi, riproporzionate a tariffa Pro per i giorni rimanenti del periodo: <strong>${formatEuroCents(opts.chargedAmountCents!)}</strong>.`
        : noChargeLine;

    const subject = "Sedi aggiunte e cambio programmato — CataloGlobe";
    const html = card(
        "Sedi aggiunte e cambio programmato",
        p(`Le <strong>${seats}</strong> aggiunte sono attive da subito.`) +
            p(chargeLine) +
            p(`Il piano passerà a <strong>${label}</strong> il <strong>${date}</strong>; da quella data si applicherà la tariffa ${label}.`) +
            p("Ordini e prenotazioni da QR verranno disattivati al rinnovo.")
    );
    const text = `Sedi aggiunte e cambio programmato — CataloGlobe

Le ${seats} aggiunte sono attive da subito.
${charged ? `Le sedi sono state addebitate oggi, riproporzionate a tariffa Pro: ${formatEuroCents(opts.chargedAmountCents!)}.` : noChargeLine}
Il piano passerà a ${label} il ${date}; da quella data si applicherà la tariffa ${label}.
Ordini e prenotazioni da QR verranno disattivati al rinnovo.

${getEmailFooterText()}`;

    return { subject, html, text };
}

// --- Cambio combinato fallito a metà: sedi pagate, downgrade non programmato --
export function combinedChangePartialFailureEmail(opts: {
    seats: number;
    targetPlan: string;
    isTrialing: boolean;
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.targetPlan);
    const seats = seatsLabel(opts.seats);

    const seatsLine = opts.isTrialing
        ? `Le <strong>${seats}</strong> aggiunte sono <strong>attive</strong>. Non ti verrà addebitato nulla finché sei in prova.`
        : `Le <strong>${seats}</strong> aggiunte sono <strong>attive e già pagate</strong>.`;
    const seatsLineText = opts.isTrialing
        ? `Le ${seats} aggiunte sono attive. Non ti verrà addebitato nulla finché sei in prova.`
        : `Le ${seats} aggiunte sono attive e già pagate.`;
    const retryLine = opts.isTrialing
        ? "Riprova il cambio di piano dalla pagina Abbonamento."
        : "Riprova il cambio di piano dalla pagina Abbonamento: le sedi già pagate non verranno riaddebitate.";

    const subject = "Sedi aggiunte — cambio piano da completare — CataloGlobe";
    const html = card(
        "Sedi aggiunte, cambio piano da completare",
        p(seatsLine) +
            p(`Il passaggio a <strong>${label}</strong> al rinnovo <strong>non</strong> è stato programmato per un problema temporaneo.`) +
            p(retryLine)
    );
    const text = `Sedi aggiunte — cambio piano da completare — CataloGlobe

${seatsLineText}
Il passaggio a ${label} al rinnovo non è stato programmato per un problema temporaneo.
${retryLine}

${getEmailFooterText()}`;

    return { subject, html, text };
}
