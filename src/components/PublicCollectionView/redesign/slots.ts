import type { ReactNode, RefObject } from "react";
import type { ActivityFee } from "@/types/activity";
import type { SocialLinks } from "@/components/PublicCollectionView/CollectionView/CollectionView";
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

/** Dati e gesti che `CollectionView` passa alla barra in basso nuova. */
export type BottomBarSlotContext = {
    activeTab: HubTab;
    onTabChange: (tab: HubTab) => void;
    /** La capsula Menu/Storia c'è solo con almeno due pagine. */
    showStoryTab: boolean;
    /** Il cerchio dell'ordine c'è solo con gli ordini al tavolo. */
    orderVisible: boolean;
    /** Articoli nel carrello: numero accanto all'icona, mai un badge. */
    selectionCount: number;
    onOpenOrder: () => void;
    /** Barra fuori vista, decisa da `useBottomBarAutoHide` in `CollectionView`. */
    hidden: boolean;
};

export type BottomBarSlot = (context: BottomBarSlotContext) => ReactNode;

/** Fogli del redesign che `CollectionView` apre per nome (⋯, nome, stato del locale). */
export type PublicSheetName = "more" | "info" | "hours" | "language";

/** Dati e gesti dei fogli del locale: Altre opzioni, Informazioni, Orari. */
export type SheetsSlotContext = {
    /** Radice della pagina sotto il foglio: `inert` finché è aperto (il portal sta fuori). */
    pageRef: RefObject<HTMLElement | null>;
    openingHours: OpeningHoursEntry[];
    upcomingClosures: UpcomingClosure[];
    fees: ActivityFee[];
    paymentMethods: string[];
    activityServices: string[];
    socialLinks: SocialLinks | undefined;
    address: string | null;
    /** C'è almeno una cosa da mostrare in Informazioni. */
    hasInfo: boolean;
    activeFilterCount: number;
    hasAllergensInCatalog: boolean;
    /** Filtri degli allergeni: stanno nella ricerca, il foglio si chiude prima. */
    onOpenFilters: () => void;
    /** Solo se la sede prende prenotazioni online. */
    onOpenReservation?: () => void;
    /** Indirizzo pubblico della sede, senza lingua né query (assente in SSR). */
    shareUrl?: string;
    shareTitle: string;
};

/**
 * Il foglio unico al posto di Informazioni e del ⋯ di oggi: `render` lo monta
 * una volta, `open` lo apre per nome da qualunque punto di `CollectionView`.
 */
export type SheetsSlot = {
    render: (context: SheetsSlotContext) => ReactNode;
    open: (name: PublicSheetName) => void;
};
