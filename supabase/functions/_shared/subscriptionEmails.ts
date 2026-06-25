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
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.plan);
    const seats = seatsLabel(opts.seats);
    const monthly = formatEuroCents(opts.monthlyTotalCents);
    const renewal = formatDateIt(opts.renewalDateIso);
    const hasCharge = opts.amountPaidTodayCents != null && opts.amountPaidTodayCents > 0;

    const chargeLine = hasCharge
        ? `Addebito di oggi (riproporzionato per i giorni rimanenti del periodo): <strong>${formatEuroCents(opts.amountPaidTodayCents!)}</strong>.`
        : `L'importo di oggi è stato riproporzionato per i giorni rimanenti del periodo.`;

    const subject = "Piano aggiornato — CataloGlobe";
    const html = card(
        "Piano aggiornato",
        p(`Il tuo piano è ora <strong>${label} · ${seats}</strong>.`) +
            p(chargeLine) +
            p(`Dal <strong>${renewal}</strong> pagherai <strong>${monthly}/mese</strong>.`)
    );
    const text = `Piano aggiornato — CataloGlobe

Il tuo piano è ora ${label} · ${seats}.
${hasCharge ? `Addebito di oggi (riproporzionato): ${formatEuroCents(opts.amountPaidTodayCents!)}.` : `L'importo di oggi è stato riproporzionato per i giorni rimanenti del periodo.`}
Dal ${renewal} pagherai ${monthly}/mese.

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
export function cancelEmail(opts: { activeUntilIso: string | null }): {
    subject: string;
    html: string;
    text: string;
} {
    const date = formatDateIt(opts.activeUntilIso);
    const subject = "Disdetta confermata — CataloGlobe";
    const html = card(
        "Disdetta confermata",
        p(`Il tuo abbonamento è stato disdetto. Resterà <strong>attivo fino al ${date}</strong>; nessun rimborso per il periodo già pagato.`) +
            p("Puoi riattivarlo in qualsiasi momento prima del rinnovo dalla pagina Abbonamento.")
    );
    const text = `Disdetta confermata — CataloGlobe

Il tuo abbonamento è stato disdetto. Resterà attivo fino al ${date}; nessun rimborso per il periodo già pagato.
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
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.targetPlan);
    const seats = seatsLabel(opts.seats);
    const date = formatDateIt(opts.effectiveDateIso);
    const charged = opts.chargedAmountCents != null && opts.chargedAmountCents > 0;
    const chargeLine = charged
        ? `Le sedi sono state addebitate oggi, riproporzionate a tariffa Pro per i giorni rimanenti del periodo: <strong>${formatEuroCents(opts.chargedAmountCents!)}</strong>.`
        : "Le sedi sono state riproporzionate a tariffa Pro per i giorni rimanenti del periodo.";

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
${charged ? `Le sedi sono state addebitate oggi, riproporzionate a tariffa Pro: ${formatEuroCents(opts.chargedAmountCents!)}.` : "Le sedi sono state riproporzionate a tariffa Pro per i giorni rimanenti del periodo."}
Il piano passerà a ${label} il ${date}; da quella data si applicherà la tariffa ${label}.
Ordini e prenotazioni da QR verranno disattivati al rinnovo.

${getEmailFooterText()}`;

    return { subject, html, text };
}

// --- Cambio combinato fallito a metà: sedi pagate, downgrade non programmato --
export function combinedChangePartialFailureEmail(opts: {
    seats: number;
    targetPlan: string;
}): { subject: string; html: string; text: string } {
    const label = planLabel(opts.targetPlan);
    const seats = seatsLabel(opts.seats);

    const subject = "Sedi aggiunte — cambio piano da completare — CataloGlobe";
    const html = card(
        "Sedi aggiunte, cambio piano da completare",
        p(`Le <strong>${seats}</strong> aggiunte sono <strong>attive e già pagate</strong>.`) +
            p(`Il passaggio a <strong>${label}</strong> al rinnovo <strong>non</strong> è stato programmato per un problema temporaneo.`) +
            p("Riprova il cambio di piano dalla pagina Abbonamento: le sedi già pagate non verranno riaddebitate.")
    );
    const text = `Sedi aggiunte — cambio piano da completare — CataloGlobe

Le ${seats} aggiunte sono attive e già pagate.
Il passaggio a ${label} al rinnovo non è stato programmato per un problema temporaneo.
Riprova il cambio di piano dalla pagina Abbonamento: le sedi già pagate non verranno riaddebitate.

${getEmailFooterText()}`;

    return { subject, html, text };
}
