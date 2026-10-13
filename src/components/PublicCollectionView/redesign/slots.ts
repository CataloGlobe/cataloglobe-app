import type { ReactNode, RefObject } from "react";
import type { ActivityFee } from "@/types/activity";
import type {
    CollectionViewSection,
    CollectionViewSectionGroup,
    CollectionViewSectionItem,
    SocialLinks
} from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { HubTab } from "@/types/collectionStyle";
import type { Allergen } from "@/services/supabase/allergens";
import type { ResolvedAllergen, ResolvedCharacteristic, V2FeaturedContent } from "@/types/resolvedCollections";
import type { OpeningHoursEntry, UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import type { SelectionItem } from "@components/PublicCollectionView/OrderingSheet/OrderingSheet";
import type { ReviewsViewProps } from "@components/PublicCollectionView/ReviewsView/ReviewsView";
import type { SendResult } from "./order/orderSend";

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
    /** Categorie del menu per le pill dell'isola (vuote fuori dal Menu o senza piatti), già filtrate. */
    categoryGroups: CollectionViewSectionGroup[];
    activeSectionId: string | null;
    onSelectSection: (sectionId: string) => void;
    /** La ⌄ di una pill: sottocategorie di quella categoria (spec §4). */
    onSelectSubSection: (sectionId: string) => void;
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
    /** Invito al voto e pulsante «★ Vota» (spec §11); assente senza recensioni. */
    vote?: VoteSlotContext;
};

/** Quando e come chiedere il voto (spec §11, D38, D76). */
export type VoteSlotContext = {
    activityId: string;
    /** Sale quando al tavolo si chiede il conto (D76). */
    tableMoment: number;
    /** Voto inviato in questa visita (anche dal fondo). */
    reviewed: boolean;
    /** Apre il modulo del voto nel foglio, col voto scelto; dall'invito cresce dalla sua altezza. */
    onRate: (rating?: number, growFrom?: number) => void;
    /** Logo e nome del locale nella testata della modale (mockup v38). */
    logoUrl: string | null;
    venueName: string;
    /** Rimostra la barra: l'invito vola dentro, il pulsante largo si deve vedere. */
    reveal: () => void;
};

export type BottomBarSlot = (context: BottomBarSlotContext) => ReactNode;

/** Fogli del redesign che `CollectionView` apre per nome (⋯, nome, stato del locale). */
export type PublicSheetName =
    | "more"
    | "info"
    | "hours"
    | "language"
    | "featured"
    | "categories"
    | "search"
    | "filters"
    | "allergens"
    | "characteristics"
    | "order";

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
    /** Storia su desktop: voce del ⋯ (sul telefono sta nella barra in basso). Assente senza Storia. */
    story?: { active: boolean; onToggle: () => void };
    /** Foglio «Categorie» (Menu toccato di nuovo): albero già filtrato e sezione in vista. */
    categories: {
        groups: CollectionViewSectionGroup[];
        /** Nome del menu nel sottotitolo («Menu pranzo · 5 categorie · 42 piatti»), come nell'isola. */
        menuName: string | null;
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
    /**
     * Allergeni e Caratteristiche dal fondo (spec §10): l'elenco di legge e
     * quante volte compaiono nel menu intero, senza i filtri del cliente.
     */
    menuInfo: {
        allergens: Allergen[];
        characteristics: ResolvedCharacteristic[];
        groups: CollectionViewSectionGroup[];
    };
    /** Scheda prodotto nel foglio (spec §6): in lettura, o in modo ordine col QR del tavolo (spec §7). */
    product: {
        /** Prodotto o variante per id, dal menu risolto (anche per «Perfetto con»). */
        findProduct: (productId: string) => CollectionViewSectionItem | null;
        showImage: boolean;
        /** Slug della sede: «La storia» si legge nel foglio, come nella tab Storia. Senza (anteprima), niente «La storia». */
        slug: string | null;
        /** Analitiche dell'apertura di una scheda raggiunta da «Perfetto con». */
        onTrackOpen: (item: CollectionViewSectionItem) => void;
        /** Solo quando si può ordinare dalla scheda: aggiunge la riga e restituisce il suo «Annulla». */
        order?: { add: (line: SelectionItem) => () => void };
    };
    /** Foglio «Il tuo ordine · Tavolo N» (spec §7): solo col QR del tavolo. */
    ordering?: OrderingContext;
    /** Modulo del voto nel foglio (spec §11): la modale piccola cresciuta, aperta dall'invito e dal fondo. */
    rate?: { props: ReviewsViewProps; onSubmitted: () => void; logoUrl: string | null; venueName: string };
};

/** Il carrello e il tavolo, tenuti da `CollectionView` (stessa selezione e stessa sessione di oggi). */
export type OrderingContext = {
    selection: SelectionItem[];
    /** Etichetta del tavolo dal QR; null se la sessione non la porta. */
    tableLabel: string | null;
    /** Token della sessione del tavolo, per leggere e annullare gli ordini; null = sessione finita. */
    jwt: string | null;
    /** Ordini sospesi o tavolo chiuso: il messaggio da mostrare al posto dell'invio. */
    blockedMessage: string | null;
    setQty: (index: number, qty: number) => void;
    remove: (index: number) => void;
    replaceLine: (index: number, line: SelectionItem) => void;
    /** «Note per la cucina» per tutto l'ordine (mockup v38); null = nessuna. Si svuota con l'invio. */
    note: string | null;
    setNote: (note: string | null) => void;
    /** Manda la selezione alla cucina: l'ordine creato (selezione svuotata), o cosa è andato storto. */
    send: () => Promise<SendResult>;
    /** Sessione scaduta mentre si leggevano o annullavano gli ordini. */
    onSessionExpired: () => void;
    /** Sale a ogni invio riuscito: gli ordini si rileggono. */
    refreshKey: number;
    billRequestedAt: string | null;
    onBillRequestedAtChange: (next: string | null) => void;
    waiterCalledAt: string | null;
    onWaiterCalledAtChange: (next: string | null) => void;
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
    /** «Aggiunto · nome» con Annulla, anche per il + della lista (spec §7). */
    notifyAdded?: (name: string, undo: () => void) => void;
    /** Il modulo del voto nel foglio, col voto già scelto se c'è (spec §11). */
    openRate?: (rating?: number, growFrom?: number) => void;
    /** Prenota a passi nel foglio; assente = la pagina `/:slug/prenota` di oggi. */
    openBooking?: () => void;
    /** Preferenze dei Filtri (Vegetariano, Vegano, Piccante), in aggiunta agli allergeni. */
    preferenceFilter?: PreferenceFilter;
};

/** Le preferenze scelte, viste da `CollectionView`: quante sono, chi passa, come si tolgono. */
export type PreferenceFilter = {
    count: number;
    test: (item: CollectionViewSectionItem) => boolean;
    clear: () => void;
};

/** Dati del fondo pagina (spec §10): Oggi, Informazioni utili, Contatti, Prenota, voto. */
export type FooterSlotContext = {
    activityId?: string;
    openingHours: OpeningHoursEntry[];
    upcomingClosures: UpcomingClosure[];
    socialLinks: SocialLinks | undefined;
    address: string | null;
    /** C'è l'elenco degli allergeni (ristorazione: sempre). */
    allergensCount: number;
    /** Almeno un piatto del menu ha una caratteristica. */
    hasCharacteristics: boolean;
    /** Solo se la sede prende prenotazioni online. */
    onOpenReservation?: () => void;
    /** Apre il foglio del voto col voto già scelto (lo stesso dell'invito); assente senza recensioni. */
    onRate?: (rating: number) => void;
    /** Voto inviato in questa visita: il blocco dice «Grazie». */
    reviewed: boolean;
};

export type FooterSlot = (context: FooterSlotContext) => ReactNode;
