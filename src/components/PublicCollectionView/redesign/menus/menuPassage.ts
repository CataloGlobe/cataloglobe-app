/**
 * Il passaggio tra «Scegli il menu» e il menu (mockup v38 `mpkGo`/`mpkBack`): il menu
 * entra da destra mentre la scelta scivola a sinistra e si scurisce; «Tutti i menu»
 * fa il contrario. Con le View Transitions del browser: si animano due fotografie,
 * non la pagina viva (una trasformazione sulla pagina sposterebbe barra e isola
 * fisse). Il CSS sta in `MenuChooser.module.scss` e legge `data-menu-passage`.
 * Senza View Transitions il cambio è secco; col movimento ridotto è una dissolvenza.
 */
export type PassageDirection = "go" | "back";

let running = false;

export function reducedMotion(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `update` cambia lo stato (l'indirizzo); `ready` si risolve quando React ha
 * disegnato lo stato nuovo: solo allora il browser fotografa l'arrivo.
 */
export function runMenuPassage(direction: PassageDirection, update: () => void, ready: () => Promise<void>): void {
    if (typeof document.startViewTransition !== "function" || running) {
        update();
        return;
    }
    running = true;
    const root = document.documentElement;
    root.dataset.menuPassage = direction;
    const transition = document.startViewTransition(() => {
        const drawn = ready();
        update();
        return drawn;
    });
    // Passaggio saltato (scheda nascosta): `ready` rifiuta, il cambio è già avvenuto.
    transition.ready.catch(() => undefined);
    void transition.finished
        .finally(() => {
            running = false;
            delete root.dataset.menuPassage;
        })
        .catch(() => undefined);
}
