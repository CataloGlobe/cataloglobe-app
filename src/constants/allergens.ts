// Allergeni alimentari secondo Regolamento UE 1169/2011
// Riferimento ufficiale: i 14 allergeni obbligatori

export interface Allergen {
    id: string;
    label: string;
    description: string;
}

export const ALLERGENS: Allergen[] = [
    {
        id: "gluten",
        label: "Cereali contenenti glutine",
        description: "Grano, segale, orzo, avena, farro, kamut e i loro derivati."
    },
    {
        id: "crustaceans",
        label: "Crostacei",
        description: "Gamberi, gamberetti, scampi, granchi, aragoste, astici e prodotti derivati."
    },
    {
        id: "eggs",
        label: "Uova",
        description: "Presenti in pasta all’uovo, prodotti da forno, panature, creme, maionese."
    },
    {
        id: "fish",
        label: "Pesce",
        description: "Tutti i tipi di pesce e derivati, eccetto gelatina di pesce per birra/vino."
    },
    {
        id: "peanuts",
        label: "Arachidi",
        description: "Olio di arachidi, burro di arachidi, farine e prodotti derivati."
    },
    {
        id: "soy",
        label: "Soia",
        description: "Tutti i prodotti a base di soia, eccetto oli raffinati e tocoferoli."
    },
    {
        id: "milk",
        label: "Latte",
        description: "Latte, lattosio e derivati (eccetto siero di latte per distillati alcolici)."
    },
    {
        id: "nuts",
        label: "Frutta a guscio",
        description: "Mandorle, nocciole, noci, anacardi, pecan, Brasile, pistacchi, macadamia."
    },
    {
        id: "celery",
        label: "Sedano",
        description: "Presente in zuppe, salse, dadi, estratti e preparati vegetali."
    },
    {
        id: "mustard",
        label: "Senape",
        description: "Mostarda, condimenti, salse e preparazioni a base di senape."
    },
    {
        id: "sesame",
        label: "Sesamo",
        description: "Semi interi nei prodotti da forno e possibili tracce nelle farine."
    },
    {
        id: "sulphites",
        label: "Solfiti",
        description: "SO2 > 10mg/kg o 10mg/l, presenti in conserve, aceto, bibite, funghi secchi."
    },
    {
        id: "lupins",
        label: "Lupini",
        description: "Presenti in prodotti vegan, farine, salumi vegetali e preparazioni proteiche."
    },
    {
        id: "molluscs",
        label: "Molluschi",
        description: "Cozze, vongole, ostriche, calamari, lumachini e derivati."
    }
];
