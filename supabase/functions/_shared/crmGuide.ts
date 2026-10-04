// =============================================================================
// CRM interno: la guida in un posto solo (puro, zero import)
// =============================================================================
// Cosa fa ogni agente, ogni stato, ogni tasto e ogni fase, con un esempio.
// La leggono i «Come funziona» di /admin (via alias `@shared/`) e Gea
// (`guideForGea`), così le due spiegazioni non si separano.
// Qui sta anche la regola dei colori di ciò che aspetta (grafica decisa il
// 2026-10-05): arancio dopo 30 minuti, rosso dopo 2 ore, contando solo la
// fascia lavorativa.
// =============================================================================

export type CrmGuideKind = "agente" | "stato" | "tasto" | "fase" | "colore";

export interface CrmGuideTopic {
    id: string;
    kind: CrmGuideKind;
    title: string;
    /** Una riga: cosa è. */
    short: string;
    /** Due o tre frasi: come funziona. */
    body: string;
    /** Un caso concreto. */
    example?: string;
}

export const CRM_GUIDE: readonly CrmGuideTopic[] = [
    // --- Agenti -------------------------------------------------------------
    {
        id: "conversazione",
        kind: "agente",
        title: "Conversazione",
        short: "Prepara la risposta quando un lead scrive su WhatsApp.",
        body: "Legge la chat e le regole del brand e scrive una bozza. In prova la bozza arriva a voi su Telegram e in /admin: parte solo se la approvate. Di notte, da mezzanotte alle 6:30, non scrive.",
        example: "Bar Roma chiede «quanto costa?»: la bozza propone dieci minuti al telefono invece di dare un prezzo."
    },
    {
        id: "solleciti",
        kind: "agente",
        title: "Solleciti",
        short: "Riscrive a chi non risponde.",
        body: "Se il lead non risponde, prepara un messaggio ogni 24-48 ore, fino a 10. Si ferma appena il lead risponde. Funziona solo con le risposte accese.",
        example: "Caffè Centrale non risponde da due giorni: arriva la bozza del secondo sollecito."
    },
    {
        id: "riattivazione",
        kind: "agente",
        title: "Riattivazione",
        short: "Riprova con chi è in Perso per un «non adesso».",
        body: "Dopo i giorni scelti prepara una bozza col testo di riattivazione, una volta sola per locale. Se il lead non risponde entro 7 giorni torna in Perso, senza solleciti. Con il testo vuoto è spenta.",
        example: "Trattoria Bice aveva detto «ne riparliamo dopo l'estate»: dopo 60 giorni arriva la bozza per riprovare."
    },
    {
        id: "revisore",
        kind: "agente",
        title: "Revisore",
        short: "Rilegge ogni bozza prima che arrivi a voi o parta.",
        body: "Controlla la bozza contro le regole del brand e l'ultimo messaggio del lead. Se trova un problema la ferma e dice perché.",
        example: "Una bozza promette un prezzo: il revisore la ferma con «prezzo inventato»."
    },
    {
        id: "decisioni_sensibili",
        kind: "agente",
        title: "Decisioni sensibili",
        short: "Il modello per i casi delicati, predisposto.",
        body: "È il posto per i casi in cui serve più attenzione. Oggi è solo configurato: stop, obiezioni e richieste di parlare con una persona le decide sempre una persona.",
    },
    {
        id: "gea",
        kind: "agente",
        title: "Gea",
        short: "L'assistente del team: risponde alle domande sul CRM.",
        body: "Le si scrive in privato su Telegram o dal pulsante Gea. Legge lead, agenda e pipeline, aggiunge note, sposta fasi e mette in pausa gli agenti. Non scrive mai ai lead.",
        example: "«Chi devo chiamare oggi?»: Gea elenca le telefonate di oggi e chi le fa."
    },
    {
        id: "autonomia",
        kind: "agente",
        title: "Autonomia",
        short: "Le bozze uscite dalla prova partono da sole.",
        body: "Quando è accesa, risposte e solleciti usciti dalla prova partono senza approvazione, ognuno con «Non andava bene, torna in prova» su Telegram. Le richieste per una persona restano sempre da approvare.",
    },
    // --- Stati --------------------------------------------------------------
    {
        id: "acceso",
        kind: "stato",
        title: "Acceso",
        short: "L'agente lavora.",
        body: "Fa il suo passo per ogni lead che ne ha bisogno. Se è in prova, quello che prepara aspetta voi.",
    },
    {
        id: "spento",
        kind: "stato",
        title: "Spento",
        short: "L'agente non fa nulla.",
        body: "Nessuna bozza e nessun invio. Si accende da /admin/agenti.",
    },
    {
        id: "agente_in_prova",
        kind: "stato",
        title: "In prova",
        short: "Ogni messaggio passa da voi.",
        body: "Esce dalla prova con 5 bozze approvate di fila senza modifiche e almeno 3 giorni; dopo una correzione ne bastano 3. Il contatore «3 di 5» dice a che punto è.",
        example: "«In prova · 3 di 5»: ancora due approvate di fila e l'agente esce dalla prova."
    },
    {
        id: "agente_fuori_prova",
        kind: "stato",
        title: "Fuori dalla prova",
        short: "Con l'autonomia accesa, i messaggi partono da soli.",
        body: "Se un messaggio partito da solo non andava bene, «Non andava bene, torna in prova» lo rimette in prova da capo.",
    },
    {
        id: "in_pausa",
        kind: "stato",
        title: "In pausa",
        short: "Tutti gli agenti fermi.",
        body: "La pausa la mettono /admin, Telegram, i tetti di spesa AI o WhatsApp scollegato. La toglie solo una persona.",
        example: "La spesa del giorno arriva al tetto: gli agenti vanno in pausa e vi arriva un avviso."
    },
    {
        id: "lead_fermo",
        kind: "stato",
        title: "Fermo su questo lead",
        short: "Su un lead l'agente non scrive più.",
        body: "Succede quando una persona prende in mano la chat («Scrivo io») o il lead chiede di parlare con qualcuno. Si sblocca dalla scheda del lead.",
    },
    // --- Tasti --------------------------------------------------------------
    {
        id: "inviala_cosi",
        kind: "tasto",
        title: "Inviala così",
        short: "Manda la bozza com'è.",
        body: "Conta come approvata senza modifiche: avvicina l'agente all'uscita dalla prova. Scorciatoia: I.",
    },
    {
        id: "modifica",
        kind: "tasto",
        title: "Modifica",
        short: "Correggi la bozza e mandala.",
        body: "Conta come corretta: l'agente resta in prova e il contatore riparte. Scorciatoia: M.",
    },
    {
        id: "scrivo_io",
        kind: "tasto",
        title: "Scrivo io",
        short: "La chat passa a una persona.",
        body: "La bozza non parte e l'agente si ferma su quel lead finché non lo sbloccate.",
    },
    {
        id: "metti_in_pausa",
        kind: "tasto",
        title: "Metti in pausa tutto",
        short: "Ferma subito tutti gli agenti.",
        body: "Nessuna bozza e nessun invio finché una persona non toglie la pausa. Si può fare anche da Telegram.",
    },
    {
        id: "non_andava_bene",
        kind: "tasto",
        title: "Non andava bene, torna in prova",
        short: "Rimette in prova un agente dopo un messaggio partito da solo.",
        body: "Il messaggio è già partito; da lì in poi ogni bozza torna a passare da voi.",
    },
    // --- Fasi della pipeline (chiavi di crmLabels.ts) -------------------------
    { id: "nuovo", kind: "fase", title: "Nuovo", short: "Appena arrivato, nessuno lo ha ancora contattato.", body: "Dopo 30 minuti senza nessuno che lo segue diventa arancio." },
    { id: "contattato", kind: "fase", title: "Contattato", short: "Gli abbiamo scritto, non ha ancora risposto.", body: "Partono i solleciti, se accesi." },
    { id: "in_conversazione", kind: "fase", title: "In conversazione", short: "Ha risposto e stiamo parlando.", body: "L'obiettivo è fissare una telefonata." },
    { id: "telefonata_fissata", kind: "fase", title: "Telefonata fissata", short: "C'è un giorno e un'ora per la telefonata.", body: "La vedete in Agenda; al lead arrivano conferma e promemoria." },
    { id: "telefonata_fatta", kind: "fase", title: "Telefonata fatta", short: "Ci abbiamo parlato.", body: "Il passo dopo è la demo." },
    { id: "demo_fissata", kind: "fase", title: "Demo fissata", short: "C'è un giorno per mostrare CataloGlobe.", body: "Anche la demo sta in Agenda." },
    { id: "demo_fatta", kind: "fase", title: "Demo fatta", short: "Ha visto CataloGlobe.", body: "Il passo dopo è la prova gratuita." },
    { id: "in_prova", kind: "fase", title: "In prova", short: "Usa CataloGlobe in prova.", body: "Si segue fino al primo pagamento." },
    { id: "cliente_pagante", kind: "fase", title: "Cliente pagante", short: "Ha pagato.", body: "Da qui lo segue il post-vendita." },
    { id: "perso", kind: "fase", title: "Perso", short: "Non va avanti, per ora.", body: "Con un «non adesso» la riattivazione può riprovare più avanti; con uno stop non gli si scrive più." },
    // --- Colori -------------------------------------------------------------
    {
        id: "colore_normale",
        kind: "colore",
        title: "Grigio",
        short: "C'è da fare, con calma.",
        body: "Meno di 30 minuti di attesa in fascia lavorativa.",
    },
    {
        id: "colore_arancio",
        kind: "colore",
        title: "Arancio",
        short: "Sta aspettando.",
        body: "Un lead aspetta da più di 30 minuti, o è nuovo e nessuno lo segue. Filo arancio a sinistra e tempo in arancio.",
        example: "Pizzeria Uno, nuova, nessuno la segue da 40 minuti."
    },
    {
        id: "colore_rosso",
        kind: "colore",
        title: "Rosso",
        short: "Blocca, va fatto adesso.",
        body: "Un lead aspetta da più di 2 ore, o qualcosa è fermo (WhatsApp scollegato, agenti in pausa per i tetti di spesa). Filo rosso e tempo in rosso, mai la riga piena.",
        example: "Bar Roma ha chiesto il prezzo 2 ore fa e la bozza è ancora lì."
    }
];

export function guideTopic(id: string): CrmGuideTopic | undefined {
    return CRM_GUIDE.find(t => t.id === id);
}

export function guideTopicsOf(kind: CrmGuideKind): CrmGuideTopic[] {
    return CRM_GUIDE.filter(t => t.kind === kind);
}

const KIND_HEADING: Record<CrmGuideKind, string> = {
    agente: "Agenti",
    stato: "Stati",
    tasto: "Tasti",
    fase: "Fasi della pipeline",
    colore: "Colori di ciò che aspetta"
};

/** La guida in testo semplice, per il prompt di Gea. */
export function guideForGea(): string {
    const kinds: CrmGuideKind[] = ["agente", "stato", "tasto", "fase", "colore"];
    return kinds
        .map(kind => {
            const lines = guideTopicsOf(kind).map(t => {
                const ex = t.example ? ` Esempio: ${t.example}` : "";
                return `- ${t.title}: ${t.short} ${t.body}${ex}`;
            });
            return `${KIND_HEADING[kind]}\n${lines.join("\n")}`;
        })
        .join("\n\n");
}

// -----------------------------------------------------------------------------
// Il giro di un messaggio (pagina Agenti)
// -----------------------------------------------------------------------------

export interface CrmMessageStep {
    step: 1 | 2 | 3 | 4 | 5;
    title: string;
    /** Chi fa questo passo: id della guida (agenti) o «persone». */
    who: string[];
}

export const CRM_MESSAGE_STEPS: readonly CrmMessageStep[] = [
    { step: 1, title: "Arriva", who: [] },
    { step: 2, title: "Scrive", who: ["conversazione", "solleciti", "riattivazione"] },
    { step: 3, title: "Rilegge", who: ["revisore"] },
    { step: 4, title: "Decidete voi", who: ["persone"] },
    { step: 5, title: "Parte", who: ["autonomia"] }
];

// -----------------------------------------------------------------------------
// Regola dei colori
// -----------------------------------------------------------------------------

export type CrmWaitLevel = "normale" | "arancio" | "rosso";

export const WAIT_ORANGE_MINUTES = 30;
export const WAIT_RED_MINUTES = 120;

/** Fascia lavorativa: dalle 9 alle 20 di Roma, da lunedì a sabato. */
export const WORK_START_MINUTE = 9 * 60;
export const WORK_END_MINUTE = 20 * 60;

const ROME_PARTS = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hourCycle: "h23",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
});

function romeClock(at: number): { minute: number; weekday: string } {
    const p: Record<string, string> = {};
    for (const part of ROME_PARTS.formatToParts(new Date(at))) p[part.type] = part.value;
    return {
        minute: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60,
        weekday: p.weekday
    };
}

/**
 * Minuti passati tra `from` e `to` contando solo la fascia lavorativa:
 * un messaggio arrivato sabato sera non è già rosso lunedì alle 8.
 */
export function workingMinutesBetween(from: Date, to: Date): number {
    let t = from.getTime();
    const end = to.getTime();
    let total = 0;
    for (let guard = 0; t < end && guard < 400; guard++) {
        const { minute, weekday } = romeClock(t);
        const segEnd = Math.min(end, t + (1440 - minute) * 60_000);
        if (weekday !== "Sun") {
            const a = minute;
            const b = minute + (segEnd - t) / 60_000;
            total += Math.max(0, Math.min(b, WORK_END_MINUTE) - Math.max(a, WORK_START_MINUTE));
        }
        t = segEnd;
    }
    return Math.floor(total);
}

export function waitLevel(workingMinutes: number): CrmWaitLevel {
    if (workingMinutes >= WAIT_RED_MINUTES) return "rosso";
    if (workingMinutes >= WAIT_ORANGE_MINUTES) return "arancio";
    return "normale";
}

/** Tempo di attesa sempre nello stesso formato: «5 min», «2 ore», «3 gg». */
export function formatWait(minutes: number): string {
    const m = Math.max(0, Math.floor(minutes));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? "1 ora" : `${h} ore`;
    const d = Math.floor(h / 24);
    return `${d} gg`;
}
