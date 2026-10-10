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
