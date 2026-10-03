/**
 * Soglia mobile della pagina pubblica: ≤ 640px è mobile (bottom bar, scrim,
 * PublicSheet a bottom sheet), da 641px desktop (tab nell'header, dialog
 * centrato). Una sola soglia per barra e sheet: con `≤640` da una parte e
 * `<640` dall'altra, a 640px esatti si avevano barra mobile e sheet desktop.
 *
 * ⚠️ SYNC con gli SCSS, che non possono importare questa costante:
 * `@media (max-width: 640px)` per il mobile, `@media (min-width: 641px)`
 * per il desktop delle superfici legate alla sheet (PublicSheet + bottoni
 * chiudi dei consumer) e alla barra.
 */
export const PUBLIC_MOBILE_MAX_WIDTH = 640;

export const PUBLIC_MOBILE_QUERY = `(max-width: ${PUBLIC_MOBILE_MAX_WIDTH}px)`;
