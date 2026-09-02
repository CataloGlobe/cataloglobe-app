// ============================================================
// setupActivityDraft — bozza locale del passo 1 del setup guidato.
//
// Il passo 1 non scrive nulla su DB prima di "Continua": finché il submit
// non parte, i campi compilati vivono solo nello state di React e un
// "indietro" del browser li perde in silenzio. Questo modulo li conserva
// in `localStorage`, senza toccare il database: una sede-bozza a DB è
// stata scartata (il trigger `enforce_seat_limit` conta le righe senza
// filtrare lo status, lo slug è UNIQUE globale e NOT NULL).
//
// La bozza è LOCALE: vive su questo dispositivo e questo browser, non
// sull'account. Chi la promette altrove promette più di quanto mantenga.
//
// Nessuna dipendenza da React: modulo puro, testabile in environment
// `node` come `sedeScopeStore.ts`.
// ============================================================

import type { BusinessFormValues } from "@/types/Businesses";

/**
 * Versione della forma del payload. Un cambio nei campi del form la fa
 * salire: le bozze scritte con la versione precedente vengono scartate
 * alla lettura invece di essere ripristinate a metà.
 */
const DRAFT_VERSION = 1;

const STORAGE_PREFIX = "cataloglobe:setup:activityDraft:";

/**
 * Sette giorni, la stessa soglia con cui `cleanup-draft-schedules` considera
 * abbandonata una regola in bozza. Oltre, la bozza non descrive più
 * un'intenzione: descrive qualcosa che l'utente ha dimenticato.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Campi persistiti: i soli testuali del form.
 *
 * Fuori resta `coverPreview`, che è un blob URL creato da
 * `URL.createObjectURL` — alla ripresa punterebbe nel vuoto — e con esso il
 * `File` della copertina, non serializzabile e comunque troppo pesante per
 * `localStorage`. La copertina va riselezionata: è l'unica cosa che
 * un'uscita perde davvero, e la conferma di chiusura lo dice.
 */
export type SetupActivityDraft = Omit<BusinessFormValues, "coverPreview">;

const DRAFT_FIELDS: Array<keyof SetupActivityDraft> = [
    "name",
    "city",
    "address",
    "street_number",
    "postal_code",
    "province",
    "slug"
];

type StoredDraft = {
    v: number;
    /** Epoch ms della scrittura. Base del TTL. */
    savedAt: number;
    values: SetupActivityDraft;
};

function storageKey(tenantId: string): string {
    return `${STORAGE_PREFIX}${tenantId}`;
}

/**
 * `localStorage` può non esistere (SSR) o lanciare a ogni accesso (Safari in
 * navigazione privata, storage disabilitato da policy, quota esaurita). Il
 * wizard deve funzionare comunque: qui un fallimento vale "nessuna bozza",
 * mai un'eccezione che risale fino al render.
 */
function safeStorage(): Storage | null {
    try {
        if (typeof window === "undefined") return null;
        return window.localStorage;
    } catch {
        return null;
    }
}

/** Vero se nessuno dei campi persistiti porta contenuto. */
function isEmptyDraft(values: SetupActivityDraft): boolean {
    return DRAFT_FIELDS.every(field => values[field].trim() === "");
}

/**
 * Il JSON letto arriva da fuori: può essere corrotto a mano, troncato da una
 * quota, o scritto da una versione precedente del form. Validato per intero
 * prima di essere restituito — un ripristino parziale sarebbe peggio di
 * nessun ripristino.
 */
function parseStored(raw: string): StoredDraft | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;

    const candidate = parsed as Record<string, unknown>;
    if (candidate.v !== DRAFT_VERSION) return null;
    if (typeof candidate.savedAt !== "number" || !Number.isFinite(candidate.savedAt)) return null;
    if (typeof candidate.values !== "object" || candidate.values === null) return null;

    const rawValues = candidate.values as Record<string, unknown>;
    const values = {} as SetupActivityDraft;

    for (const field of DRAFT_FIELDS) {
        const value = rawValues[field];
        if (typeof value !== "string") return null;
        values[field] = value;
    }

    return { v: DRAFT_VERSION, savedAt: candidate.savedAt, values };
}

/**
 * Bozza del tenant, o `null` se assente, illeggibile, di forma non valida o
 * scaduta. Negli ultimi tre casi la chiave viene anche rimossa: una bozza che
 * non sappiamo ripristinare non merita di sopravvivere alla lettura.
 */
export function readSetupActivityDraft(tenantId: string): SetupActivityDraft | null {
    const storage = safeStorage();
    if (!storage) return null;

    let raw: string | null;
    try {
        raw = storage.getItem(storageKey(tenantId));
    } catch {
        return null;
    }

    if (!raw) return null;

    const stored = parseStored(raw);
    if (!stored) {
        clearSetupActivityDraft(tenantId);
        return null;
    }

    if (Date.now() - stored.savedAt > TTL_MS) {
        clearSetupActivityDraft(tenantId);
        return null;
    }

    // Una bozza di soli campi vuoti non ha nulla da ripristinare: vale come
    // assente, e togliersela di torno evita un toast di ripresa a vuoto.
    if (isEmptyDraft(stored.values)) {
        clearSetupActivityDraft(tenantId);
        return null;
    }

    return stored.values;
}

/**
 * Salva i soli campi testuali. Un form tornato completamente vuoto cancella
 * la bozza invece di riscriverla: l'utente ha ripulito, la ripresa non deve
 * riproporgli nulla.
 *
 * Non lancia mai: se lo storage rifiuta la scrittura si prosegue senza bozza.
 */
export function saveSetupActivityDraft(tenantId: string, values: BusinessFormValues): void {
    const storage = safeStorage();
    if (!storage) return;

    const draft = {} as SetupActivityDraft;
    for (const field of DRAFT_FIELDS) {
        draft[field] = values[field];
    }

    if (isEmptyDraft(draft)) {
        clearSetupActivityDraft(tenantId);
        return;
    }

    const payload: StoredDraft = { v: DRAFT_VERSION, savedAt: Date.now(), values: draft };

    try {
        storage.setItem(storageKey(tenantId), JSON.stringify(payload));
    } catch {
        // Quota piena o storage in sola lettura: il wizard resta usabile,
        // semplicemente senza rete di sicurezza.
    }
}

/** Rimuove la bozza del tenant. Idempotente, non lancia. */
export function clearSetupActivityDraft(tenantId: string): void {
    const storage = safeStorage();
    if (!storage) return;

    try {
        storage.removeItem(storageKey(tenantId));
    } catch {
        // Niente da fare e niente da riportare: la bozza resta, scadrà da sé.
    }
}
