// Genera un file .ics di prova, per aprirlo davvero su Google Calendar e Apple
// Calendar senza aspettare un'email.
//
// NON fa parte del build ne' del deploy: e' uno strumento da riga di comando.
//
// ── Uso ─────────────────────────────────────────────────────────────────────
//   npx tsx supabase/dev/generate-reservation-ics.ts
//   npx tsx supabase/dev/generate-reservation-ics.ts --time 23:30 --duration 180
//   npx tsx supabase/dev/generate-reservation-ics.ts --date 2026-10-25
//
// (`tsx` arriva con le dipendenze del progetto. Se sparisse: `npx tsx@4`.)
//
// Scrive `prenotazione.ics` nella cartella corrente e stampa il contenuto.
//
// ── Cosa verificare quando lo apri ──────────────────────────────────────────
//   1. L'ORARIO. E' il punto dove un ICS sbaglia piu' spesso: con il
//      dispositivo su Europe/Rome il calendario deve mostrare l'ora italiana
//      della prenotazione. Poi sposta il fuso di sistema su America/New_York e
//      riapri il file: l'evento DEVE spostarsi (20:00 a Roma = 14:00 a New
//      York in estate). Se restasse alle 20:00 sarebbe "floating", cioe' il
//      difetto che abbiamo evitato scrivendo tutto in UTC.
//   2. Nessun pulsante Accetta/Rifiuta, nessuna richiesta di rispondere: deve
//      essere un evento normale, non un invito. Se compaiono, qualcuno ha
//      aggiunto ATTENDEE o METHOD:REQUEST.
//   3. Titolo, luogo e descrizione leggibili, senza barre rovesciate a vista
//      (`\,` o `\;`): quelle sono l'escaping, e il calendario deve scioglierlo.
//   4. Riapri il file una seconda volta: NON deve comparire un secondo evento.
//      Stesso UID = stesso appuntamento, aggiornato.
//
// ── Casi che vale la pena provare ───────────────────────────────────────────
//   --time 23:30 --duration 180              evento che sconfina a mezzanotte
//   --date 2026-03-29                        passaggio all'ora legale
//   --date 2026-10-25                        ritorno all'ora solare
//   --venue "L'Osteria; il Ritrovo, da C'e'"  caratteri speciali
//   --venue "Ristorante Pizzeria Trattoria Osteria del Gran Vecchio Mulino Antico"
//                                            riga oltre i 75 ottetti

import { writeFileSync } from "node:fs";
import { buildReservationIcs } from "../functions/_shared/reservationIcs.ts";

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    const value = i !== -1 ? process.argv[i + 1] : undefined;
    return value !== undefined && !value.startsWith("--") ? value : fallback;
}

const ics = buildReservationIcs({
    reservationId: arg("id", "3f2504e0-4f89-41d3-9a0c-0305e82c3301"),
    venueName: arg("venue", "Trattoria da Ciro"),
    reservationDate: arg("date", "2026-07-15"),
    reservationTime: arg("time", "20:00"),
    partySize: Number(arg("party", "4")),
    durationMinutes: Number(arg("duration", "120")),
    address: {
        address: arg("street", "Via Verdi"),
        street_number: arg("number", "30"),
        postal_code: arg("cap", "20092"),
        city: arg("city", "Cinisello Balsamo"),
        province: arg("province", "MI")
    },
    cancelUrl: arg(
        "cancel",
        "https://staging.cataloglobe.com/san-pietro-porta-venezia/prenotazione/annulla?token=v1.esempio.firma"
    ),
    now: new Date()
});

if (ics === null) {
    console.error("Generazione fallita: data o ora non interpretabili.");
    process.exit(1);
}

const out = arg("out", "prenotazione.ics");
writeFileSync(out, ics, "utf-8");

const tooLong = ics
    .split("\r\n")
    .filter(l => new TextEncoder().encode(l).length > 75).length;

console.log(ics);
console.log(`Scritto in ${out}`);
console.log(`Righe oltre i 75 ottetti: ${tooLong} (deve essere 0)`);
