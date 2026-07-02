/**
 * Single source of truth (lato frontend) per i MIME accettati dall'import AI menu.
 * Prima la lista era duplicata in 3 punti — UploadStep (validazione selezione/drop),
 * compressImage (allowlist immagini) e l'edge `menu-ai-import` — con rischio di drift.
 *
 * Due insiemi distinti:
 * - IMAGE_MIME_TYPES: immagini comprimibili a valle (compressImage le resize).
 * - IMPORT_MIME_TYPES: formati accettati in upload = immagini + PDF (pass-through).
 *
 * NB: l'edge function (`supabase/functions/menu-ai-import/index.ts`) è un runtime
 * Deno separato e NON importa da `src/`: mantiene la sua copia di ALLOWED_MIME_TYPES
 * con un commento che punta qui. Duplicazione minima ed esplicita tra i due runtime.
 *
 * Tipizzati come `string[]` (non `as const`) di proposito: `.includes(file.type)`
 * dove `file.type` è `string` richiede l'array allargato a `string[]`.
 */
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const IMPORT_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"];
