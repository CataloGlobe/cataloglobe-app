/**
 * Post-vendita del CRM (Fase 3): quali gesti proporre per un cliente.
 *
 * Codice puro, zero import: lo usano la pagina /admin/clienti (alias
 * `@shared/`) e crm-sync-accounts, che avvisa il team su Telegram. I dati
 * arrivano da `crm_post_sale_accounts()` e dal locale del CRM; cosa ne ha
 * fatto il team da `crm_post_sale_actions` (migration 20261006090000).
 */

export type PostSaleKind = "abbandono" | "prova_in_scadenza" | "crescita" | "passaparola";

export const POST_SALE_KINDS: PostSaleKind[] = ["abbandono", "prova_in_scadenza", "crescita", "passaparola"];

/** Soglie in giorni (proposte da Claude il 2026-10-05, da rivedere coi primi clienti). */
export const POST_SALE_THRESHOLDS = {
    /** Giorni dalla registrazione senza menù online prima del messaggio d'aiuto. */
    abandonDays: 10,
    /** Giorni alla fine della prova entro cui avvisare. */
    trialEndingDays: 5,
    /** Giorni di menù online, da cliente pagante, prima di proporre Pro o seconda sede. */
    growthDays: 30,
    /** Giorni di menù online, da cliente pagante, prima di chiedere un nome. */
    referralDays: 45,
    /** «Non ora» rimanda di tanti giorni. */
    snoozeDays: 14
} as const;

const DAY_MS = 86_400_000;

export type PostSaleAccount = {
    /** Stato dell'abbonamento sul locale (`crm_venues.account_state`). */
    accountState: string | null;
    trialEndsAt: string | null;
    tenantCreatedAt: string;
    plan: string | null;
    activitiesTotal: number;
    hasLiveMenu: boolean;
    liveMenuSince: string | null;
};

export type PostSaleAction = {
    kind: PostSaleKind;
    alertedAt: string | null;
    doneAt: string | null;
    snoozedUntil: string | null;
};

export type PostSaleSignal = {
    kind: PostSaleKind;
    /** Per «crescita»: cosa proporre. */
    offer?: "pro" | "seconda_sede";
    /** Giorni che fanno scattare il gesto (da quando, o quanti ne mancano). */
    days: number;
};

function daysSince(iso: string | null, now: Date): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / DAY_MS);
}

function daysUntil(iso: string | null, now: Date): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : Math.ceil((t - now.getTime()) / DAY_MS);
}

/** I gesti che oggi hanno senso per il cliente, a prescindere da cosa ne ha fatto il team. */
export function postSaleSignals(account: PostSaleAccount, now: Date): PostSaleSignal[] {
    const t = POST_SALE_THRESHOLDS;
    const state = account.accountState;
    const signals: PostSaleSignal[] = [];
    // Chi ha disdetto o è sospeso non riceve proposte: lì decide il team a mano.
    const alive = state === "registrato" || state === "trialing" || state === "active";
    if (!alive) return signals;

    if (!account.hasLiveMenu) {
        const age = daysSince(account.tenantCreatedAt, now);
        if (age !== null && age >= t.abandonDays) signals.push({ kind: "abbandono", days: age });
    }

    if (state === "trialing") {
        const left = daysUntil(account.trialEndsAt, now);
        if (left !== null && left >= 0 && left <= t.trialEndingDays) {
            signals.push({ kind: "prova_in_scadenza", days: left });
        }
    }

    if (state === "active" && account.hasLiveMenu) {
        const live = daysSince(account.liveMenuSince, now);
        if (live !== null && live >= t.growthDays) {
            const offer = account.plan === "pro" ? (account.activitiesTotal <= 1 ? "seconda_sede" : null) : "pro";
            if (offer) signals.push({ kind: "crescita", offer, days: live });
        }
        if (live !== null && live >= t.referralDays) signals.push({ kind: "passaparola", days: live });
    }

    return signals;
}

/** Il gesto è da fare adesso: non fatto e non rimandato. */
export function isPostSaleOpen(action: PostSaleAction | undefined, now: Date): boolean {
    if (!action) return true;
    if (action.doneAt) return false;
    if (action.snoozedUntil && Date.parse(action.snoozedUntil) > now.getTime()) return false;
    return true;
}

/** Va avvisato il team su Telegram: aperto e mai avvisato (un avviso per gesto, anche dopo «Non ora»). */
export function needsPostSaleAlert(action: PostSaleAction | undefined, now: Date): boolean {
    return isPostSaleOpen(action, now) && !action?.alertedAt;
}

const ROME_PARTS = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23"
});

/**
 * Gli avvisi del post-vendita non sono urgenti: su Telegram solo dal lunedì
 * al venerdì, dalle 10 alle 18 di Roma. Fuori fascia aspettano il giro dopo.
 */
export function isPostSaleAlertTime(now: Date): boolean {
    const parts = ROME_PARTS.formatToParts(now);
    const weekday = parts.find(p => p.type === "weekday")?.value;
    const hour = Number(parts.find(p => p.type === "hour")?.value ?? "0");
    return weekday !== "Sat" && weekday !== "Sun" && hour >= 10 && hour < 18;
}

/** Scadenza di «Non ora». */
export function postSaleSnoozeUntil(now: Date): string {
    return new Date(now.getTime() + POST_SALE_THRESHOLDS.snoozeDays * DAY_MS).toISOString();
}

export const POST_SALE_LABEL: Record<PostSaleKind, string> = {
    abbandono: "Menù non ancora online",
    prova_in_scadenza: "Prova in scadenza",
    crescita: "Momento per crescere",
    passaparola: "Chiedere un passaparola"
};

/** Una riga che dice perché, per la pagina e per Telegram. */
export function postSaleReason(signal: PostSaleSignal): string {
    switch (signal.kind) {
        case "abbandono":
            return `Registrato da ${signal.days} giorni, il menù non è ancora online.`;
        case "prova_in_scadenza":
            return signal.days === 0
                ? "La prova finisce oggi."
                : signal.days === 1
                  ? "La prova finisce domani."
                  : `La prova finisce tra ${signal.days} giorni.`;
        case "crescita":
            return signal.offer === "pro"
                ? `Menù online da ${signal.days} giorni sul piano base: proporre il Pro.`
                : `Menù online da ${signal.days} giorni con una sede: chiedere se ne ha altre.`;
        case "passaparola":
            return `Menù online da ${signal.days} giorni: chiedere se conosce un locale a cui farebbe comodo.`;
    }
}

/**
 * Messaggio proposto, da copiare e adattare. Tono delle regole del brand:
 * diretto, niente promesse, niente sconti. `firstName` (del cliente) e
 * `senderName` (chi del team lo manda) possono mancare.
 */
export function postSaleMessage(signal: PostSaleSignal, firstName: string | null, senderName: string | null): string {
    const hi = firstName ? `Ciao ${firstName}` : "Ciao";
    const me = senderName ? `sono ${senderName} di CataloGlobe` : "ti scrivo da CataloGlobe";
    switch (signal.kind) {
        case "abbandono":
            return `${hi}, ${me}. Ho visto che il menù non è ancora online: se vuoi lo mettiamo su insieme in una chiamata. Quando ti torna comodo?`;
        case "prova_in_scadenza":
            return `${hi}, ${me}. La prova sta per finire: com'è andata finora? Se c'è qualcosa che non ti convince ne parliamo prima che scada.`;
        case "crescita":
            return signal.offer === "pro"
                ? `${hi}, ${me}. Il menù gira da un mese: ti va se ti faccio vedere in cinque minuti cosa aggiunge il Pro (ordini dal tavolo e prenotazioni)?`
                : `${hi}, ${me}. Il menù gira da un mese: hai altri locali dove ti farebbe comodo? Si aggiungono dallo stesso account.`;
        case "passaparola":
            return `${hi}, ${me}. Spero che il menù ti stia dando una mano. Conosci un altro locale a cui potrebbe servire? Se mi dai un nome lo contatto io, dicendo che vengo da parte tua.`;
    }
}
