/**
 * Single source of truth per i limiti di dimensione dell'import AI menu.
 * Condiviso tra UploadStep (validazione selezione/drop) e AiMenuImportWizard
 * (override compressione). Niente magic number duplicati altrove.
 *
 * Limiti type-aware: le foto vengono compresse a valle (resize 1200px),
 * quindi tollerano un cap più alto; i PDF viaggiano pass-through inline base64
 * e pesano di più sul body, quindi cap più basso. Il cap aggregato protegge
 * l'isolate dell'edge function dal payload combinato (base64 +33%).
 */
export const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25 MB per foto
export const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB per PDF
export const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30 MB sommando i file accettati
