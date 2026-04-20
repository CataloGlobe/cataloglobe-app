// services/collection/getDefaultPublicStyle.ts
import type { CollectionStyle } from "@/types/collectionStyle";

export const DEFAULT_PUBLIC_STYLE: Required<CollectionStyle> = {
    backgroundColor: "#ffffff",
    fontFamily: "inter",
    headerBackgroundColor: "#ffffff",
    heroImageRadius: 16,
    showLogo: true,
    showCoverImage: true,
    showActivityName: true,
    showCatalogName: true,
    sectionNavColor: "#000000",
    sectionNavShape: "pill",
    sectionNavStyle: "pill",
    cardTemplate: "left",
    cardRadius: 16,
    cardBackgroundColor: "#ffffff",
    cardLayout: "list",
    productStyle: "card",
    featuredStyle: "card"
};
