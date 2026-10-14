// Le novità della versione 10 (D120, «ognuno vale a sé»): menù e stile in
// regole separate, più fasce, oltre mezzanotte, multi menù, e a pari merito
// vince l'ultima che hai messo (D135). Si vedono su localhost e, con
// VITE_OFFICINA_CALENDARIO=true, in staging (deciso da Alex il 2026-10-14);
// restano spente in produzione finché il database e il menù del cliente non
// le reggono (D149); le prove le accendono da sé.
// `evid`: in evidenza, la data sulla card e il pulsante senza link libero (D187).
const ON = (import.meta.env.DEV || import.meta.env.VITE_OFFICINA_CALENDARIO === "true") && import.meta.env.MODE !== "test";
export const NEW_MODEL = { multiRange: ON, overnight: ON, multiMenu: ON, splitLayout: ON, newestWins: ON, evid: ON };
/** Il database salva già le novità: diventa true con le migrazioni di Lorenzo. */
export const DB = { ready: false };
export const DB_LATER = "arriva col database nuovo";
export const DB_WAIT = "si salva col database nuovo";
