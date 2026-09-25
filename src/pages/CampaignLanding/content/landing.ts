/**
 * Testi della landing di campagna (Versione C), nell'ordine della pagina.
 *
 * È il file da rivedere per le copy: i componenti non contengono stringhe
 * italiane. Le CTA («Parliamone» / «Provalo gratis») stanno in `cta.ts`,
 * perché cambiano con la variante.
 *
 * Fonte: le tavole in `docs/landing/versione-c/riferimento/`. Dove la tavola
 * mobile accorcia un testo, il campo ha la variante `…Mobile`.
 */

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

export type HeroBeatIcon = "clock" | "tag" | "ban";

export const HERO = {
    eyebrow: "Menù digitale per ristoranti",
    title: { before: "Il menù che si aggiorna da solo. Tu pensi ", underlined: "alla sala.", after: "" } satisfies UnderlinedTitle,
    lede: "Cambi un prezzo o segni un piatto finito dal telefono: il menù che i clienti aprono dal QR è subito giusto.",
    /** Le tre fasce della scheda animata; i prezzi sono numeri (il momento 2 ne alza uno). */
    fasce: [
        {
            title: "Menù Pranzo",
            hours: "12–15",
            dishes: [
                { name: "Trofie al pesto", price: 12 },
                { name: "Insalata di mare", price: 16 },
                { name: "Focaccia al formaggio", price: 9 },
                { name: "Acqua naturale", price: 3 }
            ]
        },
        {
            title: "Menù Aperitivo",
            hours: "18–20",
            dishes: [
                { name: "Spritz della casa", price: 8 },
                { name: "Tagliere della casa", price: 14 },
                { name: "Olive e taralli", price: 5 },
                { name: "Bruschette miste", price: 7 }
            ]
        },
        {
            title: "Menù Cena",
            hours: "20–23",
            dishes: [
                { name: "Branzino al sale", price: 22 },
                { name: "Risotto ai frutti di mare", price: 20 },
                { name: "Tagliata di manzo", price: 23 },
                { name: "Tiramisù", price: 6 }
            ]
        }
    ],
    /** Barra in cima alla scheda, una per momento (vedi `heroCycle.ts`). */
    beats: [
        { title: "Sono le 12:00", sub: "parte il menù pranzo", icon: "clock" },
        { title: "Prezzo aggiornato", sub: "Insalata di mare, 17 €", icon: "tag" },
        { title: "Sono le 18:00", sub: "parte l’aperitivo", icon: "clock" },
        { title: "Esaurito", sub: "Bruschette miste", icon: "ban" },
        { title: "Sono le 20:00", sub: "parte il menù cena", icon: "clock" }
    ] satisfies { title: string; sub: string; icon: HeroBeatIcon }[],
    unavailable: "Non disponibile"
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
export const PRO_BADGE = "Piano Pro";

export const SUPPLIER = {
    copy: {
        note: "i costi salgono…",
        title: { lead: "Il fornitore aumenta.", accent: "E tu rimandi la ristampa." },
        lede: "Alzare un prezzo sulla carta vuol dire ristampare tutto il menù, e così si rimanda. Intanto la differenza la paghi tu, piatto dopo piatto.",
        solution: "Lo cambi dal telefono: il menù che si apre dal QR è subito giusto, e il PDF da stampare si aggiorna da solo."
    } satisfies ProblemCopy,
    card: {
        title: "Secondi",
        dishes: [
            { name: "Branzino al sale", price: "22 €" },
            { name: "Tagliata di manzo", price: "23 €", oldPrice: "22 €" },
            { name: "Filetto al pepe verde", price: "26 €" }
        ] satisfies { name: string; price: string; oldPrice?: string }[]
    },
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
    phoneLabel: "Dal tuo telefono",
    dish: "Branzino al sale",
    soldOut: "Esaurito",
    available: "Disponibile",
    switchLabel: "Segna esaurito",
    customerLabel: "Il menù del cliente, dal QR",
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
        note: "Arriva da sola in cucina. Nessuno deve passare a portarla."
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
    /** Sottotitolo nella copertina del menù. */
    tagline: string;
    /** Slug della pagina pubblica vera, aperta nello sheet e nel QR. */
    slug: string;
    categories: string[];
    dishes: { name: string; price: string }[];
};

export const DEMOS = {
    note: "prova tu",
    title: { before: "Guarda cosa può diventare ", underlined: "il tuo locale.", after: "" } satisfies UnderlinedTitle,
    lede: "Tre locali di esempio, tre stili diversi: colori, caratteri e logo li scegli tu. Aprili: è la pagina che i clienti vedono dal QR.",
    open: "Apri il menù →",
    qrCaption: "Inquadra il QR e apri il menù sul tuo telefono.",
    /** Host mostrato sotto il nome nello sheet; base degli indirizzi nel QR. */
    publicHost: "cataloglobe.com",
    publicBaseUrl: "https://cataloglobe.com/",
    sheetClose: "Chiudi",
    sheetFallback: "Non si carica?",
    sheetFallbackLink: "Aprilo in una nuova scheda",
    venues: [
        {
            key: "molo",
            name: "Il Molo 34",
            kind: "Pesce · Portofino",
            tagline: "Pesce, carta della sera",
            slug: "il-molo-34",
            categories: ["Crudi", "Primi", "Secondi"],
            dishes: [
                { name: "Carpaccio di branzino", price: "16 €" },
                { name: "Tartare di tonno", price: "18 €" },
                { name: "Risotto ai frutti di mare", price: "20 €" },
                { name: "Tagliata di tonno", price: "24 €" },
                { name: "Branzino al sale", price: "22 €" }
            ]
        },
        {
            key: "pausa",
            name: "La Pausa",
            kind: "Caffè e pranzi · Milano",
            tagline: "Colazioni e pranzi veloci",
            slug: "la-pausa",
            categories: ["Colazione", "Pranzo", "Bevande"],
            dishes: [
                { name: "Cornetto integrale", price: "1,80 €" },
                { name: "Toast farcito", price: "5 €" },
                { name: "Insalatona della casa", price: "9 €" },
                { name: "Bowl del giorno", price: "10 €" },
                { name: "Centrifuga del giorno", price: "4,50 €" }
            ]
        },
        {
            key: "velvet",
            name: "Velvet Garden",
            kind: "Cocktail bar · Milano",
            tagline: "Cocktail e piccoli piatti",
            slug: "velvet-garden",
            categories: ["Signature", "Classici", "Da mangiare"],
            dishes: [
                { name: "Garden Spritz", price: "9 €" },
                { name: "Negroni sbagliato", price: "10 €" },
                { name: "Basil Smash", price: "10 €" },
                { name: "Tagliere misto", price: "14 €" },
                { name: "Olive e taralli", price: "5 €" }
            ]
        }
    ] satisfies DemoVenue[]
};

// ── 8 · Prezzi ──────────────────────────────────────────────────────────────

export type PlanKey = "base" | "pro";

/**
 * Prezzi uguali a `plan_prices` (verificati su staging il 23/09/2026:
 * 3900/39000 Base, 5900/59000 Pro). Il prezzo barrato dell'annuale è
 * 12 × il mensile. Se cambiano i piani, cambiare qui.
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
    footnote: "Un prezzo per ogni locale, nessun costo aggiuntivo. Dal secondo locale, −10% su ognuno."
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

export const FAQ = {
    note: "chiedi pure",
    title: { lead: "Domande,", accent: "in breve." },
    lede: "Le cose che ci chiedono tutti, prima di provare.",
    items: [
        { q: "Devo ribattere tutto il menù?", a: "No. Fai una foto al menù o carichi il PDF che hai: piatti, prezzi e categorie vengono letti in automatico. Tu controlli e pubblichi." },
        { q: "Serve installare qualcosa?", a: "No, né a te né ai clienti. Il menù si apre dal QR, nel browser del telefono." },
        { q: "E i QR che ho già stampato?", a: "Il QR di CataloGlobe non cambia mai: aggiorni il menù, il QR resta quello. Se oggi ne usi uno di un altro servizio, lo sostituisci una volta sola." },
        { q: "Serve la carta di credito per provarlo?", a: "Sì, per attivare la prova. Per trenta giorni non paghi niente, e se disdici prima non ti viene addebitato nulla." },
        { q: "I clienti devono registrarsi per ordinare dal tavolo?", a: "No. Inquadrano il QR del tavolo e ordinano dal telefono, senza app e senza creare un account." },
        { q: "Posso passare dal Base al Pro più avanti?", a: "Sì, cambi piano quando vuoi, senza rifare niente: il menù e le impostazioni restano quelli." },
        { q: "E se poi non mi serve?", a: "Disdici quando vuoi, senza penali." }
    ],
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
    interests: ["Il menù", "Le prenotazioni", "Gli ordini al tavolo"],
    privacy: {
        before: "Ho letto l’",
        link: "informativa privacy",
        href: "/legal/privacy",
        after: " e acconsento a essere ricontattato."
    }
};

// ── 12 · Footer ─────────────────────────────────────────────────────────────

export const FOOTER = {
    tagline: "Il menù che si aggiorna da solo.",
    columns: {
        product: {
            title: "Prodotto",
            links: [
                { label: "Come funziona", href: "#come" },
                { label: "Prezzi", href: "#prezzi" },
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
    vatLabel: "P.IVA"
};
