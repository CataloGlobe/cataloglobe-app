import { expect, test, type Page } from "@playwright/test";
import { ACTIVITY_ID, SLUG, stubPublicPage } from "./publicPageStub";

/**
 * «Il tuo ordine · Tavolo N» nel foglio unico del redesign (spec §7): righe da
 * inviare con quantità, Modifica e Rimuovi, totale e «Invia alla cucina», poi
 * l'ordine inviato con gli stati fino a Servito e «Annulla ordine» finché è
 * Inviato. Un piatto che il menu non ha più resta marcato e non parte.
 * Stub senza login: `submit-order`, `cancel-order` e `get-orders-for-session`
 * finti, con gli ordini tenuti nel test.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/ordine-foglio-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

type Order = { id: string; status: string; items: { name: string; qty: number }[]; total: number };

function sessionOrder(order: Order) {
    return {
        id: order.id,
        status: order.status,
        total_amount: order.total,
        order_group_id: "og-1",
        notes: null,
        created_at: "2026-10-11T18:30:00.000Z",
        acknowledged_at: null,
        delivered_at: null,
        cancelled_at: order.status === "cancelled" ? "2026-10-11T18:31:00.000Z" : null,
        items: order.items.map((item, i) => ({
            id: `${order.id}-i${i}`,
            order_id: order.id,
            product_id: null,
            product_name_snapshot: item.name,
            unit_price_snapshot: order.total / item.qty,
            quantity: item.qty,
            line_total: order.total,
            options_snapshot: { primary_option: null, addons: [] },
            item_notes: null,
            created_at: "2026-10-11T18:30:00.000Z",
            cancelled_at: null,
            cancel_reason: null
        }))
    };
}

/** Pagina col QR del tavolo; `orders` sono quelli già inviati, `selection` il carrello salvato. */
async function openPage(page: Page, opts: { orders?: Order[]; selection?: unknown[] } = {}) {
    const orders: Order[] = [...(opts.orders ?? [])];
    const submitted: unknown[] = [];
    await stubPublicPage(page, { ordering: true, details: true });
    await page.route("**/functions/v1/get-orders-for-session**", route =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                session_id: "s1",
                table: { id: "t1", label: "Tavolo 4", zone: null },
                current_open_group_id: null,
                bill_requested_at: null,
                orders: orders.map(sessionOrder)
            })
        })
    );
    await page.route("**/functions/v1/submit-order**", async route => {
        const body = route.request().postDataJSON() as { items: { product_id: string; quantity: number }[] };
        submitted.push(body);
        orders.unshift({ id: `o${orders.length + 1}`, status: "submitted", items: [{ name: "Antipasti 1", qty: 2 }], total: 18 });
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ order_id: orders[0].id, order_group_id: "og-1", status: "submitted", total_amount: 18, items: [] })
        });
    });
    await page.route("**/functions/v1/cancel-order**", async route => {
        const { order_id } = route.request().postDataJSON() as { order_id: string };
        const order = orders.find(o => o.id === order_id);
        if (order) order.status = "cancelled";
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ order_id, status: "cancelled", version: 2, cancelled_at: "2026-10-11T18:31:00.000Z" })
        });
    });
    if (opts.selection) {
        await page.addInitScript(
            ([key, value]) => sessionStorage.setItem(key, value),
            [`catalogobe-selection-${ACTIVITY_ID}`, JSON.stringify(opts.selection)] as const
        );
    }
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
    return { submitted };
}

const cart = (page: Page) => page.getByRole("button", { name: /^Il tuo ordine/ });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Il tuo ordine" });

test("dal carrello alla cucina: quantità, totale, invio, stato e Annulla ordine", async ({ page }) => {
    const { submitted } = await openPage(page);
    await page.getByRole("button", { name: "Aggiungi alla selezione" }).first().click();
    await cart(page).click();

    const dialog = sheet(page);
    await expect(dialog.getByRole("heading", { name: "Il tuo ordine · Tavolo 4" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Da inviare" })).toBeVisible();
    await dialog.getByRole("group", { name: "Quantità di Antipasti 1" }).getByRole("button", { name: "Aumenta quantità" }).click();
    await expect(page.getByText("Paghi al tavolo o in cassa")).toBeVisible();
    await expect(page.getByText(/^18,00/)).toHaveCount(2);

    // Note per la cucina: un invito, poi il campo col conto dei caratteri.
    await dialog.getByRole("button", { name: "Aggiungi una nota per tutto l'ordine" }).click();
    const note = dialog.getByRole("textbox", { name: "Note per la cucina, per tutto l'ordine" });
    await expect(note).toBeFocused();
    await note.fill("  tutto   insieme ");
    await expect(dialog.getByText("18/140")).toBeVisible();

    await page.getByRole("button", { name: "Invia alla cucina" }).click();
    // La conferma entra a spinta (mockup v38): «Ordine 1 · Tavolo 4», righe, stato, «Aggiungi altro».
    const confirm = page.getByRole("dialog", { name: "Ordine 1 · Tavolo 4" });
    await expect(confirm.getByRole("status").filter({ hasText: "Inviato alla cucina" })).toBeVisible();
    await expect(confirm.getByText("2 piatti · 18,00")).toBeVisible();
    await expect(confirm.getByText("2 × Antipasti 1")).toBeVisible();
    await expect(confirm.getByRole("heading", { name: "Ordine 1 · Tavolo 4" })).toBeVisible();
    await expect(confirm.getByRole("list", { name: "Stato dell'ordine" }).locator("[aria-current=step]")).toHaveText("Inviato");
    await expect(page.getByRole("button", { name: "Aggiungi altro" })).toBeVisible();
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ items: [{ product_id: "prod-0-0", quantity: 2 }], notes: "tutto insieme" });

    // «‹» torna a «Il tuo ordine», con l'ordine fra gli inviati.
    await confirm.getByRole("button", { name: "Indietro" }).click();
    await expect(dialog.getByRole("heading", { name: "Inviati · Tavolo 4 · 1 ordine" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Da inviare" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Invia alla cucina" })).toHaveCount(0);
    await expect(dialog.getByRole("list", { name: "Stato dell'ordine" }).locator("[aria-current=step]")).toHaveText("Inviato");
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine");
    // Un ordine in corso: il conto non si chiede ancora.
    const bill = dialog.getByRole("button", { name: /Chiedi il conto/ });
    await expect(bill).toBeDisabled();

    await dialog.getByRole("button", { name: "Annulla ordine" }).click();
    await dialog.getByRole("button", { name: "Sì, annulla" }).click();
    await expect(dialog.getByText("Annullato")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Annulla ordine" })).toHaveCount(0);
    // Nessun ordine più in corso: «Chiedi il conto» si accende subito, a foglio aperto.
    await expect(bill).toBeEnabled();
});

test("«Chiama il cameriere»: conferma finché la sala non arriva, poi si può richiamare", async ({ page }) => {
    await page.clock.install();
    const calls: string[] = [];
    await page.route("**/functions/v1/call-waiter**", async route => {
        const at = new Date(await page.evaluate(() => Date.now())).toISOString();
        calls.push(at);
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ waiter_called_at: at, rate_limited: false })
        });
    });
    await openPage(page);
    await page.getByRole("button", { name: "Aggiungi alla selezione" }).first().click();
    await cart(page).click();
    const dialog = sheet(page);

    await dialog.getByRole("button", { name: "Chiama il cameriere" }).click();
    const called = dialog.getByRole("button", { name: /Cameriere chiamato/ });
    await expect(called).toContainText("Arriva a breve");
    await expect(called).toBeDisabled();
    expect(calls).toHaveLength(1);

    // Passato un minuto senza che la sala lo segni arrivato: si può richiamare.
    await page.clock.fastForward(61_000);
    await expect(called).toContainText("Tocca per richiamare");
    await expect(called).toBeEnabled();
    await called.click();
    await expect(called).toContainText("Arriva a breve");
    expect(calls).toHaveLength(2);
});

test("dopo l'invio «Aggiungi altro» chiude il foglio e torna al menu", async ({ page }) => {
    await openPage(page);
    await page.getByRole("button", { name: "Aggiungi alla selezione" }).first().click();
    await cart(page).click();
    await page.getByRole("button", { name: "Invia alla cucina" }).click();
    await page.getByRole("dialog", { name: "Ordine 1 · Tavolo 4" }).getByRole("button", { name: "Aggiungi altro" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aggiungi alla selezione" }).first()).toBeVisible();
});

test("Modifica una riga dalla scheda e torna all'ordine con Aggiorna", async ({ page }) => {
    await openPage(page);
    await page.getByText("Primi 1", { exact: true }).click();
    await page.getByRole("dialog", { name: "Primi 1" }).getByRole("radio", { name: /^Grande/ }).check();
    await page.getByRole("button", { name: /^Aggiungi · 16,00/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await cart(page).click();

    const dialog = sheet(page);
    await expect(dialog.getByRole("listitem").filter({ hasText: "Primi 1" }).getByText("Grande", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Modifica Primi 1" }).click();
    const edit = page.getByRole("dialog", { name: "Primi 1" });
    await expect(edit.getByRole("radio", { name: /^Grande/ })).toBeChecked();
    await edit.getByRole("radio", { name: /^Normale/ }).check();
    await page.getByRole("button", { name: /^Aggiorna · 12,00/ }).click();

    await expect(dialog.getByRole("heading", { name: "Il tuo ordine · Tavolo 4" })).toBeVisible();
    // La scheda uscita resta nel DOM, nascosta: si guarda la riga dell'ordine.
    const row = dialog.getByRole("listitem").filter({ hasText: "Primi 1" });
    await expect(row.getByText("Normale", { exact: true })).toBeVisible();
    await expect(row.getByText("Grande", { exact: true })).toHaveCount(0);
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (1)");
});

test("un piatto che il menu non ha più resta marcato e va tolto prima dell'invio; gli ordini mostrano il passo", async ({ page }) => {
    const gone = { id: "prod-gone", name: "Piatto ritirato", basePrice: 7, qty: 1, selectedFormat: null, selectedAddons: [], unitPrice: 7, note: null };
    const kept = { id: "prod-0-1", name: "Antipasti 2", basePrice: 10, qty: 1, selectedFormat: null, selectedAddons: [], unitPrice: 10, note: null };
    await openPage(page, {
        selection: [gone, kept],
        orders: [{ id: "o1", status: "ready", items: [{ name: "Secondi 1", qty: 1 }], total: 11 }]
    });
    await cart(page).click();
    const dialog = sheet(page);

    await expect(dialog.getByText("Non più disponibile")).toBeVisible();
    await page.getByRole("button", { name: "Togli i piatti non più disponibili" }).click();
    const remove = dialog.getByRole("button", { name: "Rimuovi Piatto ritirato" });
    await expect(remove).toBeFocused();
    await remove.click();
    await expect(dialog.getByText("Piatto ritirato")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Invia alla cucina" })).toBeVisible();

    await expect(dialog.getByRole("heading", { name: "Inviati · Tavolo 4 · 1 ordine" })).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Stato dell'ordine" }).locator("[aria-current=step]")).toHaveText("Pronto");
    // Pronto: la cucina l'ha preso, non si annulla più.
    await expect(dialog.getByRole("button", { name: "Annulla ordine" })).toHaveCount(0);
});

test("un piatto spento dopo l'apertura: il server lo rifiuta e la riga dice quale togliere", async ({ page }) => {
    const off = { id: "prod-0-1", name: "Antipasti 2", basePrice: 10, qty: 1, selectedFormat: null, selectedAddons: [], unitPrice: 10, note: null };
    const ok = { id: "prod-0-2", name: "Antipasti 3", basePrice: 10, qty: 1, selectedFormat: null, selectedAddons: [], unitPrice: 10, note: null };
    await openPage(page, { selection: [off, ok] });
    // Registrato dopo quello di openPage: vince lui.
    await page.route("**/functions/v1/submit-order**", route =>
        route.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({
                code: "INVALID_ITEMS",
                message: "Uno o più prodotti non sono al momento disponibili.",
                details: { reason: "UNAVAILABLE_PRODUCTS", unavailable_product_ids: ["prod-0-1"] }
            })
        })
    );
    await cart(page).click();
    const dialog = sheet(page);
    await expect(dialog.getByText("Non più disponibile")).toHaveCount(0);
    await page.getByRole("button", { name: /^Invia alla cucina/ }).click();

    await expect(dialog.getByRole("alert")).toContainText("non sono più disponibili");
    await expect(dialog.getByRole("listitem").filter({ hasText: "Antipasti 2" }).getByText("Non più disponibile")).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Antipasti 3" }).getByText("Non più disponibile")).toHaveCount(0);
    await page.getByRole("button", { name: "Togli i piatti non più disponibili" }).click();
    await dialog.getByRole("button", { name: "Rimuovi Antipasti 2" }).click();
    await expect(page.getByRole("button", { name: /^Invia alla cucina · 10,00/ })).toBeVisible();
});
