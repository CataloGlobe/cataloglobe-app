import { useSyncExternalStore } from "react";

/**
 * Scorciatoie da tastiera del CRM: Alt+J e Alt+K nella scheda per passare da
 * un lead all'altro, Alt+I per inviare la bozza, Alt+M per modificarla.
 *
 * Con il tasto in più (Alt, ⌥ sul Mac) e un interruttore nelle Impostazioni
 * del CRM (WCAG 2.1.4, review di Lorenzo su #234; deciso da Alex il
 * 2026-10-05): una lettera sola partiva anche dettando (Wispr Flow) o con un
 * tasto premuto per sbaglio, e I invia un messaggio al lead.
 *
 * L'interruttore è una preferenza di questo computer (localStorage): chi detta
 * le spegne dove detta. Accese finché non si spengono.
 */

const STORAGE_KEY = "crm.shortcuts.off";
const CHANGE_EVENT = "crm-shortcuts-change";

export type CrmShortcutLetter = "j" | "k" | "i" | "m";

type ShortcutEvent = Pick<
    KeyboardEvent,
    "code" | "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "repeat" | "isComposing" | "target"
>;

/**
 * Alt più la lettera, senza altri modificatori, fuori dai campi di testo.
 * Si legge `code`: sul Mac Alt+J scrive «∆», quindi `key` non è la lettera.
 */
export function matchesCrmShortcut(event: ShortcutEvent, letter: CrmShortcutLetter): boolean {
    if (event.code !== `Key${letter.toUpperCase()}`) return false;
    if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return false;
    if (event.repeat || event.isComposing) return false;
    const target = event.target as HTMLElement | null;
    return !target?.closest?.("input, textarea, select, [contenteditable='true']");
}

/** La scorciatoia vale: accese, nessun dialogo o menu aperto, il tasto giusto. */
export function isCrmShortcut(event: KeyboardEvent, letter: CrmShortcutLetter): boolean {
    if (!readCrmShortcutsOn()) return false;
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return false;
    return matchesCrmShortcut(event, letter);
}

/** «⌥J» sul Mac, «Alt+J» altrove: il nome che si vede accanto ai tasti. */
export function crmShortcutLabel(letter: CrmShortcutLetter, platform = navigatorPlatform()): string {
    return /mac|iphone|ipad/i.test(platform) ? `⌥${letter.toUpperCase()}` : `Alt+${letter.toUpperCase()}`;
}

function navigatorPlatform(): string {
    return typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent;
}

export function readCrmShortcutsOn(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) !== "1";
    } catch {
        return true;
    }
}

export function setCrmShortcutsOn(on: boolean): void {
    try {
        if (on) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
        // Storage bloccato: resta la scelta di prima.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener("storage", onChange);
    };
}

/** Lo stato dell'interruttore, aggiornato anche da un'altra scheda. */
export function useCrmShortcutsOn(): boolean {
    return useSyncExternalStore(subscribe, readCrmShortcutsOn, () => true);
}
