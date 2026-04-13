export interface ScheduleRule {
    name: string;
    type: string;
    status: 'Attiva' | 'Programmata';
    statusColor: string;
}

export interface DemoItem {
    name: string;
    price: string;
    desc: string;
    bg: string;
    emoji: string;
}

export interface Demo {
    name: string;
    address: string;
    slug: string;
    heroGrad: string;
    accent: string;
    dark?: boolean;
    categories: string[];
    items: DemoItem[];
}

export interface PricingTier {
    range: string;
    label: string;
    price: string | null;
    popular: boolean;
}

export interface FaqItem {
    q: string;
    a: string;
}

export const SCHEDULE_RULES: ScheduleRule[] = [
    { name: 'Menu Pranzo', type: 'Layout · 11:00–15:00', status: 'Attiva', statusColor: '#22c55e' },
    { name: 'Happy Hour −30%', type: 'Prezzo · 17:00–19:00', status: 'Programmata', statusColor: '#f59e0b' },
    { name: 'Menu Cena', type: 'Layout · 18:00–23:00', status: 'Attiva', statusColor: '#22c55e' },
];

export const PAIN_ROWS = [
    { before: 'Aggiorni i prezzi sede per sede', after: 'Un aggiornamento, tutte le sedi' },
    { before: 'Il menu è sempre lo stesso', after: 'Cambia da solo per orario e sede' },
    { before: 'Il QR porta solo al menu', after: 'Il QR apre un hub interattivo' },
    { before: 'Le recensioni negative vanno su Google', after: 'Intercetti e gestisci il feedback' },
];

export const HOW_STEPS = [
    {
        num: '01',
        title: 'Crea i tuoi prodotti',
        desc: 'Un database unico — varianti, opzioni, allergeni, immagini. Ogni modifica si propaga a tutti i menu.',
    },
    {
        num: '02',
        title: 'Definisci le regole',
        desc: 'Assegna menu e stili alle sedi con regole temporali. Menu pranzo dalle 11? Happy hour il venerdì? Una regola.',
    },
    {
        num: '03',
        title: 'Pubblica con un QR',
        desc: "Ogni sede ha il suo hub digitale. Il menu giusto appare in automatico — aggiornato, brandizzato, senza manutenzione.",
    },
];

export const DEMOS: Demo[] = [
    {
        name: 'La Pergola',
        address: 'Via dei Giardini 8, Milano',
        slug: 'la-pergola',
        heroGrad: 'linear-gradient(135deg, #78350F 0%, #B45309 50%, #D97706 100%)',
        accent: '#D97706',
        categories: ['Antipasti', 'Primi', 'Secondi', 'Dolci'],
        items: [
            { name: 'Burrata pugliese', price: '€12.00', desc: 'Con pomodorini datterino e basilico fresco...', bg: '#fef3c7', emoji: '🧀' },
            { name: 'Pappardelle al ragù', price: '€16.00', desc: 'Ragù di cinghiale cotto 6 ore con...', bg: '#fde68a', emoji: '🍝' },
            { name: 'Tagliata di manzo', price: '€22.00', desc: 'Scottona irlandese con rucola e grana...', bg: '#fcd34d', emoji: '🥩' },
        ],
    },
    {
        name: 'Barista Lab',
        address: 'Corso Buenos Aires 42, Milano',
        slug: 'barista-lab',
        heroGrad: 'linear-gradient(135deg, #292524 0%, #57534E 50%, #78716C 100%)',
        accent: '#78716C',
        categories: ['Caffetteria', 'Colazione', 'Pranzo', 'Dolci'],
        items: [
            { name: 'Flat White', price: '€3.50', desc: 'Doppio espresso con latte vellutato...', bg: '#f5f5f4', emoji: '☕' },
            { name: 'Avocado Toast', price: '€8.00', desc: 'Pane di segale, avocado, uovo pochè...', bg: '#e7e5e4', emoji: '🥑' },
            { name: 'Croissant artigianale', price: '€2.80', desc: 'Sfogliatura francese con burro AOP...', bg: '#d6d3d1', emoji: '🥐' },
        ],
    },
    {
        name: 'Neon Lounge',
        address: 'Naviglio Grande 16, Milano',
        slug: 'neon-lounge',
        heroGrad: 'linear-gradient(135deg, #0f0a2e 0%, #1e1b4b 50%, #4c1d95 100%)',
        accent: '#8B5CF6',
        dark: true,
        categories: ['Signature', 'Classici', 'Analcolici', 'Snack'],
        items: [
            { name: 'Tokyo Drift', price: '€13.00', desc: 'Sake, yuzu, zenzero, schiuma di shiso...', bg: '#3b1f7a', emoji: '🍸' },
            { name: 'Negroni Sbagliato', price: '€10.00', desc: 'Campari, vermouth rosso, prosecco...', bg: '#4c1d95', emoji: '🥃' },
            { name: 'Smoke & Mirrors', price: '€14.00', desc: 'Mezcal, lime affumicato, agave nera...', bg: '#5b21b6', emoji: '🌫' },
        ],
    },
    {
        name: 'Da Mario',
        address: 'Piazza Duomo 3, Milano',
        slug: 'da-mario',
        heroGrad: 'linear-gradient(135deg, #450a0a 0%, #991B1B 50%, #DC2626 100%)',
        accent: '#EF4444',
        categories: ['Classiche', 'Speciali', 'Fritte', 'Bibite'],
        items: [
            { name: 'Margherita DOP', price: '€8.00', desc: 'San Marzano DOP, fior di latte, basilico...', bg: '#fee2e2', emoji: '🍕' },
            { name: "Diavola con 'nduja", price: '€12.00', desc: "Salame piccante calabrese e 'nduja...", bg: '#fecaca', emoji: '🌶' },
            { name: 'Bufala e pesto', price: '€11.00', desc: 'Mozzarella di bufala campana, pesto...', bg: '#fca5a5', emoji: '🌿' },
        ],
    },
];

export const PRICING_TIERS: PricingTier[] = [
    { range: '1–3', label: 'sedi', price: '39', popular: false },
    { range: '4–10', label: 'sedi', price: '29', popular: true },
    { range: '11–25', label: 'sedi', price: '19', popular: false },
    { range: '26+', label: 'sedi', price: null, popular: false },
];

export const INCLUDED_FEATURES: string[] = [
    'Menu con scheduling automatico',
    'Hub pubblico (Menu · Recensioni · Promo)',
    'Review Guard con routing per stelle',
    'Contenuti in evidenza programmabili',
    'Multi-sede e aggiornamento centralizzato',
    'Stili e temi con versionamento',
];

export const FAQ_ITEMS: FaqItem[] = [
    {
        q: 'Quanto costa?',
        a: "Configuri tutto gratis. Paghi solo quando attivi una sede: €39/sede/mese per le prime 3, €29 dalla 4ª alla 10ª, €19 dall'11ª alla 25ª. IVA inclusa, nessun costo nascosto.",
    },
    {
        q: 'Funziona anche con una sola sede?',
        a: 'Sì. Scheduling, Review Guard e contenuti in evidenza funzionano anche con un singolo locale.',
    },
    {
        q: 'Come funziona il QR code?',
        a: "Ogni sede ha un URL unico. Il QR porta all'hub digitale dove il cliente trova il menu attivo, le recensioni e le promozioni — tutto in base all'orario.",
    },
    {
        q: 'I miei dati sono al sicuro?',
        a: 'Ogni azienda è isolata a livello di database con policy di sicurezza PostgreSQL. Nessun dato può trapelare tra tenant.',
    },
    {
        q: 'Posso provare senza impegno?',
        a: "Sì. I clienti beta ricevono 3 mesi gratuiti. La carta viene registrata all'attivazione ma non addebitata durante il trial.",
    },
];
