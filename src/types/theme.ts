export interface CatalogTheme {
    fontFamily: "system" | "inter" | "outfit";
    primaryColor: string;
    headerBackground: string;
    heroRadius: number;
    categoryPillColor: string;
    categoryPillStyle: "rounded" | "pill";
    cardTemplate: "left" | "right" | "no-image";
    cardRadius: number;
    cardBgColor: string;
    cardTextColor: string;
    itemImageRadius: number;
}
