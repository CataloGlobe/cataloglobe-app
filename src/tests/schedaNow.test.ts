import { describe, expect, it } from "vitest";
import {
  makeNow,
  nowLabel,
} from "@/pages/Operativita/Attivita/scheda/schedaModel";

// «Oggi» nella Scheda della sede è la giornata di servizio in ora di Roma
// (review #336, punto 13), qualunque sia il fuso del dispositivo.
describe("makeNow", () => {
  it("di giorno è la data di Roma, coi minuti dalla mezzanotte", () => {
    const now = makeNow(new Date("2026-10-09T12:30:00+02:00"));
    expect(now).toEqual({
      iso: "2026-10-09",
      weekday: 4,
      minutes: 12 * 60 + 30,
    });
    expect(nowLabel(now)).toBe("venerdì 12:30");
  });

  it("dopo mezzanotte e prima delle 5 è ancora la sera di ieri", () => {
    const now = makeNow(new Date("2026-10-10T01:15:00+02:00"));
    expect(now).toEqual({ iso: "2026-10-09", weekday: 4, minutes: 1440 + 75 });
    expect(nowLabel(now)).toBe("sabato 1:15");
  });

  it("alle 5 comincia il giorno nuovo", () => {
    expect(makeNow(new Date("2026-10-10T05:00:00+02:00"))).toMatchObject({
      iso: "2026-10-10",
      weekday: 5,
      minutes: 300,
    });
  });

  it("legge l'ora di Roma, non quella del dispositivo (anche col cambio d'ora)", () => {
    // 25 ottobre 2026: alle 3 si torna alle 2. Le 4:30 dopo il cambio sono le 3:30 UTC.
    expect(makeNow(new Date("2026-10-25T03:30:00Z"))).toMatchObject({
      iso: "2026-10-24",
      weekday: 5,
      minutes: 1440 + 270,
    });
    // Lunedì a mezzanotte e mezza a Roma: ancora la domenica, giorno 6.
    expect(makeNow(new Date("2026-10-11T22:30:00Z"))).toMatchObject({
      iso: "2026-10-11",
      weekday: 6,
      minutes: 1440 + 30,
    });
  });
});
