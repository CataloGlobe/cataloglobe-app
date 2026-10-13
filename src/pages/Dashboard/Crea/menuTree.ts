// L'albero del menù nel tunnel (D177): categorie, sottocategorie e piatti.
// Solo conti e spostamenti, niente schermo e niente database.
import type { Dish, Section } from "./creaModel";

/** Il database ammette tre livelli di categorie. */
export const MAX_LEVEL = 3;

export type SecAt = { list: Section[]; k: number; sec: Section };
export type DishAt = { list: Dish[]; k: number; dish: Dish; sec: Section };

export function findSec(list: Section[], k: string): SecAt | null {
    for (let i = 0; i < list.length; i++) {
        if (list[i].key === k) return { list, k: i, sec: list[i] };
        const r = findSec(list[i].subs, k);
        if (r) return r;
    }
    return null;
}

export function findDish(list: Section[], k: string): DishAt | null {
    for (const sec of list) {
        const i = sec.dishes.findIndex(d => d.key === k);
        if (i >= 0) return { list: sec.dishes, k: i, dish: sec.dishes[i], sec };
        const r = findDish(sec.subs, k);
        if (r) return r;
    }
    return null;
}

/** Tutte le categorie, dall'alto in basso, ognuna con la strada per arrivarci. */
export function allSecs(list: readonly Section[], path: Section[] = []): { sec: Section; path: Section[] }[] {
    return list.flatMap(sec => [{ sec, path: [...path, sec] }, ...allSecs(sec.subs, [...path, sec])]);
}
export const allDishes = (list: readonly Section[]): Dish[] => list.flatMap(x => [...x.dishes, ...allDishes(x.subs)]);

/** Piatti dentro, contando le sottocategorie. */
export const total = (s: Section): number => s.dishes.length + s.subs.reduce((a, x) => a + total(x), 0);
/** Categorie dentro. */
export const cats = (s: Section): number => s.subs.reduce((a, x) => a + 1 + cats(x), 0);
export const totalOf = (list: readonly Section[]) => list.reduce((a, x) => a + total(x), 0);
export const catsOf = (list: readonly Section[]) => list.reduce((a, x) => a + 1 + cats(x), 0);

export function pathOf(list: readonly Section[], k: string, acc: Section[] = []): Section[] | null {
    for (const x of list) {
        if (x.key === k) return [...acc, x];
        const r = pathOf(x.subs, k, [...acc, x]);
        if (r) return r;
    }
    return null;
}
/** Quanti livelli occupa una categoria con quello che ha dentro. */
export const height = (s: Section): number => 1 + Math.max(0, ...s.subs.map(height));
export const inside = (s: Section, k: string): boolean => s.key === k || s.subs.some(x => inside(x, k));
export const pathName = (path: readonly Section[]) => path.map(x => x.name).join(" › ");

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** La categoria con questa strada di nomi; quelle che mancano nascono con `make`. */
export function ensure(list: Section[], names: readonly string[], make: (name: string) => Section): Section {
    let node: Section | null = null;
    for (const nm of names.slice(0, MAX_LEVEL)) {
        let x = list.find(y => same(y.name, nm));
        if (!x) {
            x = make(nm);
            list.push(x);
        }
        node = x;
        list = x.subs;
    }
    if (!node) throw new Error("strada vuota");
    return node;
}

/** Su o giù di un posto fra i fratelli. */
export function shift<T>(at: { list: T[]; k: number }, dir: -1 | 1) {
    const j = at.k + dir;
    if (j < 0 || j >= at.list.length) return;
    [at.list[at.k], at.list[j]] = [at.list[j], at.list[at.k]];
}

/** Fuori dalla categoria che la contiene, subito dopo di lei. */
export function moveOut(root: Section[], k: string) {
    const path = pathOf(root, k);
    if (!path || path.length < 2) return;
    const r = findSec(root, k)!;
    r.list.splice(r.k, 1);
    const g = findSec(root, path[path.length - 2].key)!;
    g.list.splice(g.k + 1, 0, r.sec);
}

export type Drop = { type: "end" } | { type: "sec"; key: string; zone: "before" | "after" | "inside" } | { type: "dish"; key: string; zone: "before" | "after" };

/** Una categoria lasciata prima, dopo o dentro un'altra, o in fondo al menù. */
export function dropSec(root: Section[], k: string, to: Drop) {
    if (to.type === "dish") return;
    const r = findSec(root, k);
    if (!r) return;
    r.list.splice(r.k, 1);
    if (to.type === "end") {
        root.push(r.sec);
        return;
    }
    const g = findSec(root, to.key);
    if (!g) {
        r.list.splice(r.k, 0, r.sec);
        return;
    }
    if (to.zone === "inside") g.sec.subs.push(r.sec);
    else g.list.splice(g.k + (to.zone === "after" ? 1 : 0), 0, r.sec);
}

/** Un piatto lasciato su un altro piatto (prima o dopo) o su una categoria (in fondo). */
export function dropDish(root: Section[], k: string, to: Drop) {
    if (to.type === "end") return;
    const r = findDish(root, k);
    if (!r) return;
    r.list.splice(r.k, 1);
    if (to.type === "sec") {
        const g = findSec(root, to.key);
        (g ? g.sec.dishes : r.list).push(r.dish);
        return;
    }
    const g = findDish(root, to.key);
    if (g) g.list.splice(g.k + (to.zone === "after" ? 1 : 0), 0, r.dish);
    else r.list.splice(r.k, 0, r.dish);
}

/** Lo stesso prodotto due volte nello stesso ramo (la categoria, chi le sta sopra, chi le sta sotto): il database non lo ammette. */
export function clash(list: readonly Section[], above: ReadonlyMap<string, Section> = new Map()): { dish: Dish; a: Section; b: Section } | null {
    for (const sec of list) {
        const seen = new Map(above);
        for (const d of sec.dishes) {
            if (!d.productId) continue;
            const k = d.parentId ? `${d.parentId}/${d.productId}` : d.productId;
            const a = seen.get(k);
            if (a) return { dish: d, a, b: sec };
            seen.set(k, sec);
        }
        const r = clash(sec.subs, seen);
        if (r) return r;
    }
    return null;
}

/** Un piatto nuovo con una variante senza nome o senza prezzo: salvando andrebbe persa. */
export const badFormat = (list: readonly Section[]): Dish | null =>
    allDishes(list).find(d => !d.productId && (d.formats ?? []).some(f => !f.name.trim() || f.price === null)) ?? null;

/**
 * Dopo un salvataggio fermo a metà: `fresh` è il menù riletto dal database.
 * Quello che nella bozza è nuovo ma lì c'è già prende il suo id, e quello che
 * lì non c'è più lo perde: così «Riprova» scrive solo ciò che manca.
 */
export function adopt(draft: Section[], fresh: readonly Section[]) {
    const byId = new Map(allSecs(fresh).map(x => [x.sec.id!, x.sec]));
    const links = new Set(allDishes(fresh).map(d => d.linkId!));
    for (const { sec } of allSecs(draft)) {
        if (sec.id && !byId.has(sec.id)) sec.id = sec.sort = undefined;
        for (const d of sec.dishes) if (d.linkId && !links.has(d.linkId)) d.linkId = d.sort = undefined;
    }
    const usedS = new Set(allSecs(draft).map(x => x.sec.id));
    const usedD = new Set(allDishes(draft).map(d => d.linkId));
    const walk = (list: Section[], sibs: readonly Section[]) => {
        for (const sec of list) {
            if (!sec.id) {
                const m = sibs.find(f => !usedS.has(f.id) && same(f.name, sec.name.trim() || "Piatti"));
                if (m) {
                    Object.assign(sec, { id: m.id, sort: m.sort });
                    usedS.add(m.id);
                }
            }
            const f = sec.id ? byId.get(sec.id) : undefined;
            for (const d of f ? sec.dishes : []) {
                if (d.linkId) continue;
                const m = f!.dishes.find(x => !usedD.has(x.linkId) && (x.parentId ?? null) === (d.parentId ?? null) && (d.productId ? x.productId === d.productId : same(x.name, d.name)));
                if (m) {
                    Object.assign(d, { linkId: m.linkId, sort: m.sort, productId: m.productId });
                    usedD.add(m.linkId);
                }
            }
            walk(sec.subs, f ? f.subs : []);
        }
    };
    walk(draft, fresh);
}
