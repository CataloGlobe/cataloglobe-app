import { FRAMING_DEFAULTS } from "@components/ui/ImageReframeEditor/types";

/**
 * Default di lettura per l'immagine prodotto quando `products.image_framing` è
 * NULL (prodotti caricati prima della migration `20260716120000`): centered
 * cover + fill blur, cioè esattamente il render pre-framing → zero regressione.
 *
 * Alias di `FRAMING_DEFAULTS` (unica fonte, canonical home in
 * `ImageReframeEditor/types.ts`): i valori erano già identici campo per campo e
 * due costanti gemelle sono solo un'occasione di drift. Il nome resta perché è
 * quello leggibile nei call site del dominio prodotto.
 */
export const PRODUCT_IMAGE_DEFAULT_FRAMING = FRAMING_DEFAULTS;

/**
 * Tetto all'attesa della lettura. L'immagine è quella appena mostrata
 * nell'editor, quindi in cache: il caso normale si risolve in pochi ms e non
 * arriva mai qui. Serve solo a limitare lo stallo di rete, che senza tetto
 * durerebbe quanto il timeout del browser (decine di secondi) bloccando il
 * salvataggio della sezione immagine. Allo scadere si degrada al comportamento
 * precedente (ratio NULL) e il valore viene ritentato al prossimo salvataggio.
 */
const NATURAL_RATIO_TIMEOUT_MS = 3000;

/**
 * Ratio naturale (w/h) di un'immagine remota già caricata, letto dal DOM senza
 * toccare il canvas (`naturalWidth/naturalHeight` non richiede CORS).
 *
 * Serve al percorso di ri-inquadratura: l'editor restituisce il ratio solo
 * quando arriva un file nuovo (lo ricava dalla compressione), mentre su
 * un'immagine esistente rigira il ratio già salvato — NULL per tutti i prodotti
 * pre-migration. Senza questo valore `FramedMedia` resta sul path legacy cover
 * e lo zoom impostato dall'utente viene ignorato in silenzio.
 *
 * Non lancia mai e non supera `NATURAL_RATIO_TIMEOUT_MS`: immagine
 * irraggiungibile, dimensioni ignote o lettura troppo lenta → `null`, che
 * mantiene il comportamento legacy.
 */
export function loadNaturalAspectRatio(source: string): Promise<number | null> {
    if (typeof Image === "undefined") return Promise.resolve(null);

    let timer: ReturnType<typeof setTimeout> | undefined;

    const read = new Promise<number | null>(resolve => {
        const img = new Image();
        img.onload = () => {
            resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null);
        };
        img.onerror = () => resolve(null);
        img.src = source;
    });

    const timeout = new Promise<number | null>(resolve => {
        timer = setTimeout(() => resolve(null), NATURAL_RATIO_TIMEOUT_MS);
    });

    // `finally` copre entrambi gli esiti: lettura vinta → timer disarmato,
    // niente handle appeso; timeout vinto → clearTimeout su un timer già
    // scattato, no-op.
    return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
}
