import {
    Beef,
    Beer,
    CakeSlice,
    Coffee,
    CookingPot,
    CupSoda,
    Fish,
    IceCreamCone,
    Martini,
    Pizza,
    Salad,
    Sandwich,
    Soup,
    Utensils,
    Wine,
    type LucideIcon
} from "lucide-react";

/**
 * Icona del titolo della categoria (editor stili, «Icona»). Le categorie non hanno
 * un'icona salvata: si sceglie dal nome, con le posate quando nessuna parola combacia.
 * Ordine = priorità (per esempio «Vini e birre» prende il vino).
 */
const RULES: readonly [RegExp, LucideIcon][] = [
    [/pizz/, Pizza],
    [/\b(insalat|salad|verdur|contorn)/, Salad],
    [/\b(zupp|soup|minestr|vellutat|brod)/, Soup],
    [/\b(pesce|pesci|fish|mare|crud|sushi|frutti di mare)/, Fish],
    [/\b(carne|carni|meat|griglia|grill|bistecc|steak|secondi)/, Beef],
    [/\b(panin|sandwich|burger|piadin|toast|tramezz)/, Sandwich],
    [/\b(primi|pasta|risott|spaghett|first)/, CookingPot],
    [/\b(gelat|ice cream|sorbett)/, IceCreamCone],
    [/\b(dolc|dessert|tort|cake|pasticc|sweet)/, CakeSlice],
    [/\b(caff|coffee|colazion|breakfast|t[èe]\b|tisan)/, Coffee],
    [/\b(vin|wine|cantina|bollicin|champagne|prosecc)/, Wine],
    [/\b(birr|beer)/, Beer],
    [/\b(cocktail|aperitiv|spritz|amari|liquor|distillat|gin\b)/, Martini],
    [/\b(bevand|bibit|drink|analcolic|soft|succh|acqu)/, CupSoda]
];

export function categoryIcon(name: string): LucideIcon {
    const n = name.toLowerCase();
    for (const [re, icon] of RULES) if (re.test(n)) return icon;
    return Utensils;
}
