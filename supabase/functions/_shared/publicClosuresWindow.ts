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
// `isReservationTimeBookable` e di `buildHorizonDays`. Nessun tetto di righe.
//
// La chiusura del giorno prima NON entra: `PublicOpeningHours` mostra la
// lista com'è, e una chiusura di ieri comparirebbe fra le «prossime». La
// coda notturna di ieri sotto chiusura parziale resta quindi un caso in cui
// picker e server possono non concordare — pre-esistente, raro, segnalato.

export interface PublicClosuresWindow {
  /** Prima data inclusa (oggi, Europe/Rome). */
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
  return { fromIso: todayIso, toIso: addDaysIso(todayIso, days - 1) };
}
