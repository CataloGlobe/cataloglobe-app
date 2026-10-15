import s from "./Crea.module.scss";

/**
 * «A destra» del tunnel (v55): al computer l'anteprima sta nella colonna a
 * destra; con la D al tablet e al telefono si apre con «Anteprima», e il
 * testo lo dice. Le due frasi ci sono tutte e due, il CSS ne mostra una.
 */
export function Destra({ wide, narrow }: { wide: string; narrow: string }) {
  return (
    <>
      <span className={s.dxW}>{wide}</span>
      <span className={s.dxN}>{narrow}</span>
    </>
  );
}
