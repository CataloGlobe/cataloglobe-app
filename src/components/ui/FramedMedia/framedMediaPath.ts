/** Tolleranza sul confronto zoom == 1 (float dal drag/slider dell'editor). */
export const ZOOM_EPS = 1e-4;

/**
 * True → `FramedMedia` rende con il path legacy: `object-fit: cover` +
 * `object-position` dal punto focale, ratio-agnostico e identico al render
 * pre-framing. False → path parametrico (dimensionamento in % del riquadro +
 * eventuali fasce di riempimento).
 *
 * Due condizioni bastano da sole: senza ratio naturale la geometria non è
 * calcolabile, e a zoom 1 il parametrico coinciderebbe comunque con il cover
 * (meno DOM per lo stesso risultato).
 *
 * Funzione pura, estratta dal componente solo per essere testabile.
 */
export function shouldUseLegacyCoverPath(aspectRatio: number | null, zoom: number): boolean {
    return aspectRatio == null || Math.abs(zoom - 1) < ZOOM_EPS;
}
