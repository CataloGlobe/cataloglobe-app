import type { CompressOptions } from "@/utils/compressImage";
import type { MediaFillMode } from "@components/ui/ImageReframeEditor/types";

/**
 * Preset dichiarativo per un punto di upload immagine. Descrive SOLO la
 * configurazione (aspect ratio, fill modes ammessi, limite size, profilo di
 * compressione): non è legato al codice del punto d'uso. I FASI successivi
 * passeranno questi valori come props a `<ImageUploadEditor>`.
 *
 * `status`:
 *   - "ready"        → pronto per essere adottato dal relativo punto d'uso.
 *   - "documentary"  → riflette la config già in produzione (Featured/Story
 *                      blocco) o una decisione ancora aperta (Product). NON
 *                      collegato al codice reale in questa fase.
 */
export interface ImageUploadPreset {
    /** Ratio del riquadro di inquadratura (w/h). */
    aspectRatio: number;
    /**
     * Modalità di riempimento fasce ammesse per questo contesto. In questa fase
     * il pannello fill è tutto-o-niente (`ImageReframeEditor` non filtra per
     * modalità): il subset è documentativo dell'intento e guida solo la
     * visibilità del pannello (vedi `resolveShowFillPanel`). Il filtro per
     * singola modalità richiederà un'estensione dell'editor (fuori scope Fase 2).
     */
    backgroundFillModes: MediaFillMode[];
    /** Limite dimensione file (reale). Default globale del wrapper: 10MB. */
    maxSizeMB: number;
    /**
     * Profilo di compressione esplicito. Se assente, il wrapper lo deriva da
     * `aspectRatio` via `deriveCompressProfile`. Presente quando si vuole
     * rispecchiare byte-per-byte un profilo esistente (`COMPRESS_PROFILES.*`).
     */
    compress?: CompressOptions;
    /** Lato lungo target per il profilo derivato (se `compress` assente). */
    compressLongEdge?: number;
    /**
     * Etichetta di default del campo (header variant `field`). Il consumer può
     * comunque passare `fieldLabel` esplicito per sovrascriverla.
     */
    fieldLabel?: string;
    /** Titolo di default del drawer di editing (variant `field`). */
    drawerTitle?: string;
    /**
     * Se la rimozione richiede conferma inline. Riflette FASE 10: `true` per i
     * punti a delete immediata su storage (logo/cover/avatar), `false` per i
     * punti a bozza differita (story cover/prodotto), reversibili via Annulla.
     */
    requiresConfirm?: boolean;
    status: "ready" | "documentary";
    note?: string;
}

const ALL_FILL: MediaFillMode[] = ["blur", "dominant", "color", "none"];

/**
 * Deriva un profilo di compressione simmetrico rispetto al ratio, invece di
 * hardcodare dimensioni (es. logo 512×256 → 2:1 senza senso per un target 1:1).
 * Calcola il riquadro-frame al `longEdge` dato e applica un headroom per lo zoom
 * di crop, così il ritaglio resta nitido anche ingrandito. `compressImage` fa
 * solo downscale (scale ≤ 1): cap più grandi del sorgente = nessun upscale.
 */
export function deriveCompressProfile(
    aspectRatio: number,
    opts?: { longEdge?: number; quality?: number; headroom?: number }
): CompressOptions {
    const longEdge = opts?.longEdge ?? 1280;
    const quality = opts?.quality ?? 0.85;
    const headroom = opts?.headroom ?? 1.5;
    const r = aspectRatio > 0 ? aspectRatio : 1;
    const frameW = r >= 1 ? longEdge : Math.round(longEdge * r);
    const frameH = r >= 1 ? Math.round(longEdge / r) : longEdge;
    return {
        maxWidth: Math.max(1, Math.round(frameW * headroom)),
        maxHeight: Math.max(1, Math.round(frameH * headroom)),
        quality,
        format: "webp"
    };
}

/**
 * Il pannello di riempimento fasce va mostrato solo se esiste almeno una
 * modalità diversa da "none" (altrimenti l'unica scelta è banda trasparente:
 * nessun controllo da offrire).
 */
export function resolveShowFillPanel(modes: MediaFillMode[]): boolean {
    return modes.some(m => m !== "none");
}

/**
 * Preset per gli 8 punti noti. `ready` = adottabili subito; `documentary` =
 * riflettono config esistente o decisioni aperte (nessun collegamento al codice
 * reale in questa fase).
 */
export const IMAGE_UPLOAD_PRESETS = {
    // --- Ready --------------------------------------------------------------
    logo: {
        aspectRatio: 1,
        // Blur/foto stonano su un logo: fasce a tinta o trasparenti.
        backgroundFillModes: ["color", "none"],
        maxSizeMB: 10,
        compressLongEdge: 512,
        fieldLabel: "Logo attività",
        drawerTitle: "Modifica logo",
        requiresConfirm: true,
        status: "ready",
        note: "1:1 simmetrico. Sostituisce il profilo 512×256 (2:1) incoerente segnalato in FASE 1."
    },
    coverSede: {
        aspectRatio: 16 / 9,
        backgroundFillModes: ALL_FILL,
        maxSizeMB: 10,
        compressLongEdge: 1280,
        fieldLabel: "Immagine di copertina",
        drawerTitle: "Modifica immagine di copertina",
        requiresConfirm: true,
        status: "ready",
        note: "16:9. Aggiunge framing dove oggi c'è solo crop CSS automatico."
    },
    avatar: {
        aspectRatio: 1,
        backgroundFillModes: ["blur", "none"],
        maxSizeMB: 10,
        compressLongEdge: 512,
        fieldLabel: "Avatar",
        drawerTitle: "Modifica avatar",
        requiresConfirm: true,
        status: "ready",
        note: "1:1. Il wrapper accetta WEBP (fix incoerenza uploadAvatar che oggi lo rifiuta)."
    },
    gallery: {
        aspectRatio: 16 / 9,
        backgroundFillModes: ALL_FILL,
        maxSizeMB: 10,
        compressLongEdge: 1280,
        requiresConfirm: false,
        status: "ready",
        note: "Media galleria sede (bucket business-covers). Flusso add-only → variant embedded, no header/rimozione (lista gestita in ActivityProfileTab)."
    },
    storyCover: {
        aspectRatio: 16 / 9,
        backgroundFillModes: ALL_FILL,
        maxSizeMB: 10,
        compressLongEdge: 1280,
        fieldLabel: "Copertina",
        drawerTitle: "Modifica copertina",
        requiresConfirm: false,
        status: "ready",
        note: "16:9. Bozza differita (Annulla a livello pagina) → nessuna conferma su rimozione."
    },
    // --- Documentary --------------------------------------------------------
    product: {
        aspectRatio: 4 / 3,
        backgroundFillModes: ALL_FILL,
        maxSizeMB: 10,
        compressLongEdge: 1000,
        fieldLabel: "Immagine",
        drawerTitle: "Modifica immagine",
        requiresConfirm: false,
        status: "documentary",
        note: "Ratio da decidere nella fase Product (Card 4:3 / List quadrata / Compatto senza img). Default 4:3 provvisorio; strada consigliata FASE 1 = singolo storage + focal point via FramedMedia."
    },
    featured: {
        aspectRatio: 16 / 9,
        backgroundFillModes: ALL_FILL,
        maxSizeMB: 10,
        compress: { maxWidth: 1200, maxHeight: 800, quality: 0.85, format: "webp" },
        status: "documentary",
        note: "Riflette COMPRESS_PROFILES.featured già in uso. Nessun collegamento al codice Featured in questa fase."
    },
    storyBlock: {
        aspectRatio: 3 / 2,
        backgroundFillModes: ALL_FILL,
        maxSizeMB: 10,
        compress: { maxWidth: 1200, maxHeight: 1500, quality: 0.82, format: "webp" },
        status: "documentary",
        note: "Ratio selezionabile dall'utente (3:2 | 4:5) → un singolo preset non basta. Default 3:2. Riflette COMPRESS_PROFILES.story."
    }
} satisfies Record<string, ImageUploadPreset>;

export type ImageUploadPresetKey = keyof typeof IMAGE_UPLOAD_PRESETS;
