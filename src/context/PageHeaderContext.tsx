import { createContext, type ReactNode } from "react";

/** Voce del selettore sezione compatto: una tab della banda, come dato. */
export interface PageHeaderSection {
    label: string;
    value: string;
    /** Sezione non ancora raggiungibile: resta in elenco, spenta. */
    disabled?: boolean;
    /**
     * Perché è spenta. Reso come sottotesto sotto l'etichetta, non come
     * tooltip: su mobile un tooltip al tocco non si vede mai, e una voce
     * disabilitata senza spiegazione è solo un vicolo cieco.
     */
    description?: string;
}

export interface PageHeaderAction {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    /**
     * Azione che porta altrove invece di eseguire qualcosa (link esterno,
     * pagina pubblica). Alternativa a `onClick`, non un campo a parte: per chi
     * legge la config resta "una delle azioni", cambia solo cosa fa il tocco.
     * Con `href` valorizzato, `onClick` viene ignorato.
     */
    href?: string;
    /** `_blank` per aprire in una scheda nuova. Solo con `href`. */
    target?: string;
    /** `destructive` per le azioni che cancellano: stile di avvertimento. */
    variant?: "default" | "destructive";
    /** Stacca questa voce dalle precedenti nel menu. */
    separatorBefore?: boolean;
    /**
     * Solo sull'azione primaria: il bottone apre questo sottomenu invece di
     * eseguire `onClick`. Serve quando la primaria non ha un bersaglio implicito
     * (es. "Nuova regola" sulla tab "Tutte", dove il tipo va scelto).
     */
    items?: PageHeaderAction[];
}

/** Icona che resta sempre visibile in compatto: azione frequente, mai nel kebab. */
export interface PageHeaderPersistentIcon {
    icon: ReactNode;
    label: string;
    onClick: () => void;
}

/**
 * Indicazione di stato non interattiva (es. "Salvato ✓" quando non c'è nulla da
 * salvare). Non è un'azione: occupa il posto della primaria quando quella non
 * esiste, invece di costringere la pagina a inventare un bottone finto
 * disabilitato per dire "va tutto bene".
 */
export interface PageHeaderStatusIndicator {
    icon?: ReactNode;
    label: string;
}

/**
 * Controllo dello STATO DELL'ENTITÀ (es. Bozza / Pubblicata di una storia).
 * Sempre visibile in compatto: non è un'azione secondaria da nascondere nel
 * kebab, è la condizione stessa di ciò che si sta modificando.
 *
 * Da NON confondere con i `SegmentedControl` usati come filtro (periodo in
 * Analitiche, rating in Recensioni): quelli cambiano cosa si vede, questo muta
 * il dato. Se un giorno anche i filtri entreranno nella barra compatta,
 * serviranno un campo e un trattamento propri — riusare questo li farebbe
 * sembrare la stessa cosa.
 */
/**
 * Filtro secondario a scelta singola (ruolo in Team, canale in Prenotazioni).
 * In compatto diventa un'icona: cambia cosa si vede, non muta il dato — al
 * contrario di `PageHeaderStatusControl`, che va sempre a vista.
 *
 * `defaultValue` è il valore "nessun filtro" (di solito "Tutti"): serve a
 * distinguere filtro attivo da filtro a riposo, e quindi a decidere se mostrare
 * il pallino sull'icona e la chip di riepilogo.
 */
export interface PageHeaderFilterControl {
    /** Nome del filtro, non dell'opzione: "Ruolo", "Canale". Usato nella chip. */
    label: string;
    options: { label: string; value: string }[];
    value: string;
    defaultValue: string;
    onChange: (value: string) => void;
    /**
     * Icona del bottone quando il filtro sta fra le icone. Con più filtri sulla
     * stessa riga è ciò che li distingue: senza, sarebbero due bottoni identici.
     * Default: icona filtro generica.
     */
    icon?: ReactNode;
}

export interface PageHeaderStatusControl {
    options: { label: string; value: string }[];
    value: string;
    onChange: (value: string) => void;
    /** Nome accessibile del gruppo. */
    label?: string;
    /** Sola lettura (permessi mancanti): visibile ma non modificabile. */
    disabled?: boolean;
}

/**
 * Descrizione STRUTTURATA della toolbar per lo stato compatto.
 *
 * `leading`/`actions` sono ReactNode opachi: lo slot non sa quali nodi siano
 * tab, quali azioni, quali icone persistenti — e senza saperlo non può
 * costruire il selettore sezione né decidere cosa finisce nel kebab. Da qui il
 * canale parallelo a dati: la pagina dichiara *cosa* sono i suoi controlli, la
 * banda decide *come* rappresentarli quando lo spazio è poco.
 *
 * Opzionale: una pagina che non lo fornisce mantiene il comportamento raw.
 */
export interface PageHeaderCompactConfig {
    sections?: PageHeaderSection[];
    activeSection?: string;
    onSectionChange?: (value: string) => void;
    /** Assente = la pagina non ha ricerca in questo stato (niente icona lente). */
    search?: {
        value: string;
        onChange: (next: string) => void;
        placeholder?: string;
    };
    /** Assente quando i permessi non consentono l'azione: la riga resta senza CTA. */
    primaryAction?: PageHeaderAction;
    /** Reso al posto della primaria quando non c'è nulla da fare, solo da dire. */
    statusIndicator?: PageHeaderStatusIndicator;
    /** Il kebab compare solo se questa lista non è vuota. */
    secondaryActions?: PageHeaderAction[];
    /** Toggle vista e simili: sempre a vista, mai dietro un tap in più. */
    persistentIcons?: PageHeaderPersistentIcon[];
    /** Stato dell'entità in corso di modifica: sempre visibile, mai nel kebab. */
    statusControl?: PageHeaderStatusControl;
    /** Filtri secondari a scelta singola: icona + overlay a lista + chip. */
    filterControls?: PageHeaderFilterControl[];
    /**
     * Filtro che prende il posto del picker sezione, per le pagine il cui
     * `leading` è un filtro e non una navigazione (Analitiche, Recensioni): non
     * ci sono sezioni fra cui muoversi, quindi quello spazio è libero e il
     * filtro principale merita di stare lì, col valore corrente in chiaro.
     *
     * Mutuamente esclusivo con `sections`: se ci sono entrambi vince il picker —
     * navigare fra sezioni viene prima di filtrarne una.
     *
     * Nessuna chip di riepilogo: il valore è già scritto nella pillola.
     */
    leadingFilter?: PageHeaderFilterControl;
    /**
     * Ritorno alla lista, per le pagine di dettaglio il cui `leading` è un
     * "← indietro". Non è un picker: non c'è nulla da scegliere, si va in un
     * posto solo. Occupa lo stesso spazio a sinistra.
     *
     * Perde contro `sections` e `leadingFilter` se coesistono.
     */
    backAction?: { label: string; onClick: () => void };
    /** Spinner sulla primaria (creazione in corso, ecc.). */
    loading?: boolean;
}

export interface PageHeaderConfig {
    /** Titolo legacy — ignorato dal `PageHeaderSlot` post-breadcrumb (vive nel
     *  NavbarBreadcrumb). Mantenuto opzionale per backward compat con i call site. */
    title?: string;
    /** Sottotitolo legacy — ignorato post-slim. */
    subtitle?: string;
    /** Addon legacy accanto al titolo — ignorato post-slim. */
    titleAddon?: ReactNode;
    /** Slot sinistro: tab controllati, filtri primari, ecc. */
    leading?: ReactNode;
    /** Slot destro: search, filtri secondari, CTA. */
    actions?: ReactNode;
    /** Versione a dati della stessa toolbar, usata quando lo spazio è poco. */
    compact?: PageHeaderCompactConfig;
}

export interface PageHeaderContextType {
    config: PageHeaderConfig | null;
    setConfig: (config: PageHeaderConfig | null) => void;
}

export const PageHeaderContext = createContext<PageHeaderContextType | null>(null);
