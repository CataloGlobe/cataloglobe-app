// ============================================================
// sediVistaStore — cosa si guarda e con chi si confronta (D152).
//
// «Sede» e «Confronta con» stanno in alto a destra e restano
// passando di sezione (Alex 2026-10-09): la sede scelta vale
// ovunque, il confronto si accende solo nelle sezioni che lo
// dichiarano (Calendario, Clienti e numeri) e non si perde nelle
// altre. Con «Tutte le sedi» o un gruppo il confronto non c'è.
//
// Store di modulo (niente Provider): lo leggono la barra in alto e
// le pagine, anche nei rami dove il MainLayout non lo monta. Una
// riga per azienda: cambiando azienda si riparte vuoti. Salvato in
// sessionStorage, best-effort. Parte pura, testabile in `node`;
// la parte React è in `useSediVista.ts`.
// ============================================================

import type { ReactNode } from "react";

/** Cosa si guarda: tutte le sedi, una sede, un gruppo di sedi. */
export type SedeVista = { kind: "all" } | { kind: "sede"; id: string } | { kind: "gruppo"; id: string };

export interface SediVistaState {
    /** Azienda a cui appartiene la riga; un'altra azienda legge lo stato vuoto. */
    tenantId: string | null;
    /** null: nessuna scelta, la pagina usa il suo default (l'indirizzo). */
    sede: SedeVista | null;
    /** Le sedi a confronto. Mai la sede scelta. */
    confronta: readonly string[];
}

const STORAGE_KEY = "cataloglobe:sediVista";

export const EMPTY_SEDI_VISTA: SediVistaState = Object.freeze({ tenantId: null, sede: null, confronta: Object.freeze([]) });

/**
 * Quello che la pagina che dichiara il confronto passa a «in alto a destra»:
 * i gruppi di sedi che sa leggere e una nota per ogni sede del confronto
 * (il Calendario: «diversa · 3 g»).
 */
export interface ConfrontoOpts {
    gruppi?: ReadonlyArray<{ id: string; name: string; sedeIds: readonly string[] }>;
    tag?: (sedeId: string) => ReactNode;
}

const NO_OPTS: ConfrontoOpts = Object.freeze({});

let state: SediVistaState = readStorage();
/** Le pagine che dichiarano il confronto, in ordine: vale l'ultima. */
let confrontoClaims: ConfrontoOpts[] = [];
const listeners = new Set<() => void>();

function readStorage(): SediVistaState {
    if (typeof window === "undefined") return EMPTY_SEDI_VISTA;
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY_SEDI_VISTA;
        const parsed = JSON.parse(raw) as Partial<SediVistaState>;
        if (typeof parsed.tenantId !== "string") return EMPTY_SEDI_VISTA;
        return {
            tenantId: parsed.tenantId,
            sede: isSedeVista(parsed.sede) ? parsed.sede : null,
            confronta: Array.isArray(parsed.confronta) ? parsed.confronta.filter(x => typeof x === "string") : []
        };
    } catch {
        return EMPTY_SEDI_VISTA;
    }
}

function isSedeVista(v: unknown): v is SedeVista {
    if (!v || typeof v !== "object") return false;
    const o = v as { kind?: unknown; id?: unknown };
    if (o.kind === "all") return true;
    return (o.kind === "sede" || o.kind === "gruppo") && typeof o.id === "string";
}

function commit(next: SediVistaState): void {
    state = next;
    if (typeof window !== "undefined") {
        try {
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            // storage pieno o bloccato: resta in memoria
        }
    }
    for (const l of listeners) l();
}

export function subscribeSediVista(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Lo stato dell'azienda indicata; vuoto se la riga è di un'altra. */
export function getSediVista(tenantId: string | null | undefined): SediVistaState {
    return tenantId && state.tenantId === tenantId ? state : EMPTY_SEDI_VISTA;
}

/**
 * Sceglie cosa guardare. Passando da una sede a un'altra con un
 * confronto acceso, la sede di prima entra nel confronto e la nuova ne
 * esce (artifact «Più sedi nel Calendario», E). `opts.confronta`
 * sostituisce il confronto in un colpo solo (da «tutte» o da un gruppo
 * a una sede già a confronto con le altre).
 */
export function setSedeVista(tenantId: string, sede: SedeVista | null, opts?: { confronta?: Iterable<string> }): void {
    const cur = getSediVista(tenantId);
    let confronta: string[] = opts?.confronta ? [...opts.confronta] : [...cur.confronta];
    if (!opts?.confronta && sede?.kind === "sede" && cur.sede?.kind === "sede" && cur.sede.id !== sede.id && confronta.length > 0) {
        confronta.push(cur.sede.id);
    }
    if (sede?.kind === "sede") confronta = confronta.filter(id => id !== sede.id);
    commit({ tenantId, sede, confronta: unique(confronta) });
}

/** Le sedi a confronto; la sede scelta non ci entra mai. */
export function setConfrontaVista(tenantId: string, ids: Iterable<string>): void {
    const cur = getSediVista(tenantId);
    const sedeId = cur.sede?.kind === "sede" ? cur.sede.id : null;
    commit({ tenantId, sede: cur.sede, confronta: unique([...ids].filter(id => id !== sedeId)) });
}

/** Il confronto vale qui: la sezione aperta lo dichiara finché è montata. */
export function claimConfronto(opts: ConfrontoOpts = NO_OPTS): () => void {
    const claim = opts === NO_OPTS ? { ...NO_OPTS } : opts;
    confrontoClaims = [...confrontoClaims, claim];
    for (const l of listeners) l();
    let released = false;
    return () => {
        if (released) return;
        released = true;
        confrontoClaims = confrontoClaims.filter(c => c !== claim);
        for (const l of listeners) l();
    };
}

export function getConfrontoQui(): boolean {
    return confrontoClaims.length > 0;
}

/** Gruppi e nota della pagina che ha dichiarato il confronto per ultima. */
export function getConfrontoOpts(): ConfrontoOpts {
    return confrontoClaims[confrontoClaims.length - 1] ?? NO_OPTS;
}

/** Il confronto si vede: sezione che lo permette, una sede sola, almeno un'altra scelta. */
export function isConfrontoAttivo(s: SediVistaState, confrontoQui: boolean): boolean {
    return confrontoQui && s.sede?.kind === "sede" && s.confronta.length > 0;
}

function unique(ids: string[]): string[] {
    return [...new Set(ids)];
}

/** Solo per le prove. */
export function __resetSediVistaForTests(): void {
    state = EMPTY_SEDI_VISTA;
    confrontoClaims = [];
    listeners.clear();
}
