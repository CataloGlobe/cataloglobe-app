import type { Business } from "@/types/database";

export function getEmptyCopy(business: Business) {
    console.log(business);
    // in futuro puoi usare:
    // business.category
    // business.type
    // business.tags

    return {
        title: "Stiamo preparando il menu",
        description: "Torna a trovarci tra poco per scoprire le nostre proposte."
    };
}
