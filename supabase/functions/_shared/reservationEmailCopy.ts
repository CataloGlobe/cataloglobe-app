// Testi delle email al CLIENTE, nelle cinque lingue della pagina pubblica.
//
// La pagina pubblica parla it/en/fr/de/es. Fino a qui le email si fermavano
// all'italiano: un turista tedesco sceglieva il menu in tedesco e riceveva
// conferma, promemoria e link di disdetta in una lingua che non aveva scelto.
// Questo file e' l'unico posto dove vivono quelle frasi.
//
// ── Cosa NON entra qui ──────────────────────────────────────────────────────
// Le email alla SEDE (nuova prenotazione, disdetta del cliente) restano
// italiane in ogni caso: il destinatario e' il ristoratore e la dashboard e'
// solo italiana. Non hanno nulla da cercare in questo file.
// E non si traduce il contenuto del locale: nome della sede, indirizzo, note
// del cliente passano attraverso come sono. Qui stanno solo le NOSTRE stringhe.
//
// ── Perche' un dizionario TypeScript e non i JSON di src/i18n ───────────────
// I file sotto `src/` non sono raggiungibili dal bundle Deno delle edge
// function, e comunque non contengono queste frasi (sono copy di email, non di
// interfaccia). Restava la scelta fra un JSON qui accanto e un modulo tipizzato:
// vince il modulo, perche' `Record<EmailLang, ReservationEmailCopy>` rende una
// chiave mancante un errore di COMPILAZIONE. Con un JSON la stessa svista
// diventa una stringa vuota dentro un'email gia' partita — un buco al posto di
// una frase, scoperto dal cliente.
//
// ── Tono ────────────────────────────────────────────────────────────────────
// Nessuna riga qui e' una traduzione letterale dell'italiano: e' quello che
// scriverebbe un locale ai propri clienti in quella lingua. Dove la resa
// naturale chiede un'altra struttura, la struttura cambia. Qualche esempio:
//   - il saluto: "Ciao Mario," / "Hi Mario," / "Bonjour Mario," /
//     "Hallo Mario," / "Hola Mario:" (lo spagnolo vuole i due punti);
//   - la continuazione minuscola dopo il saluto vale in italiano, francese,
//     tedesco e spagnolo; in inglese la frase riparte maiuscola solo quando la
//     grammatica lo impone, e qui si mantiene lo stesso andamento delle altre;
//   - il tedesco e' "Sie" — corretto e normale fra locale e cliente — ma con
//     giri caldi ("Wir freuen uns auf Sie", "Bis morgen"), non da manuale;
//   - "Ci vediamo domani" diventa "See you tomorrow" / "À demain" /
//     "Bis morgen" / "Nos vemos mañana": la frase che un ristoratore scrive
//     davvero, non "Promemoria appuntamento".

import { resolveEmailLang, type EmailLang } from "./emailLang.ts";

// Ri-esportate: i chiamanti delle email non hanno motivo di sapere che la
// definizione vive un piano piu' sotto (la condividono con il footer legale).
export {
    DEFAULT_EMAIL_LANG,
    EMAIL_LANGS,
    resolveEmailLang,
    type EmailLang
} from "./emailLang.ts";

/**
 * Evidenziazione di un frammento. Il chiamante passa `s => \`<strong>${s}</strong>\``
 * per l'HTML e `s => s` per il testo semplice, cosi' la stessa frase serve
 * entrambi i formati e non esistono due copie da tenere allineate.
 *
 * Riceve testo GIA' ESCAPATO nel ramo HTML: l'escaping resta responsabilita'
 * del builder, che e' l'unico a sapere in che formato sta scrivendo.
 */
export type Emphasize = (fragment: string) => string;

/**
 * Da quale percorso arriva la conferma. Le due frasi devono restare distinte:
 * in auto-conferma il cliente non ha mai avuto una *richiesta* in attesa, e
 * chiamarla cosi' sarebbe falso.
 *
 * Vive qui e non in `reservationEmails.ts` perche' e' il dizionario a doverne
 * declinare le due varianti; `reservationEmails.ts` lo ri-esporta per i
 * chiamanti storici.
 */
export type ReservationConfirmedVariant = "auto" | "manual";

/** Esiti non confermanti che un admin puo' produrre dalla dashboard. */
export type ReservationOutcomeAction = "decline" | "cancel";

/**
 * Ogni frase che un cliente puo' leggere. Interfaccia esaustiva di proposito:
 * aggiungere un campo qui costringe tutte e cinque le lingue a rispondere, e
 * il compilatore e' l'unico controllo che non si dimentica.
 */
export interface ReservationEmailCopy {
    // --- Saluto e blocco dettagli --------------------------------------------
    greeting(customerName: string): string;
    detailsCaption: string;
    detailsDate: string;
    detailsTime: string;
    detailsPeople: string;

    /** Riga del footer: perche' questa email e' arrivata. */
    customerReason(venue: string): string;

    // --- Ricevuta (richiesta ricevuta, non ancora confermata) ----------------
    receiptSubject(venue: string): string;
    receiptTitle: string;
    /** Prima frase. In HTML si unisce alla seconda con uno spazio, nel testo con un a capo. */
    receiptLead(venue: string, em: Emphasize): string;
    receiptFollow: string;
    receiptNote: string;

    // --- Conferma -------------------------------------------------------------
    confirmedSubject(venue: string): string;
    confirmedTitle: string;
    confirmedBody(venue: string, variant: ReservationConfirmedVariant, em: Emphasize): string;

    // --- Promemoria della sera prima ------------------------------------------
    reminderSubject(venue: string): string;
    reminderTitle: string;
    reminderBody(venue: string, em: Emphasize): string;

    // --- Esiti non confermanti -------------------------------------------------
    outcomeTitle(action: ReservationOutcomeAction): string;
    outcomeBody(venue: string, action: ReservationOutcomeAction, em: Emphasize): string;

    // --- Frase di disdetta -----------------------------------------------------
    /** Apertura, condivisa da HTML e testo. Termina con uno spazio. */
    cancelLead: string;
    /** Testo dell'ancora HTML. */
    cancelLinkLabel: string;
    /** Coda che segue l'ancora. */
    cancelLinkSuffix: string;
    /** Riga che precede l'URL nel testo semplice. */
    cancelTextIntro: string;
    /** Sostituisce tutto quando un link non e' disponibile. */
    cancelFallback: string;

    // --- Bottone "confermo che vengo" (solo promemoria) -------------------------
    confirmButtonLabel: string;
    confirmTextLead: string;

    // --- Allegato calendario ----------------------------------------------------
    icsSummary(venue: string): string;
    icsPeople(partySize: number): string;
    icsCancelLine(url: string): string;
    /** Nome del file allegato. Anche questo lo leggono. */
    icsFilename: string;
}

const IT: ReservationEmailCopy = {
    greeting: name => `Ciao ${name},`,
    detailsCaption: "Dettagli",
    detailsDate: "Data",
    detailsTime: "Ora",
    detailsPeople: "Persone",

    customerReason: venue =>
        `Hai ricevuto questa email perché hai richiesto una prenotazione presso ${venue} tramite CataloGlobe.`,

    receiptSubject: venue => `Abbiamo ricevuto la tua richiesta di prenotazione — ${venue}`,
    receiptTitle: "Richiesta di prenotazione ricevuta",
    receiptLead: (venue, em) =>
        `abbiamo ricevuto la tua richiesta di prenotazione presso ${em(venue)}.`,
    receiptFollow: "Riceverai una conferma via email non appena verrà approvata dal locale.",
    receiptNote: "Questo non è ancora una conferma. La prenotazione è in attesa di approvazione.",

    confirmedSubject: venue => `Prenotazione confermata — ${venue}`,
    confirmedTitle: "Prenotazione confermata",
    confirmedBody: (venue, variant, em) => {
        const noun = variant === "manual" ? "richiesta di prenotazione" : "prenotazione";
        return `Buone notizie! La tua ${noun} presso ${em(venue)} è stata ${em("confermata")}. Ti aspettiamo.`;
    },

    reminderSubject: venue => `Ci vediamo domani — ${venue}`,
    reminderTitle: "Ci vediamo domani",
    reminderBody: (venue, em) => `ti ricordiamo la tua prenotazione di domani presso ${em(venue)}.`,

    outcomeTitle: action =>
        action === "decline" ? "Prenotazione non confermata" : "Prenotazione annullata",
    outcomeBody: (venue, action, em) =>
        action === "decline"
            ? `Ci dispiace, la tua richiesta di prenotazione presso ${em(venue)} ${em("non è stata confermata")}. Puoi provare con una data o un orario diverso.`
            : `La tua prenotazione presso ${em(venue)} è stata ${em("annullata")}. Se ritieni che ci sia stato un errore, contatta direttamente la sede.`,

    cancelLead: "Non puoi più venire? ",
    cancelLinkLabel: "Annulla la prenotazione",
    cancelLinkSuffix: " in un clic.",
    cancelTextIntro: "Annulla la prenotazione da qui:",
    cancelFallback: "Contatta direttamente la sede per annullare la prenotazione.",

    confirmButtonLabel: "Confermo che vengo",
    confirmTextLead: "Confermi che vieni? Basta un tocco:",

    icsSummary: venue => `Prenotazione — ${venue}`,
    icsPeople: partySize => `${partySize} ${partySize === 1 ? "persona" : "persone"}`,
    icsCancelLine: url => `Non puoi più venire? Annulla la prenotazione: ${url}`,
    icsFilename: "prenotazione.ics"
};

const EN: ReservationEmailCopy = {
    greeting: name => `Hi ${name},`,
    detailsCaption: "Details",
    detailsDate: "Date",
    detailsTime: "Time",
    detailsPeople: "People",

    customerReason: venue =>
        `You're receiving this email because you requested a booking at ${venue} through CataloGlobe.`,

    receiptSubject: venue => `We've got your booking request — ${venue}`,
    receiptTitle: "Booking request received",
    receiptLead: (venue, em) => `we've received your booking request for ${em(venue)}.`,
    receiptFollow: "You'll hear from us by email as soon as the venue approves it.",
    receiptNote: "This isn't a confirmation yet — your booking is still waiting to be approved.",

    confirmedSubject: venue => `Booking confirmed — ${venue}`,
    confirmedTitle: "Booking confirmed",
    confirmedBody: (venue, variant, em) => {
        const noun = variant === "manual" ? "booking request" : "booking";
        return `Good news! Your ${noun} at ${em(venue)} has been ${em("confirmed")}. See you soon.`;
    },

    reminderSubject: venue => `See you tomorrow — ${venue}`,
    reminderTitle: "See you tomorrow",
    reminderBody: (venue, em) => `just a quick reminder about your booking tomorrow at ${em(venue)}.`,

    outcomeTitle: action => (action === "decline" ? "Booking not confirmed" : "Booking cancelled"),
    outcomeBody: (venue, action, em) =>
        action === "decline"
            ? `We're sorry — your booking request for ${em(venue)} ${em("wasn't confirmed")}. You're welcome to try a different date or time.`
            : `Your booking at ${em(venue)} has been ${em("cancelled")}. If you think this is a mistake, please contact the venue directly.`,

    cancelLead: "Can't make it? ",
    cancelLinkLabel: "Cancel your booking",
    cancelLinkSuffix: " in one click.",
    cancelTextIntro: "Cancel your booking here:",
    cancelFallback: "Please contact the venue directly to cancel your booking.",

    confirmButtonLabel: "I'll be there",
    confirmTextLead: "Still coming? One tap is all it takes:",

    icsSummary: venue => `Booking — ${venue}`,
    icsPeople: partySize => `${partySize} ${partySize === 1 ? "person" : "people"}`,
    icsCancelLine: url => `Can't make it? Cancel your booking: ${url}`,
    icsFilename: "booking.ics"
};

const FR: ReservationEmailCopy = {
    greeting: name => `Bonjour ${name},`,
    detailsCaption: "Détails",
    detailsDate: "Date",
    detailsTime: "Heure",
    detailsPeople: "Personnes",

    customerReason: venue =>
        `Vous recevez cet e-mail car vous avez demandé une réservation chez ${venue} via CataloGlobe.`,

    receiptSubject: venue => `Nous avons bien reçu votre demande de réservation — ${venue}`,
    receiptTitle: "Demande de réservation reçue",
    receiptLead: (venue, em) =>
        `nous avons bien reçu votre demande de réservation chez ${em(venue)}.`,
    receiptFollow: "Vous recevrez un e-mail dès que l'établissement l'aura acceptée.",
    receiptNote:
        "Ce n'est pas encore une confirmation : votre réservation attend l'accord de l'établissement.",

    confirmedSubject: venue => `Réservation confirmée — ${venue}`,
    confirmedTitle: "Réservation confirmée",
    confirmedBody: (venue, variant, em) => {
        const noun = variant === "manual" ? "demande de réservation" : "réservation";
        return `Bonne nouvelle ! Votre ${noun} chez ${em(venue)} est ${em("confirmée")}. Nous vous attendons.`;
    },

    reminderSubject: venue => `À demain — ${venue}`,
    reminderTitle: "À demain",
    reminderBody: (venue, em) => `un petit rappel pour votre réservation de demain chez ${em(venue)}.`,

    outcomeTitle: action =>
        action === "decline" ? "Réservation non confirmée" : "Réservation annulée",
    outcomeBody: (venue, action, em) =>
        action === "decline"
            ? `Nous sommes désolés, votre demande de réservation chez ${em(venue)} ${em("n'a pas été confirmée")}. Vous pouvez tenter une autre date ou un autre horaire.`
            : `Votre réservation chez ${em(venue)} a été ${em("annulée")}. Si vous pensez qu'il s'agit d'une erreur, contactez directement l'établissement.`,

    cancelLead: "Un empêchement ? ",
    cancelLinkLabel: "Annulez votre réservation",
    cancelLinkSuffix: " en un clic.",
    cancelTextIntro: "Annulez votre réservation ici :",
    cancelFallback: "Contactez directement l'établissement pour annuler votre réservation.",

    confirmButtonLabel: "Je confirme ma venue",
    confirmTextLead: "Vous venez toujours ? Un clic suffit :",

    icsSummary: venue => `Réservation — ${venue}`,
    icsPeople: partySize => `${partySize} ${partySize === 1 ? "personne" : "personnes"}`,
    icsCancelLine: url => `Un empêchement ? Annulez votre réservation : ${url}`,
    icsFilename: "reservation.ics"
};

// Tedesco: "Sie", che e' quello che un locale usa davvero con un cliente, ma
// con formule calde ("Wir freuen uns auf Sie", "Bis morgen") invece del registro
// da comunicazione ufficiale. La minuscola dopo il saluto e' la convenzione
// tedesca, non una svista.
const DE: ReservationEmailCopy = {
    greeting: name => `Hallo ${name},`,
    detailsCaption: "Details",
    detailsDate: "Datum",
    detailsTime: "Uhrzeit",
    detailsPeople: "Personen",

    customerReason: venue =>
        `Sie erhalten diese E-Mail, weil Sie über CataloGlobe eine Reservierung bei ${venue} angefragt haben.`,

    receiptSubject: venue => `Ihre Reservierungsanfrage ist angekommen — ${venue}`,
    receiptTitle: "Reservierungsanfrage erhalten",
    receiptLead: (venue, em) => `wir haben Ihre Reservierungsanfrage für ${em(venue)} erhalten.`,
    receiptFollow: "Sobald das Lokal sie bestätigt, bekommen Sie eine E-Mail von uns.",
    receiptNote:
        "Das ist noch keine Bestätigung — Ihre Reservierung wartet noch auf die Zusage des Lokals.",

    confirmedSubject: venue => `Reservierung bestätigt — ${venue}`,
    confirmedTitle: "Reservierung bestätigt",
    confirmedBody: (venue, variant, em) => {
        const noun = variant === "manual" ? "Reservierungsanfrage" : "Reservierung";
        return `Gute Nachrichten! Ihre ${noun} bei ${em(venue)} ist ${em("bestätigt")}. Wir freuen uns auf Sie.`;
    },

    reminderSubject: venue => `Bis morgen — ${venue}`,
    reminderTitle: "Bis morgen",
    reminderBody: (venue, em) =>
        `wir erinnern Sie kurz an Ihre morgige Reservierung bei ${em(venue)}.`,

    outcomeTitle: action =>
        action === "decline" ? "Reservierung nicht bestätigt" : "Reservierung storniert",
    outcomeBody: (venue, action, em) =>
        action === "decline"
            ? `Leider wurde Ihre Reservierungsanfrage bei ${em(venue)} ${em("nicht bestätigt")}. Versuchen Sie es gerne an einem anderen Tag oder zu einer anderen Uhrzeit.`
            : `Ihre Reservierung bei ${em(venue)} wurde ${em("storniert")}. Sollte das ein Versehen sein, wenden Sie sich bitte direkt an das Lokal.`,

    cancelLead: "Sie schaffen es doch nicht? ",
    cancelLinkLabel: "Reservierung stornieren",
    cancelLinkSuffix: " — mit einem Klick.",
    cancelTextIntro: "Hier stornieren Sie Ihre Reservierung:",
    cancelFallback: "Wenden Sie sich bitte direkt an das Lokal, um zu stornieren.",

    confirmButtonLabel: "Ich komme",
    confirmTextLead: "Sie kommen? Ein Klick genügt:",

    icsSummary: venue => `Reservierung — ${venue}`,
    icsPeople: partySize => `${partySize} ${partySize === 1 ? "Person" : "Personen"}`,
    icsCancelLine: url => `Sie schaffen es doch nicht? Reservierung stornieren: ${url}`,
    icsFilename: "reservierung.ics"
};

const ES: ReservationEmailCopy = {
    // Lo spagnolo apre con i due punti, non con la virgola.
    greeting: name => `Hola ${name}:`,
    detailsCaption: "Detalles",
    detailsDate: "Fecha",
    detailsTime: "Hora",
    detailsPeople: "Personas",

    customerReason: venue =>
        `Recibes este correo porque has solicitado una reserva en ${venue} a través de CataloGlobe.`,

    receiptSubject: venue => `Hemos recibido tu solicitud de reserva — ${venue}`,
    receiptTitle: "Solicitud de reserva recibida",
    receiptLead: (venue, em) => `hemos recibido tu solicitud de reserva en ${em(venue)}.`,
    receiptFollow: "Te escribiremos en cuanto el local la apruebe.",
    receiptNote: "Todavía no es una confirmación: la reserva está pendiente de aprobación.",

    confirmedSubject: venue => `Reserva confirmada — ${venue}`,
    confirmedTitle: "Reserva confirmada",
    confirmedBody: (venue, variant, em) => {
        const noun = variant === "manual" ? "solicitud de reserva" : "reserva";
        return `¡Buenas noticias! Tu ${noun} en ${em(venue)} está ${em("confirmada")}. Te esperamos.`;
    },

    reminderSubject: venue => `Nos vemos mañana — ${venue}`,
    reminderTitle: "Nos vemos mañana",
    reminderBody: (venue, em) => `te recordamos tu reserva de mañana en ${em(venue)}.`,

    outcomeTitle: action => (action === "decline" ? "Reserva no confirmada" : "Reserva cancelada"),
    outcomeBody: (venue, action, em) =>
        action === "decline"
            ? `Lo sentimos, tu solicitud de reserva en ${em(venue)} ${em("no se ha confirmado")}. Puedes probar con otra fecha u otra hora.`
            : `Tu reserva en ${em(venue)} se ha ${em("cancelado")}. Si crees que ha sido un error, ponte en contacto directamente con el local.`,

    cancelLead: "¿No puedes venir? ",
    cancelLinkLabel: "Cancela la reserva",
    cancelLinkSuffix: " en un clic.",
    cancelTextIntro: "Cancela la reserva aquí:",
    cancelFallback: "Ponte en contacto directamente con el local para cancelar la reserva.",

    confirmButtonLabel: "Confirmo que voy",
    confirmTextLead: "¿Confirmas que vienes? Basta un toque:",

    icsSummary: venue => `Reserva — ${venue}`,
    icsPeople: partySize => `${partySize} ${partySize === 1 ? "persona" : "personas"}`,
    icsCancelLine: url => `¿No puedes venir? Cancela la reserva: ${url}`,
    icsFilename: "reserva.ics"
};

/**
 * Tutte le lingue, indicizzate. `Record<EmailLang, …>` e' la garanzia: se
 * domani si aggiunge una lingua a `EMAIL_LANGS` senza scrivere il suo blocco,
 * il progetto non compila.
 */
export const RESERVATION_EMAIL_COPY: Record<EmailLang, ReservationEmailCopy> = {
    it: IT,
    en: EN,
    fr: FR,
    de: DE,
    es: ES
};

/** Scorciatoia: dal valore grezzo della colonna al blocco di copy giusto. */
export function reservationCopyFor(raw: string | null | undefined): ReservationEmailCopy {
    return RESERVATION_EMAIL_COPY[resolveEmailLang(raw)];
}
