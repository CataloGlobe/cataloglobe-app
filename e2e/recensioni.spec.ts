import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { sidebarLink } from "./nav";
import { REVIEW, SEDE, TENANT_ID, stubRecensioni, type RecensioniStub } from "./recensioniStub";

/**
 * Recensioni (lotto `ds-5-coda`, P0), rifatta come «Recensioni A» (D154): il
 * periodo nell'indirizzo (30 giorni se manca), il voto in una riga, i filtri
 * con i conteggi, «Solo a voi» o «Invitata su Google» su ogni recensione.
 *
 * Dati finti in `recensioniStub.ts` (tutte le sedi, orologio fermo a
 * mercoledì 23/09/2026); permessi, azienda e sidebar veri.
 */

function main(page: Page) {
    return page.getByRole("main");
}

/**
 * Apre Recensioni. Il periodo parte da 30 giorni: senza dire altro si passa a
 * «Sempre», così ci sono tutte le recensioni del finto (luglio e agosto compresi).
 */
async function openPage(page: Page, period: "Sempre" | null = "Sempre"): Promise<void> {
    await openBusinessPage(page, "reviews", "Recensioni");
    await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toBeVisible({ timeout: 15_000 });
    if (period) await choosePeriod(page, period);
}

async function choosePeriod(page: Page, label: string): Promise<void> {
    await press(main(page).getByRole("radio", { name: label, exact: true }));
}

/** I commenti nell'elenco: si controllano con le attese (`toHaveText`), che aspettano il nuovo render. */
function comments(page: Page): Locator {
    return main(page).getByText(/^(Pizza ottima|Servizio lento|Tiramisù da provare|Freddo) e2e/);
}

/** La riga di una recensione nell'elenco «Recensioni» (RC6). */
function rowOf(page: Page, comment: string): Locator {
    return main(page).getByRole("list", { name: "Recensioni" }).getByRole("listitem").filter({ hasText: comment });
}

/**
 * Clic su un bottone che deve esserci: prima l'attesa con scadenza, così
 * un'assenza è un'asserzione fallita e non un timeout del test.
 */
async function press(button: Locator): Promise<void> {
    await expect(button).toBeVisible();
    await button.click();
}

/** «Cerca» apre il campo, piccolo a destra del periodo. */
async function search(page: Page, text: string): Promise<void> {
    await press(main(page).getByRole("button", { name: "Cerca", exact: true }));
    const field = main(page).getByPlaceholder("Cerca nei commenti");
    await expect(field).toBeFocused();
    await field.fill(text);
}

async function noSideScroll(page: Page): Promise<void> {
    // Dopo un cambio di larghezza la sidebar lascia il posto con una
    // transizione: per un attimo la pagina è stretta. Si misura a layout fermo.
    await expect
        .poll(() =>
            page.evaluate(() => {
                const de = document.documentElement;
                const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
                return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
            })
        )
        .toBeLessThanOrEqual(0);
}

let stub: RecensioniStub;

test.describe("Recensioni", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubRecensioni(page);
    });

    test("il voto in una riga: media, quante, invitate su Google e restate a voi", async ({ page }) => {
        await openPage(page);
        const vote = main(page).getByRole("region", { name: "Il voto" });
        // (5 + 2 + 4 + 5 + 1) / 5 = 3,4
        await expect(vote.getByText(/^3,4$/)).toBeVisible();
        await expect(vote.getByText("5 recensioni", { exact: true })).toBeVisible();
        // 4-5 stelle a Centro, che ha il link: Pizza e la senza commento.
        await expect(vote.getByText("2 invitate su Google · 3 restate a voi", { exact: true })).toBeVisible();
        await expect(vote.getByRole("button", { name: "5 stelle: 2" })).toBeVisible();
        await expect(vote.getByRole("button", { name: "3 stelle: 0" })).toBeDisabled();
    });

    test("il periodo parte da 30 giorni e sta nell'indirizzo", async ({ page }) => {
        await openPage(page, null);
        await expect(main(page).getByRole("radio", { name: "30 giorni", exact: true })).toHaveAttribute("aria-checked", "true");
        await expect(comments(page)).toHaveText(["Pizza ottima e2e, torneremo.", "Servizio lento e2e, un'ora per il secondo."]);
        await expect(main(page).getByText("3 recensioni", { exact: true })).toBeVisible();
        await choosePeriod(page, "Sempre");
        await expect(page).toHaveURL(/[?&]period=all/);
        await expect(comments(page)).toHaveCount(4);
        await page.reload();
        await expect(main(page).getByText("Freddo e2e")).toBeVisible({ timeout: 15_000 });
    });

    test("elenco dal più recente, sede e «Nessun commento»", async ({ page }) => {
        await openPage(page);
        await expect(comments(page)).toHaveText([
            "Pizza ottima e2e, torneremo.",
            "Servizio lento e2e, un'ora per il secondo.",
            "Tiramisù da provare e2e",
            "Freddo e2e"
        ]);
        await expect(main(page).getByText("Nessun commento, solo le stelle.")).toBeVisible();
        await expect(main(page).getByText(/· Porto e2e$/).first()).toBeVisible();
    });

    test("ogni recensione dice se è restata a voi o è andata su Google", async ({ page }) => {
        await openPage(page);
        await expect(rowOf(page, "Pizza ottima e2e").getByText("Invitata su Google", { exact: true })).toBeVisible();
        await expect(rowOf(page, "Servizio lento e2e").getByText("Solo a voi", { exact: true })).toBeVisible();
        await expect(rowOf(page, "Freddo e2e").getByText("Solo a voi", { exact: true })).toBeVisible();
        // 5 stelle a Porto, che non ha il link di Google: nessun segno.
        await expect(rowOf(page, "Tiramisù da provare e2e").getByText(/^(Solo a voi|Invitata su Google)$/)).toHaveCount(0);
    });

    test("filtro per stelle dalla riga del voto, e si toglie dal suo segno", async ({ page }) => {
        await openPage(page);
        await press(main(page).getByRole("button", { name: "1 stella: 1" }));
        await expect(comments(page)).toHaveText(["Freddo e2e"]);
        await press(main(page).getByRole("button", { name: "Togli il filtro delle stelle" }));
        await expect(comments(page)).toHaveCount(4);
    });

    test("i filtri dell'elenco, con i conteggi", async ({ page }) => {
        await openPage(page);
        const low = main(page).getByRole("radio", { name: /^Da leggere: le basse/ });
        await expect(low).toContainText("2");
        await press(low);
        await expect(comments(page)).toHaveText(["Servizio lento e2e, un'ora per il secondo.", "Freddo e2e"]);
        await press(main(page).getByRole("radio", { name: /^Con un commento/ }));
        await expect(comments(page)).toHaveCount(4);
        await expect(main(page).getByText("Nessun commento, solo le stelle.")).toHaveCount(0);
    });

    test("ricerca nei commenti", async ({ page }) => {
        await openPage(page);
        await search(page, "tiramisù");
        await expect(comments(page)).toHaveText(["Tiramisù da provare e2e"]);
    });

    test("periodo: 7 giorni", async ({ page }) => {
        await openPage(page);
        await choosePeriod(page, "7 giorni");
        await expect(main(page).getByText("Freddo e2e")).toHaveCount(0);
        await expect(comments(page)).toHaveText(["Pizza ottima e2e, torneremo.", "Servizio lento e2e, un'ora per il secondo."]);
    });

    test("periodo vuoto: lo dice e offre «Vedi da sempre»", async ({ page }) => {
        await openPage(page);
        await choosePeriod(page, "Oggi");
        await expect(main(page).getByText("Nessuna recensione oggi")).toBeVisible();
        await press(main(page).getByRole("button", { name: "Vedi da sempre" }));
        await expect(comments(page)).toHaveCount(4);
    });

    test("ordine: dal voto più alto", async ({ page }) => {
        await openPage(page);
        await main(page).getByRole("combobox", { name: "Ordine" }).selectOption("ratingDesc");
        await expect(comments(page).last()).toHaveText("Freddo e2e");
        const list = await comments(page).allTextContents();
        expect(list.slice(0, 2).sort()).toEqual(["Pizza ottima e2e, torneremo.", "Tiramisù da provare e2e"]);
    });

    test("senza lettura: la pagina è bloccata", async ({ page }) => {
        await stub.revoke("reviews.read");
        await openBusinessPage(page, "overview", "Panoramica");
        await page.goto(page.url().replace(/\/overview$/, "/reviews"));
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toHaveCount(0);
    });

    test("a 375 nessuno scroll orizzontale", async ({ page }) => {
        await openPage(page);
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toBeVisible();
        await noSideScroll(page);
    });
});

test.describe("Recensioni — vuoto ed errore", () => {
    test("nessuna recensione", async ({ page }) => {
        stub = await stubRecensioni(page, { empty: true });
        await openBusinessPage(page, "reviews", "Recensioni");
        await expect(main(page).getByText(/Nessuna recensione/).first()).toBeVisible({ timeout: 15_000 });
    });

    test("errore di caricamento: lo dice e offre «Riprova»", async ({ page }) => {
        stub = await stubRecensioni(page);
        await page.route(/\/rest\/v1\/reviews\?/, route => route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }));
        await openBusinessPage(page, "reviews", "Recensioni");
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText(/Nessuna recensione/)).toHaveCount(0);
    });
});

/**
 * Feedback privato (R1): niente coda né stati. Le righe con gli stati della
 * vecchia moderazione (in attesa, nascosta) stanno nell'elenco come le altre,
 * il riepilogo le conta tutte, Elimina è su ogni riga con `reviews.delete`.
 * Nessuna PATCH: una write non registrata risponde 500 e farebbe fallire.
 */
test.describe("Recensioni — feedback privato", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubRecensioni(page, { legacyStatuses: true });
    });

    test("nessuna coda, nessun comando di moderazione, nessuno stato", async ({ page }) => {
        await openPage(page);
        await expect(main(page).getByText("Carbonara perfetta e2e")).toBeVisible();
        await expect(main(page).getByText(/in attesa/i)).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /^(Pubblica|Tieni nascosta)$/ })).toHaveCount(0);
        await expect(main(page).getByRole("radio", { name: /^(Pubblicate|Nascoste)/ })).toHaveCount(0);
        await expect(main(page).getByText(/^(Pubblicata|Nascosta)$/)).toHaveCount(0);
    });

    test("il voto conta tutti i voti", async ({ page }) => {
        await openPage(page);
        // (5 + 2 + 4 + 5 + 1 + 2 + 5 + 1) / 8 = 3,125 → 3,1
        const vote = main(page).getByRole("region", { name: "Il voto" });
        await expect(vote.getByText(/^3,1$/)).toBeVisible();
        await expect(vote.getByText("8 recensioni", { exact: true })).toBeVisible();
    });

    test("stelle, quando e segno sopra; il commento sotto, largo come un testo", async ({ page }) => {
        await openPage(page);
        const row = rowOf(page, "Cameriere scortese e2e");
        const [rowBox, ratingBox, commentBox] = await Promise.all([
            row.boundingBox(),
            row.getByRole("img").first().boundingBox(),
            row.getByText(/^Cameriere scortese e2e/).boundingBox()
        ]);
        expect(ratingBox!.y + ratingBox!.height).toBeLessThanOrEqual(commentBox!.y);
        // 70 caratteri, non tutta la riga.
        expect(commentBox!.width).toBeLessThan(rowBox!.width - 100);
        await expect(row.getByText("Solo a voi", { exact: true })).toBeVisible();
    });

    test("le righe ex in attesa e nascoste sono nell'elenco", async ({ page }) => {
        await openPage(page);
        await expect(rowOf(page, "Cameriere scortese e2e")).toHaveCount(1);
        await expect(rowOf(page, "Prova spam e2e")).toHaveCount(1);
    });

    test("Elimina su ogni riga, con conferma", async ({ page }) => {
        stub.onWrite("reviews.DELETE", () => [{ id: REVIEW.pizza }]);
        await openPage(page);
        await press(rowOf(page, "Pizza ottima e2e, torneremo.").getByRole("button", { name: /^Azioni/ }));
        await expect(page.getByRole("menuitem")).toHaveText(["Elimina"]);
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        expect(stub.writes.filter(w => w.key === "reviews.DELETE")).toHaveLength(0);
        await page.getByRole("button", { name: "Elimina", exact: true }).last().click();
        await expect(page.getByText("Recensione eliminata")).toBeVisible();
        await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toHaveCount(0);
        expect(stub.writes.find(w => w.key === "reviews.DELETE")?.params.get("id")).toBe(`eq.${REVIEW.pizza}`);
    });

    test("senza reviews.delete: nessun menu di riga", async ({ page }) => {
        await stub.revoke("reviews.delete");
        await openPage(page);
        await stub.revoked;
        await expect(main(page).getByRole("button", { name: /^Azioni/ })).toHaveCount(0);
    });

    test("la voce di sidebar non ha badge", async ({ page }) => {
        await openPage(page);
        const link = await sidebarLink(page, /^Recensioni/);
        await expect(link).toHaveText(/^Recensioni$/);
    });

    test("a 375 il commento lungo prende tutta la riga, stelle e data sopra, nessuno scroll orizzontale", async ({ page }) => {
        await openPage(page);
        await page.setViewportSize({ width: 375, height: 800 });
        const row = rowOf(page, "Cameriere scortese e2e");
        const comment = row.getByText(/^Cameriere scortese e2e/);
        await expect(comment).toBeVisible();
        await noSideScroll(page);
        const [rowBox, commentBox, ratingBox] = await Promise.all([
            row.boundingBox(),
            comment.boundingBox(),
            row.getByRole("img").first().boundingBox()
        ]);
        if (!rowBox || !commentBox || !ratingBox) throw new Error("riga non misurabile");
        // Tutta la larghezza meno i rientri della riga.
        expect(commentBox.width).toBeGreaterThanOrEqual(rowBox.width - 2 * 24 - 48);
        expect(ratingBox.y + ratingBox.height).toBeLessThanOrEqual(commentBox.y);
    });
});

/**
 * Il confronto fra sedi (D159): dentro Centro, con Porto in «Confronta con»,
 * una riga del voto per sede; l'elenco resta di Centro. Lo stato del
 * confronto è quello di `sediVistaStore` (la barra in alto lo scrive lì).
 */
test.describe("Recensioni — confronto fra sedi", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubRecensioni(page);
        await page.addInitScript(
            ([tenantId, centro, porto]) =>
                window.sessionStorage.setItem(
                    "cataloglobe:sediVista",
                    JSON.stringify({ tenantId, sede: { kind: "sede", id: centro }, confronta: [porto] })
                ),
            [TENANT_ID, SEDE.centro, SEDE.porto]
        );
    });

    test("una riga del voto per sede, l'elenco della sede sola", async ({ page }) => {
        await openBusinessPage(page, "overview", "Panoramica");
        await page.goto(page.url().replace(/\/overview$/, `/locations/${SEDE.centro}/recensioni`));
        await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toBeVisible({ timeout: 15_000 });
        await choosePeriod(page, "Sempre");

        const group = main(page).getByRole("group", { name: "Il voto delle sedi a confronto" });
        const centro = group.getByRole("region", { name: "Il voto · Centro e2e" });
        const porto = group.getByRole("region", { name: "Il voto · Porto e2e" });
        // Centro: 5, 4, 1 → 3,3; Porto: 2, 5 → 3,5.
        await expect(centro.getByText(/^3,3$/)).toBeVisible();
        await expect(centro.getByText("3 recensioni", { exact: true })).toBeVisible();
        await expect(porto.getByText(/^3,5$/)).toBeVisible();
        await expect(porto.getByText("2 recensioni", { exact: true })).toBeVisible();

        // Si filtra dalla riga della sede, non da quelle delle altre.
        await expect(centro.getByRole("button", { name: /^5 stelle/ })).toBeVisible();
        await expect(porto.getByRole("button")).toHaveCount(0);

        // L'elenco è di Centro: niente recensioni di Porto.
        await expect(main(page).getByText("Freddo e2e")).toBeVisible();
        await expect(main(page).getByText(/^Servizio lento e2e/)).toHaveCount(0);
        await expect(main(page).getByText("Tiramisù da provare e2e")).toHaveCount(0);
        await noSideScroll(page);
    });
});
