import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChefHat, Clock, ListChecks, MapPin, Phone, QrCode, Receipt, Store } from "lucide-react";
import type { ActivityDraftField } from "../useActivityDraft";

/**
 * Le parti della Scheda (Officina 3, prototipo C+++ «Scorrono insieme»,
 * scelto da Alex il 2026-10-09). La chiave è anche il valore di `?parte=`
 * nell'indirizzo della vista a fuoco.
 */
export const SCHEDA_PARTS = [
    "locale",
    "orari",
    "contatti",
    "dove",
    "link",
    "offrite",
    "conto",
    "prenotazioni",
    "ordini"
] as const;
export type SchedaPart = (typeof SCHEDA_PARTS)[number];

export const isSchedaPart = (v: string | null): v is SchedaPart =>
    v !== null && (SCHEDA_PARTS as readonly string[]).includes(v);

/** I titoli: ognuno è la domanda a cui la tessera risponde. */
export const PART_TITLE: Record<SchedaPart, string> = {
    locale: "Il locale",
    orari: "Quando siete aperti",
    contatti: "Come vi contattano",
    dove: "Dove vi trovano",
    link: "La vostra pagina e il QR",
    offrite: "Pagamenti e servizi",
    conto: "Al conto, oltre ai piatti",
    prenotazioni: "Prenotazioni online",
    ordini: "Ordini dal tavolo"
};

export const PART_ICON: Record<SchedaPart, LucideIcon> = {
    locale: Store,
    orari: Clock,
    contatti: Phone,
    dove: MapPin,
    link: QrCode,
    offrite: ListChecks,
    conto: Receipt,
    prenotazioni: CalendarDays,
    ordini: ChefHat
};

/** Una riga sotto il titolo della vista a fuoco: perché conta. */
export const PART_WHY: Record<SchedaPart, string> = {
    locale: "La prima cosa che vede chi apre la vostra pagina: la foto, il nome e due righe su di voi.",
    orari: "La pagina dice da sola se siete aperti. Le prenotazioni accettano solo questi orari.",
    contatti: "Quelli con l'occhio aperto sono sulla pagina; gli altri restano solo a voi.",
    dove: "L'indirizzo porta alla mappa. Con Google collegato, chi è contento vi recensisce anche lì.",
    link: "Il QR porta a questa pagina: stampatelo su tavoli, vetrina e volantini.",
    offrite: "Compaiono in fondo alla pagina: il cliente sa prima come può pagare e cosa trova.",
    conto: "Quello che si paga oltre ai piatti, detto prima: al conto niente sorprese.",
    prenotazioni: "Accese, sulla pagina compare «Prenota un tavolo» e le richieste arrivano a voi.",
    ordini: "Accesi, dal QR sul tavolo si ordina e la comanda si stampa da sola."
};

/** Quello che vale subito, senza Salva: lo dice il piede della vista a fuoco. */
export const PART_IMMEDIATE: Partial<Record<SchedaPart, string>> = {
    locale: "La foto vale subito, appena la carichi.",
    orari: "Le chiusure e «Chiudi oggi» valgono subito.",
    dove: "Collegare Google vale subito.",
    link: "Cambiare l'indirizzo vale subito.",
    ordini: "Collegare una stampante vale subito."
};

/** I gruppi del cruscotto, nell'ordine in cui le parti stanno sul telefono. */
export const DASH_GROUPS: { title: string; hint: string; parts: SchedaPart[] }[] = [
    { title: "In cima alla pagina", hint: "Quello che si vede appena la aprono.", parts: ["orari", "contatti"] },
    {
        title: "I due bottoni",
        hint: "Prenotare e ordinare. Si accendono e si spengono da qui, senza Salva.",
        parts: ["prenotazioni", "ordini"]
    },
    { title: "Più in basso", hint: "Dove siete, come si paga, cosa c'è al conto.", parts: ["dove", "offrite", "conto"] }
];

/** L'elenco a lato della vista a fuoco. */
export const RAIL_GROUPS: { title: string; parts: SchedaPart[] }[] = [
    { title: "In cima", parts: ["locale", "link"] },
    { title: "Cosa legge chi vi cerca", parts: ["orari", "dove", "contatti", "offrite", "conto"] },
    { title: "Cosa può fare dalla pagina", parts: ["prenotazioni", "ordini"] }
];

/** Le righe che guidano il telefono: quando una arriva in cima alla scheda,
 *  la sua parte arriva in cima al telefono. */
export const FOLLOW_ANCHORS: SchedaPart[] = ["orari", "prenotazioni", "dove"];

export type SchedaZone = "locale" | "orari" | "prenotazioni" | "dove";

/** La card «Sul telefono» mentre si scorre: dove si è arrivati. */
export const ZONE_CARD: Record<SchedaZone, [string, string]> = {
    locale: ["In cima alla pagina", "Foto, nome e presentazione: la prima cosa che vedono."],
    orari: ["In cima alla pagina", "Aperto o chiuso, e i tasti per chiamarvi e scrivervi."],
    prenotazioni: ["I due bottoni", "«Prenota un tavolo» e il menù, da cui si ordina."],
    dove: ["Più in basso", "Dove siete, come si paga, cosa c'è al conto."]
};

/** La card «Sul telefono» passando su una tessera. Il grassetto è tra **. */
export const PART_CAPTION: Record<SchedaPart, string> = {
    locale: "In cima: la foto, il nome e la presentazione.",
    orari: "«Aperto» o «Chiuso» in alto, e la settimana più giù.",
    contatti: "I tasti per chiamarvi e scrivervi.",
    dove: "L'indirizzo, che porta alla mappa.",
    offrite: "In fondo alla pagina.",
    conto: "In fondo alla pagina, prima del conto.",
    prenotazioni: "Il bottone «Prenota un tavolo».",
    ordini: "Qui non si vede: **si ordina dal QR sul tavolo**.",
    link: "È l'indirizzo di questa pagina."
};
export const HIDDEN_CAPTION = "Adesso **non compare sulla pagina**: è nascosto.";

/** I campi del draft di ogni parte: dicono «Da salvare» e il • nell'elenco. */
export const PART_FIELDS: Record<SchedaPart, (field: ActivityDraftField) => boolean> = {
    locale: f => f === "name" || f === "description",
    orari: () => false,
    contatti: f =>
        [
            "phone",
            "email_public",
            "website",
            "instagram",
            "facebook",
            "whatsapp",
            "phone_public",
            "email_public_visible",
            "website_public",
            "instagram_public",
            "facebook_public",
            "whatsapp_public"
        ].includes(f),
    dove: f => ["address", "street_number", "postal_code", "city", "province"].includes(f),
    link: f => f === "qr_fg_color" || f === "qr_bg_color",
    offrite: f => ["payment_methods", "payment_methods_public", "services", "services_public"].includes(f),
    conto: f => f === "fees" || f === "fees_public",
    prenotazioni: f => f.startsWith("reservation_"),
    ordini: f => f.startsWith("ordering_")
};
