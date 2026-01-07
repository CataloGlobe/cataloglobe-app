// services/collection/getDefaultPublicStyle.ts
import type { CollectionStyle } from "@/types/collectionStyle";

export const DEFAULT_PUBLIC_STYLE: Required<CollectionStyle> = {
    backgroundColor: "#ffffff",
    fontFamily: "outfit",
    headerBackgroundColor: "#ffffff",
    heroImageRadius: 16,
    sectionNavColor: "#000000",
    sectionNavShape: "pill",
    cardTemplate: "left",
    cardRadius: 16,
    cardBackgroundColor: "#ffffff"
};
