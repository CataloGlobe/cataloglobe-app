import type { DeviceFrameFormat } from "@/components/ui/DeviceFrame/DeviceFrame";

/**
 * Logica pura del device-frame di simulazione (?preview=) sulla pagina
 * pubblica. Nessun DOM, nessuna dipendenza da React: testata in
 * `src/tests/previewControl.test.ts`.
 *
 * Regola prodotto "solo formati ≤ dispositivo reale": desktop reale → tutti;
 * tablet reale → tablet/mobile; mobile reale → nessuno (il param viene
 * sempre ignorato, la barra non compare).
 */

const DEVICE_FRAME_RANK: Record<DeviceFrameFormat, number> = {
    mobile: 0,
    tablet: 1,
    desktop: 2
};

/** Ordine di presentazione delle pillole nella barra di controllo. */
const FORMATS_DESC: readonly DeviceFrameFormat[] = ["desktop", "tablet", "mobile"];

// `preview=desktop` non produce MAI un frame. Per la regola "≤ dispositivo
// reale" il livello desktop è selezionabile solo da un dispositivo già
// desktop — cioè esattamente il caso in cui non c'è nulla da simulare:
// incorniciare la pagina alla stessa larghezza in cui verrebbe comunque
// renderizzata aggiungerebbe solo un bordo e un vincolo di altezza. Si
// comporta quindi come il path senza `preview` (no-op silenzioso).
const NO_FRAME_FORMATS: ReadonlySet<DeviceFrameFormat> = new Set<DeviceFrameFormat>(["desktop"]);

export function isDeviceFrameFormat(value: string): value is DeviceFrameFormat {
    return value === "mobile" || value === "tablet" || value === "desktop";
}

// Stesso breakpoint 640 di useIsMobile in PublicSheet.tsx (mobile reale),
// 1024 come CollectionView.module.scss `@container collection` (soglia
// desktop).
export function detectRealDeviceFormat(innerWidth: number): DeviceFrameFormat {
    if (innerWidth < 640) return "mobile";
    if (innerWidth < 1024) return "tablet";
    return "desktop";
}

/** Formati offerti dalla barra: quelli con rank ≤ dispositivo reale. */
export function listPreviewFormats(realFormat: DeviceFrameFormat): DeviceFrameFormat[] {
    return FORMATS_DESC.filter(f => DEVICE_FRAME_RANK[f] <= DEVICE_FRAME_RANK[realFormat]);
}

export type ResolvePreviewArgs = {
    previewParam: string | null;
    realFormat: DeviceFrameFormat;
    /** `null` = appartenenza non ancora nota (loading): trattata come non membro. */
    isMember: boolean | null;
};

/**
 * Formato effettivo del frame, o `null` per "nessun frame" (path identico a
 * `/:slug` senza `preview`). Ogni condizione negativa è silenziosa: un
 * visitatore non membro con `?preview=` in URL vede esattamente la pagina
 * pubblica normale.
 */
export function resolvePreviewFormat({ previewParam, realFormat, isMember }: ResolvePreviewArgs): DeviceFrameFormat | null {
    if (!previewParam || !isDeviceFrameFormat(previewParam)) return null;
    if (NO_FRAME_FORMATS.has(previewParam)) return null;
    if (isMember !== true) return null;
    if (realFormat === "mobile") return null;
    if (DEVICE_FRAME_RANK[previewParam] > DEVICE_FRAME_RANK[realFormat]) return null;
    return previewParam;
}

export type ShowPreviewBarArgs = {
    isMember: boolean | null;
    realFormat: DeviceFrameFormat;
    /** True dentro l'iframe del DeviceFrame: la barra la possiede la finestra host. */
    isFramed: boolean;
    /** `?simulate=` attivo: la barra serve comunque a mostrare la data simulata. */
    hasSimulate: boolean;
};

/**
 * La barra compare SEMPRE per chi ha una relazione col tenant, appena apre il
 * link pubblico normale, purché esista almeno un formato inferiore da offrire
 * (mai da un dispositivo reale già mobile) e la pagina non stia già girando
 * dentro il frame di preview. Con `?simulate=` attivo compare anche senza
 * formati da offrire (es. membro da telefono reale): la data simulata va
 * comunque mostrata.
 */
export function shouldShowPreviewBar({ isMember, realFormat, isFramed, hasSimulate }: ShowPreviewBarArgs): boolean {
    if (isMember !== true) return false;
    if (isFramed) return false;
    return hasSimulate || listPreviewFormats(realFormat).length > 1;
}
