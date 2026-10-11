import type { ReactNode } from "react";
import type { HubTab } from "@/types/collectionStyle";
import type { OpeningHoursEntry, UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";

/**
 * Agganci con cui il redesign sostituisce un pezzo di `CollectionView` senza
 * riscriverlo: `CollectionView` rende lo slot al posto del componente di oggi,
 * solo in modalità pubblica (l'anteprima dello Style Editor tiene il suo).
 * Solo tipi: nessun effetto di bordo, nessun peso nel bundle col flag spento.
 */

/** Dati e gesti che `CollectionView` passa all'isola nuova. */
export type HeaderSlotContext = {
    logoUrl: string | null;
    /** Foto in cima (già filtrata: null se spenta o assente). L'isola ci sta a cavallo. */
    coverImageUrl: string | null;
    activityName: string;
    /** Nome del menu in onda (titolo del catalogo). */
    menuName: string | null;
    /** Il tocco sulla lente: apre la ricerca. */
    onSearchOpen: () => void;
    /** Pointerdown sulla lente: scalda il chunk della ricerca. */
    onSearchPointerDown: () => void;
    /** Filtri allergeni attivi: numero sulla lente. */
    allergensCount: number;
    /** Il ⋯: info, orari, prenota, allergeni. */
    onOpenMore: () => void;
    activeTab: HubTab;
    onTabChange: (tab: HubTab) => void;
    showStoryTab: boolean;
    /** Orari e chiusure straordinarie: l'isola ne ricava «Aperto / Chiude tra / Chiuso». */
    openingHours: OpeningHoursEntry[];
    upcomingClosures: UpcomingClosure[];
    /** Il tocco sullo stato del locale: apre le Informazioni (dove stanno gli orari). */
    onOpenHours: () => void;
};

export type HeaderSlot = (context: HeaderSlotContext) => ReactNode;
