import ilMolo34Screenshot from '@/assets/demos/il-molo-34.webp';
import laPausaScreenshot from '@/assets/demos/la-pausa.webp';
import velvetGardenScreenshot from '@/assets/demos/velvet-garden.webp';

export interface ScheduleRule {
    name: string;
    type: string;
    status: 'Attiva' | 'Programmata';
    statusColor: string;
}

export interface Demo {
    name: string;
    address: string;
    slug: string;
    screenshot: string;
}

export interface PricingPlan {
    key: 'base' | 'pro';
    name: string;
    priceLabel: string;
    discountNote: string;
    featuresIntro?: string;
    features: string[];
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
        name: 'Il Molo 34',
        address: 'Via del Porto 34, 16034 Portofino (GE)',
        slug: 'il-molo-34',
        screenshot: ilMolo34Screenshot,
    },
    {
        name: 'La Pausa',
        address: 'Corso Italia 12, 20122 Milano (MI)',
        slug: 'la-pausa',
        screenshot: laPausaScreenshot,
    },
    {
        name: 'Velvet Garden',
        address: 'Via Savona 18, 20144 Milano (MI)',
        slug: 'velvet-garden',
        screenshot: velvetGardenScreenshot,
    },
];

const BASE_FEATURES: string[] = [
    'Menu con scheduling automatico',
    'Hub pubblico (Menu · Recensioni · Promo)',
    'Review Guard con routing per stelle',
    'Contenuti in evidenza programmabili',
    'Multi-sede e aggiornamento centralizzato',
    'Stili e temi con versionamento',
];

export const PRICING_PLANS: PricingPlan[] = [
    {
        key: 'base',
        name: 'Base',
        priceLabel: '€39/sede/mese',
        discountNote: 'dal 2° locale −10% · €35,10/sede · IVA inclusa',
        features: BASE_FEATURES,
        popular: false,
    },
    {
        key: 'pro',
        name: 'Pro',
        priceLabel: '€59/sede/mese',
        discountNote: 'dal 2° locale −10% · €53,10/sede · IVA inclusa',
        featuresIntro: 'Tutto del piano Base, più:',
        features: ['Ordini al tavolo via QR', 'Prenotazioni tavolo'],
        popular: true,
    },
];

export const FAQ_ITEMS: FaqItem[] = [
    {
        q: 'Quanto costa?',
        a: 'Due piani per sede: Base €39/mese, Pro €59/mese (IVA inclusa). Dal 2° locale ogni sede costa il 10% in meno (€35,10 Base, €53,10 Pro). Fino a 5 sedi in self-service; oltre, prezzo su misura.',
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
        q: 'Come funziona durante la beta?',
        a: "L'accesso è su richiesta. Scegli Base o Pro e paghi per ogni sede che attivi, dal 2° locale −10%.",
    },
];
