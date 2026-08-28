import { useEffect, useRef } from "react";

/**
 * Richiama `onRefresh` a intervalli regolari finché il componente è montato, e
 * subito quando la finestra torna in primo piano.
 *
 * Nato per i thread di supporto, dove una conversazione aperta deve mostrare
 * le risposte arrivate nel frattempo. Volutamente NON usa Supabase Realtime:
 * servirebbe aggiungere la tabella alla publication con una migration, e a
 * questi volumi un poll ogni 15s costa meno di quanto costi mantenere quel
 * canale.
 *
 * ── Il ritorno in focus non è un extra ──────────────────────────────────────
 * È il caso più frequente: si lascia la scheda aperta, si va a fare altro, si
 * torna. Senza, si guarderebbe una conversazione vecchia fino allo scadere
 * dell'intervallo. `visibilitychange` copre il cambio di scheda, `focus` il
 * ritorno da un'altra finestra o applicazione — a volte solo uno dei due
 * scatta, quindi ci sono entrambi.
 */
interface PollingRefreshOptions {
    /** Millisecondi fra un poll e il successivo. */
    intervalMs?: number;
    /**
     * Quando `false` il poll è sospeso: né l'intervallo né il ritorno in focus
     * chiamano `onRefresh`. Serve a non ricaricare mentre un invio è in corso,
     * che sovrascriverebbe lo stato a metà operazione.
     */
    enabled?: boolean;
}

export function usePollingRefresh(
    onRefresh: () => void,
    { intervalMs = 15_000, enabled = true }: PollingRefreshOptions = {}
): void {
    // La callback vive in un ref: il chiamante la ricrea a ogni render (chiude
    // su stato che cambia), e senza questo l'intervallo verrebbe distrutto e
    // ricreato di continuo, non scadendo mai. Con il ref l'effetto dipende
    // solo da `intervalMs` e `enabled`.
    const savedCallback = useRef(onRefresh);
    useEffect(() => {
        savedCallback.current = onRefresh;
    }, [onRefresh]);

    // Letto dentro i listener senza farli riagganciare a ogni cambio di stato.
    const enabledRef = useRef(enabled);
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;

        const tick = () => {
            // Ricontrollato al momento dello scatto e non solo alla
            // registrazione: fra i due possono essere passati 15 secondi in cui
            // è partito un invio.
            if (!enabledRef.current) return;
            // Una scheda in background non ha nessuno che guarda: saltare il
            // giro evita richieste inutili e il risveglio di timer sospesi dal
            // browser.
            if (document.visibilityState === "hidden") return;
            savedCallback.current();
        };

        const id = window.setInterval(tick, intervalMs);

        const onVisible = () => {
            if (document.visibilityState === "visible") tick();
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", tick);

        return () => {
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", tick);
        };
    }, [intervalMs, enabled]);
}
