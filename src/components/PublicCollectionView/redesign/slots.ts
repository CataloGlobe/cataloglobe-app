import type { ReactNode, RefObject } from "react";
import type { ActivityFee } from "@/types/activity";
import type {
    CollectionViewSection,
    CollectionViewSectionGroup,
    CollectionViewSectionItem,
    SocialLinks
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { HubTab } from "@/types/collectionStyle";
import type { ResolvedAllergen, V2FeaturedContent } from "@/types/resolvedCollections";
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
    /** Categorie del menu per l'isola desktop (vuote fuori dal Menu o senza piatti). */
    sections: { id: string; name: string }[];
    activeSectionId: string | null;
    onSelectSection: (sectionId: string) => void;
    /** «Tutte le categorie» dell'isola desktop. */
    onOpenCategories: () => void;
    /** «Filtri» nel campo di ricerca desktop. */
    onOpenFilters: () => void;
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
export type PublicSheetName = "more" | "info" | "hours" | "language" | "featured" | "categories" | "search" | "filters";

/** Aspetto delle card in evidenza, dallo stile del locale. */
export type FeaturedLook = {
    layout: "card" | "highlight" | "compact";
    showSubtitle: boolean;
    showTitle: boolean;
    showCta: boolean;
};

/** Dati del carosello «In evidenza» di uno slot (spec §9). */
export type FeaturedSlotContext = FeaturedLook & {
    blocks: V2FeaturedContent[];
    slot: "before_catalog" | "after_catalog";
    /** Contenuti di oggi nei due slot, senza doppioni: «Vedi tutti (N)». */
    totalCount: number;
    /** Solo nella pagina pubblica: le analitiche dei tocchi. */
    activityId?: string;
};

export type FeaturedSlot = (context: FeaturedSlotContext) => ReactNode;

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
    /** Solo se la sede prende prenotazioni online. */
    onOpenReservation?: () => void;
    /** Indirizzo pubblico della sede, senza lingua né query (assente in SSR). */
    shareUrl?: string;
    shareTitle: string;
    /** Contenuti in evidenza di oggi (elenco e dettaglio nel foglio). */
    featured: FeaturedLook & { contents: V2FeaturedContent[] };
    /** Foglio «Categorie» (Menu toccato di nuovo): albero già filtrato e sezione in vista. */
    categories: {
        groups: CollectionViewSectionGroup[];
        activeSectionId: string | null;
        /** Scorrono come le pill; si chiamano a foglio chiuso (pagina sbloccata). */
        onSelectSection: (sectionId: string) => void;
        onSelectSubSection: (sectionId: string) => void;
    };
    /** Ricerca e Filtri nel foglio (spec §4): piatti già filtrati, filtri dal vivo. */
    search: {
        sections: CollectionViewSection[];
        /** Allergeni del menu, dal più frequente. */
        allergens: ResolvedAllergen[];
        appliedFilterIds: number[];
        onApplyFilters: (ids: number[]) => void;
        visibleProductCount: number;
        /** Scorre al piatto e lo accende; si chiama a foglio chiuso. */
        onSelectProduct: (productId: string) => void;
        activityId?: string;
    };
    /** Scheda prodotto nel foglio (spec §6), in lettura. */
    product: {
        /** Prodotto o variante per id, dal menu risolto (anche per «Perfetto con»). */
        findProduct: (productId: string) => CollectionViewSectionItem | null;
        showImage: boolean;
        /** Porta alla tab Storia sul racconto; si chiama a foglio chiuso. */
        onOpenStory: (storyId: string) => void;
        /** Analitiche dell'apertura di una scheda raggiunta da «Perfetto con». */
        onTrackOpen: (item: CollectionViewSectionItem) => void;
    };
};

/**
 * Il foglio unico al posto di Informazioni e del ⋯ di oggi: `render` lo monta
 * una volta, `open` lo apre per nome da qualunque punto di `CollectionView`.
 */
export type SheetsSlot = {
    render: (context: SheetsSlotContext) => ReactNode;
    open: (name: PublicSheetName) => void;
    /** Apre la scheda di un prodotto. */
    openProduct: (item: Pick<CollectionViewSectionItem, "id" | "name">) => void;
    /** Il foglio è aperto (qualunque pagina): Cmd/Ctrl+F lo lascia stare. */
    isOpen: () => boolean;
};
