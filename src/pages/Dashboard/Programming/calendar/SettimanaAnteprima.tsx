// La settimana del Calendario con una bozza dentro, da sola: per i tunnel di creazione.
// È il Calendario stesso in modo «anteprima», così le corsie restano identiche.
import CalendarioView, { type CalendarioViewProps } from "./CalendarioView";
import type { Draft, Impatto, PickProduct } from "./calendarDraft";

export type SettimanaAnteprimaProps = Pick<CalendarioViewProps, "rules" | "names" | "sedi" | "groupIdsByActivity" | "groupNames" | "products" | "formatNames"> & {
    /** La bozza da mostrare (col bordo tratteggiato, «nuovo»). La settimana parte da questa, le sedi dal suo Dove. */
    draft: Draft;
    pickList?: readonly PickProduct[];
    /** «Cosa cambia nel calendario» e gli scontri con gli altri menù, a ogni cambio. */
    onEffect?: (imp: Impatto) => void;
    /** Con più sedi: quella che si guarda, e come cambiarla. */
    sede?: string | null;
    onSede?: (id: string) => void;
};

export function SettimanaAnteprima({ draft, pickList, onEffect, sede, onSede, ...p }: SettimanaAnteprimaProps) {
    return <CalendarioView {...p} anteprima={{ draft, pickList, onEffect, sede, onSede }} />;
}
