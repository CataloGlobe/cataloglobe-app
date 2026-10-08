/**
 * Testi della landing di campagna (Versione C), nell'ordine della pagina.
 *
 * È il file da rivedere per le copy: i componenti non contengono stringhe
 * italiane. Le CTA («Richiedi una demo» / «Provalo gratis») stanno in `cta.ts`,
 * perché cambiano con la variante.
 *
 * Dove il testo mobile è più corto, il campo ha la variante `…Mobile`.
 */

import type { LeadField, LeadFieldError, LeadInterest } from "@/utils/leadValidation";

/** Titolo a due tempi: la seconda parte è blu (a capo o in riga, secondo la sezione). */
export type SplitTitle = { lead: string; accent: string };

/** Titolo con una parola sottolineata a mano in mezzo. */
export type UnderlinedTitle = { before: string; underlined: string; after: string };

// ── Barra e marchio ─────────────────────────────────────────────────────────

export const BRAND = {
    /** Testo alternativo del logo. */
    name: "CataloGlobe",
    login: { label: "Accedi", href: "/login" }
};

// ── 1 · Hero ────────────────────────────────────────────────────────────────

export type HeroMenu = {
    name: string;
    chips: string[];
    cats: { name: string; dishes: { name: string; desc: string; price: number }[] }[];
};

export type HeroLive = {
    time: string;
    text: string;
    after: 0 | 1 | 2;
    menu: 0 | 1 | 2;
    row: number;
} & ({ kind: "price"; to: number } | { kind: "sold" });

export const HERO = {
    eyebrow: "Menù digitale per ristoranti",
    title: { before: "Il menù che si aggiorna da solo. Tu pensi ", underlined: "alla sala.", after: "" } satisfies UnderlinedTitle,
    lede: "Cambi un prezzo o segni un piatto finito dal telefono: il menù che i clienti aprono dal QR è subito giusto.",
    /**
     * Telefono simulato (`HeroPhone`): i tre menù del locale d'esempio, uno per
     * fascia. Prezzi numeri; `live` sono le modifiche al volo della sequenza
     * (`heroSequence.ts`), con la riga del menù che cambiano.
     */
    phone: {
        venue: "Il tuo locale",
        /** Ora in barra di stato prima che parta la giornata. */
        startClock: "11:58",
        menus: [
            {
                name: "Menù Pranzo",
                chips: ["Primi", "Secondi", "Contorni", "Bevande"],
                cats: [
                    {
                        name: "Primi",
                        dishes: [
                            { name: "Spaghetti al pomodoro", desc: "Pomodoro, basilico, parmigiano", price: 12 },
                            { name: "Risotto ai porcini", desc: "Porcini, burro, parmigiano", price: 14 }
                        ]
                    },
                    {
                        name: "Secondi",
                        dishes: [
                            { name: "Insalata di mare", desc: "Polpo, gamberi, sedano, limone", price: 16 },
                            { name: "Tagliata di manzo", desc: "Rucola e scaglie di grana", price: 23 },
                            { name: "Cotoletta alla milanese", desc: "Con patate al forno", price: 19 }
                        ]
                    },
                    {
                        name: "Contorni",
                        dishes: [
                            { name: "Verdure grigliate", desc: "Di stagione", price: 6 },
                            { name: "Patate al forno", desc: "Rosmarino e sale grosso", price: 5 }
                        ]
                    }
                ]
            },
            {
                name: "Menù Aperitivo",
                chips: ["Cocktail", "Stuzzichini", "Vini", "Birre"],
                cats: [
                    {
                        name: "Cocktail",
                        dishes: [
                            { name: "Spritz della casa", desc: "Aperitivo, prosecco, arancia", price: 8 },
                            { name: "Negroni", desc: "Gin, vermouth, bitter", price: 9 },
                            { name: "Analcolico alla frutta", desc: "Frutta fresca e soda", price: 6 }
                        ]
                    },
                    {
                        name: "Stuzzichini",
                        dishes: [
                            { name: "Bruschette miste", desc: "Pomodoro, basilico, olio nuovo", price: 7 },
                            { name: "Tagliere della casa", desc: "Salumi e formaggi del territorio", price: 14 },
                            { name: "Olive e taralli", desc: "Da condividere", price: 5 },
                            { name: "Focaccia calda", desc: "Olio e sale grosso", price: 4 }
                        ]
                    }
                ]
            },
            {
                name: "Menù Cena",
                chips: ["Antipasti", "Primi", "Secondi", "Dolci", "Vini"],
                cats: [
                    {
                        name: "Antipasti",
                        dishes: [
                            { name: "Carpaccio di tonno", desc: "Agrumi e finocchio", price: 16 },
                            { name: "Bruschette miste", desc: "Pomodoro, basilico, olio nuovo", price: 7 }
                        ]
                    },
                    {
                        name: "Primi",
                        dishes: [
                            { name: "Spaghetti al pomodoro", desc: "Pomodoro, basilico, parmigiano", price: 12 },
                            { name: "Tagliolini al tartufo", desc: "Burro e tartufo nero", price: 18 }
                        ]
                    },
                    {
                        name: "Secondi",
                        dishes: [
                            { name: "Tagliata di manzo", desc: "Rucola e scaglie di grana", price: 23 },
                            { name: "Branzino al sale", desc: "Con verdure di stagione", price: 22 }
                        ]
                    },
                    { name: "Vini", dishes: [{ name: "Calice di rosso", desc: "Nero d’Avola", price: 6 }] }
                ]
            }
        ] satisfies HeroMenu[],
        unavailable: "Non disponibile"
    },
    /** Programmazione di oggi: fasce programmate (viola) e modifiche al volo (terracotta). */
    schedule: {
        title: "Programmazione di oggi",
        now: "In corso",
        running: "in corso",
        liveLabel: "Modifica al volo",
        slots: [
            { time: "12:00", name: "Pranzo" },
            { time: "18:00", name: "Aperitivo" },
            { time: "20:00", name: "Cena" }
        ],
        /**
         * `after`: fascia dopo cui compare in lista; `menu` + `row`: la riga del
         * telefono (indice nel menù, contando tutte le categorie).
         */
        live: [
            { time: "13:10", text: "Insalata di mare 17 €", after: 0, menu: 0, row: 2, kind: "price", to: 17 },
            { time: "19:25", text: "Bruschette esaurite", after: 1, menu: 1, row: 3, kind: "sold" }
        ] satisfies HeroLive[]
    }
};


// ── 2-4 · Tre problemi, tre soluzioni ───────────────────────────────────────

export type ProblemCopy = {
    note: string;
    title: SplitTitle;
    lede: string;
    solution: string;
    /** Badge «Piano Pro» accanto a «Con CataloGlobe». */
    pro?: boolean;
};

export const WITH_US = "Con CataloGlobe";
/** Le due metà della scheda telefono → menù del cliente (PhoneQrCard). */
export const PHONE_LABEL = "Dal tuo telefono";
export const CUSTOMER_LABEL = "Il menù del cliente, dal QR";
export const PRO_BADGE = "Piano Pro";

export const SUPPLIER = {
    copy: {
        note: "i costi salgono…",
        title: { lead: "Il fornitore aumenta.", accent: "E tu rimandi la ristampa." },
        lede: "Alzare un prezzo sulla carta vuol dire ristampare tutto il menù, e così si rimanda. Intanto la differenza la paghi tu, piatto dopo piatto.",
        solution: "Lo cambi dal telefono: il menù che si apre dal QR è subito giusto, e il PDF da stampare si aggiorna da solo."
    } satisfies ProblemCopy,
    /**
     * Scheda: all'ingresso nello schermo il prezzo della tagliata sale da 22 a
     * 23 €, poi il campo è uno stepper vero (18–28 €, passo 1 €).
     */
    card: {
        dish: "Tagliata di manzo",
        base: 22,
        raised: 23,
        min: 18,
        max: 28,
        decrease: "Abbassa il prezzo della tagliata di 1 €",
        increase: "Alza il prezzo della tagliata di 1 €",
        rows: [
            { name: "Branzino al sale", price: "22 €" },
            { name: "Tagliata di manzo", price: "22 €", raised: true },
            { name: "Filetto al pepe verde", price: "26 €" }
        ] satisfies { name: string; price: string; raised?: boolean }[]
    },
    hint: "Prova a cambiare il prezzo e guarda il menù del cliente.",
    loss: {
        amount: "≈500 €",
        text: "al mese persi su un piatto, finché aspetti la ristampa.",
        math: "1 € in più × 20 tagliate × 26 sere"
    }
};

export const SOLD_OUT = {
    copy: {
        note: "mi dispiace, non c’è più…",
        title: { lead: "Un piatto è finito.", accent: "Nel menù c’è ancora." },
        lede: "Il cliente lo sceglie e il cameriere deve tornare al tavolo a dirgli che non c’è. Succede ogni volta che qualcosa finisce a metà servizio.",
        solution: "Lo segni esaurito dal telefono e scegli tu: lo nascondi dal menù o lo lasci visibile come non disponibile. E se finisce un ingrediente, nascondi in un colpo tutti i piatti che lo usano."
    } satisfies ProblemCopy,
    dish: "Branzino al sale",
    soldOut: "Esaurito",
    available: "Disponibile",
    switchLabel: "Segna esaurito",
    unavailable: "Non disponibile",
    rows: [
        { name: "Carpaccio di tonno", price: "16 €" },
        { name: "Branzino al sale", price: "22 €", toggled: true },
        { name: "Tagliata di manzo", price: "23 €" }
    ] satisfies { name: string; price: string; toggled?: boolean }[],
    hint: "Tocca l’interruttore e guarda il menù del cliente."
};

export const ORDERS = {
    copy: {
        note: "cameriere!",
        title: { lead: "I tuoi camerieri passano la sera", accent: "a prendere ordini." },
        lede: "E intanto il tavolo che vuole il conto aspetta. Con il personale che non si trova, è tempo che non hai.",
        solution: "Il cliente ordina dal QR sul tavolo e la comanda arriva in cucina, stampata o su tablet, senza che nessuno debba portarla. E quando un tavolo chiama il cameriere o chiede il conto, lo vedi subito sul telefono.",
        pro: true
    } satisfies ProblemCopy,
    steps: [
        { label: "Il cliente", sub: "ordina dal QR" },
        { label: "La cucina", sub: "riceve la comanda" },
        { label: "La sala", sub: "vede le chiamate" }
    ],
    order: {
        label: "Dal suo telefono",
        table: "Tavolo 7",
        lines: [
            { qty: "1×", name: "Tagliere della casa", price: "14 €" },
            { qty: "2×", name: "Spritz della casa", price: "16 €" },
            { qty: "1×", name: "Tiramisù", price: "6 €" }
        ],
        totalLabel: "Totale",
        total: "36 €",
        send: "Invia l’ordine",
        sent: "Ordine inviato ✓",
        note: "Dal QR sul tavolo. Nessuna app, nessuna registrazione."
    },
    ticket: {
        label: "In cucina · 20:41",
        table: "TAV. 7",
        time: "20:41",
        meta: "COMANDA #128 · SALA",
        lines: [
            { qty: "1", name: "TAGLIERE DELLA CASA" },
            { qty: "2", name: "SPRITZ DELLA CASA" },
            { qty: "1", name: "TIRAMISÙ" }
        ],
        note: "Arriva da sola in cucina, stampata o su tablet."
    },
    floor: {
        label: "La sala, dal tuo telefono",
        legend: { call: "Chiama", bill: "Conto", free: "Libero" },
        alert: "Tavolo 7 chiede il conto",
        alertTime: "adesso"
    },
    printerNote: "La stampante per la cucina è opzionale e a parte: senza, le comande le vedi su tablet o telefono."
};

// ── 5 · Bacheca ─────────────────────────────────────────────────────────────

export type BoardIcon = "languages" | "schedule" | "stats" | "reservations" | "featured" | "allergens" | "stories" | "venues";

export type BoardNote = { icon: BoardIcon; title: string; problem: string; solution: string; pro?: boolean };

export const BOARD = {
    note: "ah, dimenticavo…",
    title: { lead: "E tutto il resto", accent: "che serve al tuo locale." },
    prev: "Comanda precedente",
    next: "Comanda successiva",
    hint: "Scorri col dito o usa le frecce.",
    notes: [
        { icon: "languages", title: "Il menù in più lingue", problem: "Il turista non capisce il menù.", solution: "Lo legge tradotto nella sua lingua, in automatico. I nomi dei piatti restano in italiano." },
        { icon: "schedule", title: "Programmazione", problem: "Il menù di Natale lo metti e lo togli a mano.", solution: "Menù, promo ed eventi li programmi prima: partono e finiscono da soli, locale per locale." },
        { icon: "stats", title: "Statistiche", problem: "Non sai cosa guardano i clienti.", solution: "Vedi quando aprono il menù e cosa guardano. Con il Pro, anche cosa ordinano e quanto incassi." },
        { icon: "reservations", title: "Prenotazioni online", problem: "Il telefono squilla in pieno servizio.", solution: "Arrivano online, con il promemoria il giorno prima, e i clienti restano salvati nella tua lista.", pro: true },
        { icon: "featured", title: "Evidenza e abbinamenti", problem: "Nessuno propone il vino giusto.", solution: "Spingi il piatto che rende di più e suggerisci cosa berci insieme." },
        { icon: "allergens", title: "Allergeni e ingredienti", problem: "«Cosa c’è dentro?» a ogni tavolo.", solution: "Scritti su ogni piatto, prima che il cliente lo chieda." },
        { icon: "stories", title: "Storie", problem: "Il cliente non sa cosa rende speciale quel piatto.", solution: "Racconti la storia del piatto, del produttore o del locale, dentro il menù." },
        { icon: "venues", title: "Più locali, un solo posto", problem: "Più locali da aggiornare uno per uno.", solution: "Li gestisci tutti insieme, e ognuno del team vede solo quello che gli serve." }
    ] satisfies BoardNote[]
};

// ── 6 · Import ──────────────────────────────────────────────────────────────

export const IMPORT = {
    note: "«non ho tempo»",
    title: { lead: "Il menù ce l’hai già.", accent: "Basta una foto." },
    lede: "Anche storto, anche in più pagine. Piatti, prezzi e categorie finiscono al posto giusto. Tu controlli e pubblichi: niente va online senza il tuo ok.",
    ledeMobile: "Anche storto, anche in più pagine. Tu controlli e pubblichi: niente va online senza il tuo ok.",
    paper: {
        title: "Menù",
        footer: "Coperto e pane 2,50",
        footerNote: "Chiedere al personale per gli allergeni"
    },
    /** Un piatto per categoria: sul foglio (prezzo nudo, categoria maiuscola) e nella scheda. */
    dishes: [
        { category: "Antipasti", name: "Insalata di mare", price: "16" },
        { category: "Primi", name: "Trofie al pesto", price: "12" },
        { category: "Secondi", name: "Branzino al sale", price: "22" },
        { category: "Dolci", name: "Tiramisù", price: "6" }
    ],
    cardTitle: "Dalla foto al menù",
    statusPhoto: "Foto",
    statusReading: "Lettura…",
    statusReady: "4 piatti · pronto",
    publish: "Controlla e pubblica"
};

// ── 7 · Demo ────────────────────────────────────────────────────────────────

export type DemoKey = "molo" | "pausa" | "velvet";

export type DemoVenue = {
    key: DemoKey;
    name: string;
    kind: string;
    /** Slug della pagina pubblica vera, aperta nello sheet e nel QR. */
    slug: string;
};

export const DEMOS = {
    note: "prova tu",
    title: { before: "Guarda cosa può diventare ", underlined: "il tuo locale.", after: "" } satisfies UnderlinedTitle,
    lede: "Tre locali di esempio, tre stili diversi: colori, caratteri e logo li scegli tu. Aprili: è la pagina che i clienti vedono dal QR.",
    open: "Apri il menù →",
    /** Alt dello screenshot nel telefono (`scripts/landing-demo-screenshots.ts`). */
    screenAlt: (name: string) => `Il menù di ${name} sul telefono: la copertina del locale, le categorie e i primi piatti con i prezzi.`,
    qrCaption: "Inquadra il QR e apri il menù sul tuo telefono.",
    /** Nome accessibile del QR: dice dove porta, perché il codice da solo non si legge. */
    qrLabel: (name: string, url: string) => `Codice QR che apre il menù «${name}» (${url})`,
    /** Host mostrato sotto il nome nello sheet; base degli indirizzi nel QR. */
    publicHost: "cataloglobe.com",
    publicBaseUrl: "https://cataloglobe.com/",
    sheetClose: "Chiudi",
    /** Al posto della pagina, se il menù del locale non si carica (errore o 404). */
    sheetFailed: {
        title: "Questo menù non si apre, per ora.",
        text: "Riprova tra qualche minuto."
    },
    venues: [
        {
            key: "molo",
            name: "Il Molo 34",
            kind: "Pesce · Portofino",
            slug: "il-molo-34"
        },
        {
            key: "pausa",
            name: "La Pausa",
            kind: "Caffè e pranzi · Milano",
            slug: "la-pausa"
        },
        {
            key: "velvet",
            name: "Velvet Garden",
            kind: "Cocktail bar · Milano",
            slug: "velvet-garden"
        }
    ] satisfies DemoVenue[]
};

// ── 8 · Prezzi ──────────────────────────────────────────────────────────────

export type PlanKey = "base" | "pro";

/**
 * Prezzi uguali a `plan_prices` (verificati su staging il 23/09/2026:
 * 3900/39000 Base, 5900/59000 Pro). Il prezzo barrato dell'annuale è
 * 12 × il mensile. Se cambiano i piani, cambiare qui, nel JSON-LD
 * SoftwareApplication di `index.html` e in `public/llms.txt` (⚠️ SYNC).
 */
export const PRICING = {
    note: "la domanda di tutti",
    title: { lead: "Quanto costa,", accent: "detto chiaro." },
    intervals: { month: "Mensile", year: "Annuale · 2 mesi gratis" },
    intervalsLabel: "Fatturazione",
    plansLabel: "Piano",
    period: { month: "al mese", year: "all’anno" },
    perVenue: "per locale",
    fullPriceLabel: "Prezzo pagando mese per mese",
    recommended: "Consigliato",
    trial: "30 giorni di prova gratuita. Disdici quando vuoi.",
    plans: {
        base: {
            name: "Base",
            claim: "Il menù sempre giusto",
            month: "39 €",
            year: "390 €",
            yearFull: "468 €",
            anchor: "39 € al mese: meno di due coperti a cena."
        },
        pro: {
            name: "Pro",
            claim: "Il menù che lavora anche in sala",
            month: "59 €",
            year: "590 €",
            yearFull: "708 €",
            anchor: "59 € al mese: meno di tre coperti a cena."
        }
    } satisfies Record<PlanKey, { name: string; claim: string; month: string; year: string; yearFull: string; anchor: string }>,
    /** Voci in entrambe le schede. */
    items: [
        "Prezzi, piatti ed esauriti dal telefono",
        "Menù che cambiano da soli: pranzo, cena, eventi",
        "Il menù tradotto in più lingue",
        "Evidenza, abbinamenti, allergeni e storie",
        "Statistiche su cosa guardano i clienti",
        "Il tuo menù importato da una foto",
        "Più locali e team, ognuno con i suoi permessi"
    ],
    /** Voci solo Pro: nel Base con la X grigia. */
    proItems: [
        "Ordini dal tavolo, con la comanda in cucina",
        "Chiamate al cameriere e richieste del conto",
        "Prenotazioni online con promemoria",
        "Cosa ordinano e quanto incassi, piatto per piatto"
    ],
    notIncluded: "Non incluso nel Base:",
    printer: { label: "Stampante per la cucina:", text: " opzionale, si acquista a parte." },
    footnote: "Un prezzo per ogni locale, nessun costo aggiuntivo."
};

// ── 9 · Come si parte ───────────────────────────────────────────────────────

export const START = {
    note: "una chiamata, niente di più",
    title: { lead: "Cosa ti costa provarlo:", accent: "una telefonata." },
    steps: [
        { when: "oggi", title: "Lasci un contatto", body: "Nome, locale e un numero di telefono. Nient’altro." },
        { when: "entro 24 ore", title: "Ti richiamiamo noi", body: "Rispondiamo ai tuoi dubbi e ti facciamo vedere cosa cambia nel tuo locale." },
        { when: "per 30 giorni", title: "Lo provi ", underlined: "gratis.", body: "Carichi il menù da una foto e lo pubblichi. Se ti blocchi, ti seguiamo noi." },
        { when: "poi", title: "Decidi tu", body: "Nessun vincolo, nessuna penale." }
    ] satisfies { when: string; title: string; underlined?: string; body: string }[]
};

// ── 10 · FAQ ────────────────────────────────────────────────────────────────

export type FaqGroupIcon = "rocket" | "utensils" | "tag";

/**
 * Domande della FAQ in tre gruppi, una pill per gruppo. L'ordine qui è anche
 * quello del JSON-LD `FAQPage` di / (`FAQ.items`, sotto).
 */
const FAQ_GROUPS: { id: string; label: string; icon: FaqGroupIcon; items: { q: string; a: string }[] }[] = [
    {
        id: "iniziare",
        label: "Per iniziare",
        icon: "rocket",
        items: [
            { q: "Devo riscrivere tutto il menù a mano?", a: "No. Fai una foto al menù o carichi il PDF che hai: piatti, prezzi e categorie vengono letti in automatico. Tu controlli e pubblichi." },
            { q: "Serve installare un’app?", a: "No, né a te né ai clienti. Il menù si apre dal QR, nel browser del telefono." },
            { q: "Che fine fanno i QR che ho già stampato?", a: "Il QR di CataloGlobe non cambia mai: aggiorni il menù, il QR resta quello. Se oggi ne usi uno di un altro servizio, lo sostituisci una volta sola." },
            { q: "Posso gestire più locali?", a: "Sì, tutti dallo stesso account, con un prezzo per ogni locale." }
        ]
    },
    {
        id: "menu",
        label: "Il menù",
        icon: "utensils",
        items: [
            { q: "Il menù cambia da solo tra pranzo, aperitivo e cena?", a: "Sì: programmi i menù per fascia oraria e il QR mostra sempre quello giusto." },
            { q: "In quali lingue si vede il menù?", a: "In italiano, inglese, francese, tedesco e spagnolo, le lingue che servono di più con i turisti, e altre lingue sono in arrivo. Le descrizioni si traducono da sole quando salvi un piatto, e puoi sempre correggerle a mano. I nomi dei piatti restano in italiano." },
            { q: "Posso indicare gli allergeni?", a: "Sì: per ogni piatto scegli tra i 14 allergeni previsti dalla normativa europea." },
            { q: "I clienti devono registrarsi per ordinare dal tavolo?", a: "No. Inquadrano il QR del tavolo e ordinano dal telefono, senza app e senza creare un account." }
        ]
    },
    {
        id: "prezzi",
        label: "Prezzi e prova",
        icon: "tag",
        items: [
            { q: "Quanto costa CataloGlobe?", a: `Base ${PRICING.plans.base.month} al mese o ${PRICING.plans.base.year} all’anno, Pro ${PRICING.plans.pro.month} al mese o ${PRICING.plans.pro.year} all’anno, per locale: prezzo finale, nessun costo aggiuntivo. I primi 30 giorni sono gratis.` },
            { q: "Serve la carta di credito per la prova gratuita?", a: "Sì, per attivare la prova. Per trenta giorni non paghi niente, e se disdici prima non ti viene addebitato nulla." },
            { q: "Posso passare dal Base al Pro più avanti?", a: "Sì, cambi piano quando vuoi, senza rifare niente: il menù e le impostazioni restano quelli." },
            { q: "Posso disdire quando voglio?", a: "Disdici quando vuoi, senza penali." }
        ]
    }
];

export const FAQ = {
    note: "chiedi pure",
    title: { lead: "Domande,", accent: "in breve." },
    lede: "Le cose che ci chiedono tutti, prima di provare.",
    groups: FAQ_GROUPS,
    /** Pill dei gruppi: nome accessibile della fila. */
    groupsLabel: "Argomenti delle domande",
    /**
     * Tutte le domande, gruppo dopo gruppo: domande visibili e JSON-LD
     * `FAQPage` di / (`faqPageLdScript` in `prerender.ts`), un solo elenco, il
     * testo è lo stesso. I prezzi di «Quanto costa CataloGlobe?» vengono da
     * `PRICING`.
     */
    items: FAQ_GROUPS.flatMap((g) => g.items),
    more: "Hai un’altra domanda? Scrivici, rispondiamo noi.",
    copy: "Copia l’indirizzo email",
    copied: "Copiato"
};

// ── 11 · Contatto ───────────────────────────────────────────────────────────

export const CONTACT = {
    note: "chiamaci tu, o ti chiamiamo noi",
    title: { before: "Il tuo menù giusto, ", underlined: "ogni sera.", after: " Partiamo?" } satisfies UnderlinedTitle,
    lede: "Lasciaci un contatto: ti chiamiamo entro 24 ore, rispondiamo ai tuoi dubbi e ti facciamo vedere come funziona per il tuo locale.",
    /** Variante form: sotto la lede (desktop) o sotto il form (mobile). */
    writeInstead: "Se preferisci scrivere:",
    /** Variante signup: sotto la CTA. */
    talkInstead: "Preferisci parlarne? Scrivici:",
    fields: {
        name: "Nome",
        venue: "Nome del locale",
        phone: "Telefono",
        email: "Email",
        optional: "· facoltativa"
    },
    interestsLabel: "Cosa ti interessa di più?",
    /** `id`: valore salvato in `leads.interests` (vedi utils/leadValidation.ts). */
    interests: [
        { id: "menu", label: "Il menù" },
        { id: "prenotazioni", label: "Le prenotazioni" },
        { id: "ordini", label: "Gli ordini al tavolo" }
    ] satisfies { id: LeadInterest; label: string }[],
    privacy: {
        before: "Ho letto l’",
        link: "informativa privacy",
        href: "/legal/privacy",
        after: " e acconsento a essere ricontattato."
    },
    /** Etichetta del pulsante durante l'invio. */
    sending: "Invio…",
    /** Al posto del form, dopo l'invio riuscito (`successCopy.ts` sceglie la frase). */
    success: {
        title: "Richiesta ricevuta.",
        titleNamed: (name: string) => `Grazie ${name}, richiesta ricevuta.`,
        /** In mezzo il telefono, su una riga sola. */
        text: { before: "Ti chiamiamo entro 24 ore al ", after: "." },
        textNoPhone: "Ti chiamiamo entro 24 ore al numero che ci hai lasciato."
    },
    /** Sotto il pulsante se l'invio fallisce; in mezzo l'indirizzo email. */
    failure: {
        before: "Non siamo riusciti a inviare la richiesta. Riprova, oppure scrivici a ",
        after: "."
    },
    /** Errori per campo, sotto il campo. */
    errors: {
        name: { required: "Scrivi il tuo nome.", too_long: "Il nome è troppo lungo.", invalid: "Controlla il nome." },
        venueName: { required: "Scrivi il nome del locale.", too_long: "Il nome del locale è troppo lungo.", invalid: "Controlla il nome del locale." },
        phone: { required: "Scrivi un numero di telefono.", too_long: "Controlla il numero di telefono.", invalid: "Controlla il numero di telefono." },
        email: { required: "Scrivi l’email.", too_long: "L’email è troppo lunga.", invalid: "Controlla l’email." },
        consent: { required: "Serve il consenso per poterti richiamare.", too_long: "", invalid: "" },
        interests: { required: "", too_long: "", invalid: "Scegli fra le voci proposte." }
    } satisfies Record<LeadField, Record<LeadFieldError, string>>
};

// ── 12 · Footer ─────────────────────────────────────────────────────────────

export const FOOTER = {
    tagline: "Il menù che si aggiorna da solo.",
    columns: {
        product: {
            title: "Prodotto",
            links: [
                { label: "Esempi", href: "#esempi" },
                { label: "Prezzi", href: "#prezzi" },
                { label: "Come si parte", href: "#come-si-parte" },
                { label: "Domande", href: "#faq" }
            ]
        },
        legal: {
            title: "Legale",
            links: [
                { label: "Privacy", href: "/legal/privacy" },
                { label: "Termini di servizio", href: "/legal/termini" }
            ]
        },
        contacts: { title: "Contatti", write: "Scrivici", phone: "Telefono" }
    },
    vatLabel: "P.IVA",
    cookiePreferences: "Preferenze cookie"
};
