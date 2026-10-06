// Testi della barra di salvataggio, condivisi da `HeaderSaveAction` e dalla
// barra compatta. In un file a parte per non rompere il fast refresh.

/** Accompagna «Salvato» nelle tab che salvano a ogni modifica. */
export const SAVES_INSTANTLY_NOTE = "in questa tab ogni modifica si salva subito";

/** «1 modifica» / «N modifiche». */
export function formatChangeCount(count: number): string {
    return count === 1 ? "1 modifica" : `${count} modifiche`;
}
