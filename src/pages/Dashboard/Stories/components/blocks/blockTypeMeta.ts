import { Type, Heading, Quote, List, Image, Video } from "lucide-react";
import type { ComponentType } from "react";
import type { StoryBlock } from "@/services/supabase/stories";

export interface BlockTypeMeta {
    /** Etichetta IT mostrata nel menu "Aggiungi" e nella barra della card. */
    label: string;
    icon: ComponentType<{ size?: number }>;
}

/**
 * Sorgente unica `type → { icona, etichetta }` per i blocchi Storia.
 * Consumata da `AddBlockMenu` (voci del menu) e da `StoryBlockEditor` (barra
 * d'intestazione della card). Prima era inline in `AddBlockMenu.ITEMS`.
 */
export const BLOCK_TYPE_META: Record<StoryBlock["type"], BlockTypeMeta> = {
    text: { label: "Testo", icon: Type },
    heading: { label: "Titolo", icon: Heading },
    quote: { label: "Citazione", icon: Quote },
    list: { label: "Elenco", icon: List },
    image: { label: "Immagine", icon: Image },
    video: { label: "Video", icon: Video }
};

/** Ordine di presentazione nel menu "Aggiungi". Elenco tra i blocchi testuali, prima dei media. */
export const BLOCK_TYPE_ORDER: StoryBlock["type"][] = ["text", "heading", "quote", "list", "image", "video"];
