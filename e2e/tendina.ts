import { expect, type Locator } from "@playwright/test";

/**
 * Le tendine del Select comune. Con la D accesa la tendina è quella di
 * CataloGlobe (un pulsante combobox che apre un elenco di opzioni), col
 * `<select>` vero nascosto accanto che tiene il valore; con la D spenta è il
 * `<select>` di sempre. Questi aiuti valgono in tutti e due i casi.
 */

/** Il `<select>` che tiene il valore: è la tendina stessa, o quello nascosto accanto. */
export function nativa(combo: Locator): Locator {
    return combo.locator("xpath=self::select | preceding-sibling::select[1]");
}

/** Le voci della tendina come le ha il `<select>` (anche nascosto). */
export function voce(combo: Locator, label: string): Locator {
    return nativa(combo)
        .locator("option")
        .filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) });
}

/**
 * Sceglie una voce, per etichetta (`{ label }`) o per valore (stringa, o
 * `{ value }`), come `selectOption`.
 */
export async function scegli(combo: Locator, option: string | { label?: string; value?: string }): Promise<void> {
    if ((await combo.evaluate(el => el.tagName)) === "SELECT") {
        await combo.selectOption(option);
        return;
    }
    const wanted = typeof option === "string" ? { value: option, label: option } : option;
    const hit = await nativa(combo).evaluate(
        (el, w) => {
            const opts = Array.from((el as HTMLSelectElement).options);
            const o = opts.find(o => (w.value != null && o.value === w.value) || (w.label != null && o.text.trim() === w.label));
            return o ? { label: o.text.trim(), value: o.value } : null;
        },
        wanted
    );
    if (hit == null) throw new Error(`Nessuna voce ${JSON.stringify(option)} nella tendina`);
    await combo.click();
    await combo.page().getByRole("listbox").getByRole("option", { name: hit.label, exact: true }).click();
    // Il pulsante mostra la voce scelta, non solo il valore nascosto (se chi
    // usa la tendina non la svuota subito dopo, come «Aggiungi un contenuto»).
    await expect
        .poll(async () => (await nativa(combo).inputValue()) !== hit.value || (await combo.innerText()).trim() === hit.label)
        .toBe(true);
}
