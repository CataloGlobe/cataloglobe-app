// Diner-facing subscription allowlist: fonte unica per le Edge che aprono o
// chiudono le superfici del cliente finale (menu, ordini, prenotazioni,
// promemoria). `past_due` is a grace state (card in retry for ~2 weeks before
// cancellation): il servizio resta acceso. Anything outside this set
// (`canceled`/`suspended`) blocks.
//
// Modulo senza import, così chi lo usa non si tira dietro altro (es. i gate
// di checkOrderingState, che riguardano solo gli ordini).
export const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);
