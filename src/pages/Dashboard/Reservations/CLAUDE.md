# Reservations — UI

Regole epic in root `CLAUDE.md` (`## Epic Prenotazioni`).

Service layer FE: `src/services/supabase/reservations.ts`, `reservationGuests.ts`, `seatings.ts`, `seatingRpcMessages.ts`. UI in `src/pages/Dashboard/Reservations/`, rotta di sede `/locations/:id/prenotazioni` (`/reservations` reindirizza, §48.1): `Reservations.tsx` (host) + `ReservationsInbox/Agenda/Service.tsx` + drawer create/edit/detail + `SeatingCloseQuestion.tsx`. Due schede, Agenda · Servizio; «Da gestire» è una `Card` in cima all'Agenda, la ricerca è una `DataTable`. Righe su `ListRow` (coda a 56, Agenda e Servizio `dense` a 48). Il segnale d'azienda è «N da gestire» sulla card in Sedi (`countPendingReservationsByActivity`). `serviceDay.ts` — boundary giorno servizio, v. `## Edge Functions` sopra.
