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
