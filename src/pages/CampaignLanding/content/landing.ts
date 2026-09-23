/**
 * Testi della landing di campagna, nell'ordine della pagina.
 *
 * È il file da rivedere per le copy: i componenti non contengono stringhe
 * italiane. Le CTA («Parliamone» / «Provalo gratis») stanno in `cta.ts`,
 * perché cambiano con la variante.
 *
 * Titoli con parola evidenziata: `before` + `highlight` + `after`.
 */

export type HighlightedTitle = { before: string; highlight: string; after: string };

// ── 1 · Hero ────────────────────────────────────────────────────────────────

export type HeroDish = { name: string; price: string };

export type HeroFascia = {
    /** Etichetta sul selettore */
    label: string;
    hours: string;
    /** Titolo della carta quando la fascia è attiva */
    menuTitle: string;
    dishes: HeroDish[];
};

export const HERO = {
    /** Testo alternativo del logo. */
    brand: "CataloGlobe",
    login: { label: "Accedi", href: "/login" },
    eyebrow: "Menù digitale per ristoranti",
    title: {
        before: "Il tuo menù può ",
        highlight: "vendere per te",
        after: "."
    } satisfies HighlightedTitle,
    lede: "Metti in evidenza il piatto che rende di più, all’ora in cui conviene. Senza ristampare niente.",

    /** La carta menù accanto al titolo (a riposo: «Pranzo»). */
    menu: {
        url: "cataloglobe.com/il-molo-34",
        liveBadge: "In corso ora",
        fasceLabel: "Fascia oraria",
        caption: "Pranzo, aperitivo, cena. Il menù cambia da solo, all’ora che decidi tu.",
        fasce: [
            {
                label: "Pranzo",
                hours: "12:00–15:00",
                menuTitle: "Menù Pranzo",
                dishes: [
                    { name: "Trofie al pesto", price: "€12" },
                    { name: "Insalata di mare", price: "€16" },
                    { name: "Focaccia al formaggio", price: "€9" },
                    { name: "Acqua e caffè", price: "€3" }
                ]
            },
            {
                label: "Aperitivo",
                hours: "18:00–20:00",
                menuTitle: "Menù Aperitivo",
                dishes: [
                    { name: "Spritz della casa", price: "€8" },
                    { name: "Tagliere del Molo", price: "€14" },
                    { name: "Olive e taralli", price: "€5" },
                    { name: "Bruschette miste", price: "€7" }
                ]
            },
            {
                label: "Cena",
                hours: "20:00–23:00",
                menuTitle: "Menù Cena",
                dishes: [
                    { name: "Branzino al sale", price: "€22" },
                    { name: "Risotto ai frutti di mare", price: "€20" },
                    { name: "Tagliata di manzo", price: "€24" },
                    { name: "Tiramisù della casa", price: "€6" }
                ]
            }
        ] satisfies HeroFascia[]
    }
};

// ── 2 · Carta o PDF ─────────────────────────────────────────────────────────

export const COMPARE = {
    title: "Carta o PDF, il problema è lo stesso: non cambia mai.",
    lede: "Un menù è vivo: il pesce finisce, la promo parte il venerdì, a pranzo lavori un altro menù. Cambiare un prezzo, prima e adesso.",
    before: {
        label: "Oggi, su carta o su PDF",
        items: [
            "Ogni cambio è una ristampa, o un file da rifare",
            "Intanto il prezzo sbagliato resta lì",
            "Il menù vecchio continua a girare in sala",
            "Sul telefono si pinza e si allarga per leggerlo"
        ]
    },
    after: {
        label: "Con CataloGlobe",
        items: [
            "Cambi il prezzo dal telefono",
            "È online in un secondo",
            "Non paghi niente in più",
            "Il QR sul tavolo resta lo stesso"
        ]
    }
};

// ── 3 · Import da foto ──────────────────────────────────────────────────────

export type ImportRow = { name: string; category: string; price: string };

export const IMPORT = {
    title: "Il menù ce l’hai già. Basta una foto.",
    lede: "Lo carichi com’è, anche storto, anche in più pagine. Piatti, prezzi e categorie finiscono al posto giusto. Tu controlli e pubblichi: niente va online prima del tuo ok.",
    card: {
        title: "Importa menù con AI",
        steps: ["Caricamento", "Analisi", "Revisione"],
        /** Passo 3 «Revisione», a riposo: tutte le righe lette. */
        rows: [
            { name: "Insalata di mare", category: "Antipasti", price: "16 €" },
            { name: "Trofie al pesto", category: "Primi", price: "12 €" },
            { name: "Branzino al sale", category: "Secondi", price: "22 €" },
            { name: "Tiramisù", category: "Dolci", price: "6 €" },
            { name: "Acqua naturale 0,75L", category: "Bevande", price: "3 €" }
        ] satisfies ImportRow[],
        footer: "38 piatti riconosciuti · controlla e pubblica",
        /** Passi 1–2 (visibili solo con l'animazione, Passata 2). */
        paper: {
            title: "MENÙ",
            lines: [
                "Insalata di mare · 16",
                "Trofie al pesto · 12",
                "Branzino al sale · 22",
                "Tiramisù · 6",
                "Acqua naturale · 3"
            ],
            fileName: "menu-cartaceo.jpg · 1,4 MB",
            reading: "Leggo piatti, prezzi e categorie…"
        }
    }
};

// ── 4 · Analitiche: il martedì vuoto ────────────────────────────────────────

export type BarTone = "normal" | "empty" | "highlight";
export type ChartBar = { day: string; value: number; tone: BarTone };

const DAYS = ["L", "M", "M", "G", "V", "S", "D"];

/** Valori in percentuale dell’altezza utile della barra (colonna meno etichetta). Dati di esempio. */
const chart = (values: number[], tones: Partial<Record<number, BarTone>>): ChartBar[] =>
    values.map((value, i) => ({ day: DAYS[i], value, tone: tones[i] ?? "normal" }));

export const ANALYTICS = {
    title: {
        before: "Scopri in che giorni il locale è vuoto. ",
        highlight: "E riempili dal menù",
        after: "."
    } satisfies HighlightedTitle,
    lede: "Il martedì va piano? Metti in evidenza tutta la settimana qualcosa che c’è solo il martedì: chi apre il menù il sabato lo scopre, e ha un motivo per tornare.",
    more: {
        before: "Lo stesso vale per i piatti e per le ore: sai cosa guardano, quando aprono il menù e — con il Pro — ",
        strong: "cosa ordinano e quanto incassi",
        after: "."
    },
    discover: {
        label: "Scopri",
        chartLabel: "Aperture del menù per giorno: il martedì è il più basso",
        bars: chart([56, 21, 57, 62, 79, 93, 71], { 1: "empty" }),
        caption: "Il martedì è il giorno più vuoto della settimana."
    },
    act: {
        label: "Agisci",
        badge: "In evidenza · tutta la settimana",
        title: "Solo il martedì: il risotto dello chef",
        body: "Chi apre il menù il sabato lo scopre, e ha un motivo per tornare."
    },
    verify: {
        label: "Verifica",
        chartLabel: "Aperture del menù per giorno, dopo: il martedì è risalito",
        bars: chart([56, 75, 57, 62, 79, 93, 71], { 1: "highlight" }),
        caption: "Nelle settimane dopo, i numeri ti dicono se ha funzionato."
    },
    sampleNote: "Dati di esempio."
};

// ── 5 · Le nove schede ──────────────────────────────────────────────────────

export type FeatureKey =
    | "orders"
    | "reservations"
    | "reviews"
    | "venues"
    | "team"
    | "hours"
    | "languages"
    | "styles"
    | "stories";

export const FEATURES = {
    title: "E dentro c’è tutto il resto.",
    lede: "Tocca una voce: te la faccio vedere.",
    groups: [
        {
            label: "Il tuo locale",
            items: ["orders", "reservations", "reviews", "venues", "team"] as FeatureKey[]
        },
        { label: "Il tuo menù", items: ["hours", "languages", "styles", "stories"] as FeatureKey[] }
    ],
    /** Etichette sui bottoni, nell'ordine della pagina. */
    labels: {
        orders: "Ordini al tavolo",
        reservations: "Prenotazioni",
        reviews: "Recensioni",
        venues: "Locali e menù",
        team: "Team",
        hours: "Orari e disponibilità",
        languages: "Lingue",
        styles: "Stili",
        stories: "Storie"
    } satisfies Record<FeatureKey, string>,
    customerLabel: "Lo vede il cliente",
    youLabel: "Lo vedi tu",

    orders: {
        scene: "Il tavolo 7 ha fame, e tu sei in cucina.",
        table: "Tavolo 7",
        lines: [
            { name: "Tagliere del Molo", qty: "× 1" },
            { name: "Spritz della casa", qty: "× 2" },
            { name: "Tiramisù", qty: "× 1" }
        ],
        totalLabel: "Totale",
        total: "27 €",
        /** Riposo: ordine già inviato, comanda già stampata. */
        sentLabel: "Inviato",
        youLabel: "Lo vedi tu · stampa in cucina",
        printerLabel: "CUCINA",
        ticket: {
            venue: "IL MOLO 34",
            table: "TAVOLO 7",
            time: "20:41",
            lines: [
                { qty: "1", name: "TAGLIERE DEL MOLO" },
                { qty: "2", name: "SPRITZ DELLA CASA" },
                { qty: "1", name: "TIRAMISU" }
            ],
            number: "COMANDA #128"
        },
        caption: "Il cliente ordina dal QR sul tavolo. La comanda esce stampata in cucina: nessuno deve passare a prenderla."
    },

    reservations: {
        scene: "Vogliono un tavolo per giovedì, e tu sei in sala.",
        formTitle: "Prenota un tavolo",
        partyLabel: "In quanti",
        partySizes: ["2", "4", "6"],
        partySelected: "4",
        date: "Ven 12 set",
        time: "20:30",
        guest: "Marco Rossi",
        sentLabel: "Inviata",
        agendaTitle: "Agenda di venerdì",
        agenda: [
            { time: "19:45", name: "Bianchi", covers: "2 coperti", status: "Confermata", isNew: false },
            { time: "20:15", name: "Ferri", covers: "6 coperti", status: "Confermata", isNew: false },
            { time: "20:30", name: "Rossi", covers: "4 coperti", status: "Nuova", isNew: true }
        ],
        guestsTitle: "I tuoi clienti",
        guests: [
            { name: "Marco Rossi", visits: "1ª volta", isNew: true },
            { name: "Chiara Bianchi", visits: "5ª volta", isNew: false },
            { name: "Luca Ferri", visits: "2ª volta", isNew: false }
        ],
        caption: {
            before: "Prenota online e finisce nella tua agenda. E i clienti che prenotano ",
            strong: "restano tuoi",
            after: ": nome, telefono e quante volte sono venuti stanno nel tuo pannello, non su un portale."
        }
    },

    reviews: {
        scene: "Hanno pagato il conto e stanno per uscire.",
        question: "Com’è andata stasera?",
        starsLabel: "5 stelle su 5",
        draft: "Il branzino al sale era perfetto…",
        send: "Invia",
        when: "ieri, 22:14",
        quote: "« Il branzino al sale era perfetto e il servizio velocissimo. Torneremo. »",
        author: "Giulia · dal menù al tavolo",
        hint: "Contenta: chiedile di lasciarla anche su Google.",
        caption: "Il giudizio lo leggi tu per primo, mentre il cliente è ancora seduto. Poi decidi tu se invitarlo a scriverla su Google."
    },

    venues: {
        scene: "Hai tre locali, e in uno ci sono tre menù.",
        rows: [
            { venue: "Duomo", menu: "Carta", hours: "12–22" },
            { venue: "Navigli", menu: "Aperitivo", hours: "18–23" },
            { venue: "Stazione", menu: "Veloce", hours: "7–21" }
        ],
        insideLabel: "Dentro il Duomo, adesso",
        inside: ["Carta", "Menù bar", "Lista vini"],
        caption: "Ogni locale con il suo menù e il suo stile. E dentro un locale solo puoi tenere la carta, il menù del bar e la lista dei vini, ognuno con le sue ore."
    },

    team: {
        scene: "Arriva una persona nuova in sala.",
        title: "Chi può fare cosa",
        people: [
            { name: "Giulia", role: "Sala", where: "Navigli", can: "Comande e tavoli. Non vede i prezzi né le altre sedi." },
            { name: "Marco", role: "Cucina", where: "Duomo", can: "Comande e disponibilità dei piatti." },
            { name: "Alessandro", role: "Titolare", where: "tutto", can: "Tutto, comprese fatture e team." }
        ],
        caption: "Dai accesso al personale locale per locale, senza dare le chiavi di tutto."
    },

    hours: {
        scene: "Alle 13:30 finisce il branzino.",
        ruleTitle: "La regola",
        live: "In corso ora",
        rule: [
            { key: "Cosa", value: "Menù Aperitivo", strong: true },
            { key: "Dove", value: "Il Molo 34 · Navigli", strong: false },
            { key: "Quando", value: "18:00–20:00, tutti i giorni", strong: false }
        ],
        phoneTitle: "Dal telefono, mentre sei in sala",
        soldOutDish: "Branzino al sale",
        soldOut: "Esaurito",
        soldOutNote: "Sparito dal menù di tutti i tavoli, in questo istante.",
        caption: "Decidi una volta cosa si vede e quando: per locale, per giorno, per fascia. E quando un piatto finisce lo segni dal telefono, senza chiamare nessuno."
    },

    languages: {
        scene: "Si siede un tavolo di turisti tedeschi.",
        dish: "Trofie al pesto",
        price: "€12",
        translations: [
            { lang: "IT", text: "Pasta fresca con pesto di basilico e pinoli" },
            { lang: "EN", text: "Fresh pasta with basil and pine nut pesto" },
            { lang: "DE", text: "Frische Pasta mit Basilikum-Pinienkern-Pesto" }
        ],
        available: "Italiano, inglese, francese, tedesco, spagnolo.",
        caption: "Il cliente apre il menù nella sua lingua. Il nome del piatto resta in italiano: è quello che è venuto a cercare."
    },

    styles: {
        scene: "Di sera il locale diventa un’altra cosa.",
        variants: [
            { label: "Carta", tone: "paper" as const },
            { label: "Sera", tone: "night" as const }
        ],
        venue: "Il Molo 34",
        dishes: [
            { name: "Branzino al sale", price: "€22" },
            { name: "Tagliata di manzo", price: "€24" },
            { name: "Tiramisù", price: "€6" }
        ],
        slot: "Cena · 20:00–23:00",
        caption: "Colori, caratteri e forme li scegli tu, e li cambi quando vuoi. Piatti e prezzi non si toccano: cambia solo la veste."
    },

    stories: {
        scene: "Ti chiedono da dove arriva quel pesto.",
        dish: "Trofie al pesto",
        dishDesc: "Pasta fresca con pesto di basilico",
        behindLabel: "Dietro le quinte",
        behindTitle: "Il basilico di Prà, e perché lo prendiamo lì",
        read: "leggi ›",
        storyLabel: "Nel menù, sopra le portate",
        storyTitle: "La nostra storia",
        storyBody: "Dal 1978 sul porto, tre generazioni. Foto, testi e video.",
        caption: "La storia del locale e quella dei piatti, agganciate al prodotto che il cliente sta guardando proprio adesso."
    }
};

// ── 6 · I tre locali demo ───────────────────────────────────────────────────

/** Chiave dello stile: sceglie i token --ld-demo-<key>-* via data-demo. */
export type DemoKey = "molo" | "pausa" | "velvet";

export type DemoVenue = {
    key: DemoKey;
    name: string;
    address: string;
    kind: string;
    /** Slug della pagina vera (QR e, in Passata 2, lo sheet). */
    slug: string;
    initial: string;
    /** Font del nome sul telefono: serif (Young Serif) o sans. */
    serif: boolean;
    categories: string[];
    featured: { name: string; price: string };
    dishes: { name: string; price: string }[];
};

export const DEMOS = {
    title: "Guarda cosa può diventare il tuo locale.",
    lede: "Tre locali di esempio, tre stili diversi. Scegline uno: qui vedi la sua pagina, quella vera.",
    honesty: "Li abbiamo costruiti noi: servono a farti vedere lo strumento, non a farti credere che siano clienti.",
    open: "Apri il menù →",
    featuredLabel: "In evidenza adesso",
    qrCaption: "Inquadralo col telefono: è lo stesso QR che metti sul tavolo.",
    /** Base degli indirizzi pubblici codificati nel QR. */
    publicBaseUrl: "https://cataloglobe.com/",
    venues: [
        {
            key: "molo",
            name: "Il Molo 34",
            address: "Via del Porto 34, Portofino (GE)",
            kind: "Pesce, carta della sera",
            slug: "il-molo-34",
            initial: "M",
            serif: true,
            categories: ["Crudi", "Primi", "Secondi"],
            featured: { name: "Degustazione di pesce", price: "38 €" },
            dishes: [
                { name: "Carpaccio di branzino", price: "16 €" },
                { name: "Risotto ai frutti di mare", price: "20 €" },
                { name: "Tagliata di tonno", price: "24 €" }
            ]
        },
        {
            key: "pausa",
            name: "La Pausa",
            address: "Corso Italia 12, Milano (MI)",
            kind: "Bar, tutto il giorno",
            slug: "la-pausa",
            initial: "P",
            serif: false,
            categories: ["Colazione", "Pranzo", "Aperitivo"],
            featured: { name: "Tagliere e calice", price: "14 €" },
            dishes: [
                { name: "Focaccia al formaggio", price: "9 €" },
                { name: "Insalatona del giorno", price: "11 €" },
                { name: "Spritz della casa", price: "8 €" }
            ]
        },
        {
            key: "velvet",
            name: "Velvet Garden",
            address: "Via Savona 18, Milano (MI)",
            kind: "Cucina vegetale",
            slug: "velvet-garden",
            initial: "V",
            serif: true,
            categories: ["Orto", "Fermentati", "Dolci"],
            featured: { name: "Menù dell’orto", price: "32 €" },
            dishes: [
                { name: "Barbabietola e nocciole", price: "14 €" },
                { name: "Risotto alle erbe", price: "18 €" },
                { name: "Tortino al cacao", price: "7 €" }
            ]
        }
    ] satisfies DemoVenue[]
};

// ── 7 · Prezzi ──────────────────────────────────────────────────────────────

export type PlanKey = "base" | "pro";

/**
 * Prezzi in centesimi, uguali a `plan_prices` (verificati su staging il
 * 23/09/2026: 3900/39000 Base, 5900/59000 Pro). L'annuale è 10 × il mensile:
 * è quello che rende vero «Due mesi gratis». Se cambiano i piani, cambiare qui.
 */
export const PRICING = {
    title: "Un prezzo per locale. Scritto.",
    lede: "Le voci sono le stesse: nel Base tre sono spente e si accendono con il Pro.",
    intervals: { month: "Mensile", year: "Annuale · 2 mesi gratis" },
    intervalsLabel: "Fatturazione",
    plansLabel: "Piano",
    yearlyNote: "Due mesi gratis: paghi dieci, usi dodici.",
    period: { month: "al mese, per locale", year: "all’anno, per locale" },
    vat: "IVA inclusa",
    fullPriceLabel: "Prezzo pagando mese per mese",
    recommended: "Consigliato",
    trial: "Trenta giorni di prova, si annulla quando vuoi.",
    includes: "Include",
    plans: {
        base: { name: "Base", claim: "Il menù che lavora per te", monthCents: 3900, yearCents: 39000 },
        pro: { name: "Pro", claim: "I clienti ordinano e prenotano da soli", monthCents: 5900, yearCents: 59000 }
    } satisfies Record<PlanKey, { name: string; claim: string; monthCents: number; yearCents: number }>,
    /** `proOnly`: spenta nel Base. */
    items: [
        { title: "Menù digitale con QR", desc: "Sempre aggiornato, nel tuo stile.", proOnly: false },
        { title: "Menù e promo programmati", desc: "Cambiano da soli, all’orario che scegli.", proOnly: false },
        { title: "Import del menù da foto o PDF", desc: "Carichi quello che usi già: controlli e pubblichi.", proOnly: false },
        { title: "Traduzione automatica in 5 lingue", desc: "Descrizioni tradotte, nomi dei piatti in italiano.", proOnly: false },
        { title: "Recensioni dal menù", desc: "Ogni giudizio arriva prima a te, e chi è contento lo lascia anche su Google.", proOnly: false },
        { title: "Più locali, stili, storie e team", desc: "Ogni locale con la sua veste, e accessi diversi per il personale.", proOnly: false },
        { title: "Analitiche su visite e piatti", desc: "Sai quando arrivano i clienti e cosa guardano nel menù.", proOnly: false },
        { title: "Ordini al tavolo con QR", desc: "Le comande arrivano subito sul tuo pannello.", proOnly: true },
        { title: "Prenotazioni in un’unica agenda", desc: "Quelle dei clienti e quelle che inserisci tu, nello stesso posto.", proOnly: true },
        { title: "Analitiche su ordini e incassi", desc: "Sai cosa ordinano e quanto incassi, piatto per piatto.", proOnly: true }
    ],
    proExtra: "+ Stampa automatica delle comande in cucina con stampante dedicata (opzionale, a parte).",
    footnote: "Prezzi per locale, IVA inclusa. Dal secondo locale, −10% su ognuno. Nessun vincolo: disdici quando vuoi."
};

// ── 8 · Il rischio: una telefonata ──────────────────────────────────────────

export const RISK = {
    title: "Cosa ti costa provarlo: una telefonata.",
    steps: [
        { title: "Ti richiamiamo noi", body: "Entro 24 ore. Ci servono solo il tuo nome, quello del locale e un recapito: niente carta, niente modulo lungo." },
        { title: "Il menù lo mettiamo online insieme", body: "Il tempo di una chiamata, non di un corso. Se hai sottomano una foto del cartaceo, quando riattacchi è già pubblicato, col tuo QR." },
        { title: "Un mese nel tuo locale vero", body: "Con i tuoi piatti, i tuoi orari, i tuoi clienti. Non una demo: il menù che usi in sala." },
        { title: "Poi decidi tu", body: "Se continui, bene. Se smetti, smetti: nessun vincolo, nessuna penale, e non ti rincorriamo." }
    ],
    support: "Per tutto il tempo rispondiamo noi: in italiano, al telefono e via email. Non un centralino."
};

// ── 9 · FAQ ─────────────────────────────────────────────────────────────────

export const FAQ = {
    title: "Domande, in breve.",
    items: [
        { q: "Devo ribattere tutto il menù?", a: "No. Carichi la foto o il PDF di quello che usi già: piatti, prezzi e categorie vengono creati per te. Tu controlli e pubblichi." },
        { q: "Serve installare qualcosa?", a: "Niente. Il menù è una pagina web: il cliente inquadra il QR e si apre. A te basta il telefono che hai in tasca." },
        { q: "E i QR che ho già stampato?", a: "Restano validi. Il menù dietro al codice cambia, il codice no: i tavoli e i segnaposti non si toccano." },
        { q: "Funziona con un solo locale?", a: "Sì, tutto funziona anche con un locale solo. Il prezzo è per locale e cala del 10% dal secondo in poi." },
        { q: "Posso passare dal Base al Pro dopo?", a: "Quando vuoi, e anche tornare indietro. Ordini al tavolo e prenotazioni si accendono e si spengono dal pannello." }
    ],
    more: "Hai un’altra domanda? Scrivici, rispondiamo noi."
};

// ── 10 · Contatto ───────────────────────────────────────────────────────────

export const CONTACT = {
    title: { before: "Il tuo menù, sempre al passo. ", highlight: "Partiamo?", after: "" } satisfies HighlightedTitle,
    lede: "Lasciaci un contatto: ti chiamiamo entro 24 ore. Se hai sottomano una foto del menù, usciamo dalla telefonata con il tuo menù già online.",
    /** Variante form: sotto la lede. L'indirizzo viene da company.ts. */
    writeInstead: "Se preferisci scrivere:",
    /** Variante signup: sotto la CTA. */
    talkInstead: "Preferisci parlarne? Scrivici:",
    fields: {
        name: "Nome",
        venue: "Nome del locale",
        phone: "Telefono",
        email: "Email"
    },
    interestsLabel: "Cosa ti interessa di più?",
    interests: ["Il menù", "Le prenotazioni", "Gli ordini al tavolo"],
    privacy: {
        before: "Ho letto l’",
        link: "informativa privacy",
        href: "/legal/privacy",
        after: " e acconsento al trattamento dei dati per essere ricontattato."
    }
};

// ── 11 · Footer ─────────────────────────────────────────────────────────────

export const FOOTER = {
    tagline: "Menù digitali che si aggiornano da soli, per ristoranti, bar e locali.",
    columns: {
        product: {
            title: "Prodotto",
            links: [
                { label: "Funzionalità", href: "#funzioni" },
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
