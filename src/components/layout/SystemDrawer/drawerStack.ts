// I drawer aperti, dal più vecchio al più nuovo. Ognuno ascolta Esc su window:
// con due impilati («Crea ordine» sopra il tavolo, #543) un Esc li chiudeva
// tutti e due. Esc è solo dell'ultimo aperto.
const open: symbol[] = [];

export function openDrawerLayer(): symbol {
    const me = Symbol("drawer");
    open.push(me);
    return me;
}

export function closeDrawerLayer(me: symbol): void {
    const i = open.indexOf(me);
    if (i >= 0) open.splice(i, 1);
}

export const isTopDrawer = (me: symbol): boolean => open[open.length - 1] === me;
