// FASE 5.5 — la finestra di `activity_closures` che il payload pubblico porta
// al form di prenotazione.
//
// Prima era `limit(10)` dalle chiusure di oggi in poi: un numero che non
// proteggeva niente. Il cancello di `submit-reservation` legge TUTTE le
// chiusure; il picker vedeva le prime dieci. Con «Blocca una fascia» le
// chiusure diventano un gesto settimanale, e dalla undicesima il picker
// avrebbe offerto orari che il server rifiuta.
//
// La finestra giusta è quella del dominio: le date che il cliente può
// prenotare — da oggi a oggi + orizzonte − 1, la stessa di
// `isReservationTimeBookable` e di `buildHorizonDays` — PIÙ il giorno prima.
// La coda notturna di ieri è la mattina di oggi (aperto fino alle 02:30):
// se ieri aveva una chiusura parziale, il server la vede e il picker deve
// vederla, altrimenti offre la coda dagli orari settimanali e il server la
// rifiuta. Nessun tetto di righe.
//
// La finestra dei DATI non è la lista MOSTRATA: `PublicOpeningHours` filtra
// da oggi in poi al momento di renderla (`visibleClosures.ts`).

export interface PublicClosuresWindow {
  /** Prima data inclusa: ieri (Europe/Rome), per la coda notturna. */
  fromIso: string;
  /** Ultima data inclusa: oggi + orizzonte − 1. */
  toIso: string;
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * `horizonDays` non finito o < 1 vale 1 (solo oggi), come nel cancello.
 */
export function publicClosuresWindow(todayIso: string, horizonDays: number): PublicClosuresWindow {
  const days = Number.isFinite(horizonDays) ? Math.max(1, Math.floor(horizonDays)) : 1;
  return { fromIso: addDaysIso(todayIso, -1), toIso: addDaysIso(todayIso, days - 1) };
}
