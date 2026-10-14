// «Avanti» porta a ciò che manca: invece di restare spento, segna l'elemento da
// sistemare (bordo rosso, una scossa, il messaggio sotto), lo porta al centro e
// ci mette il fuoco. I passi dicono dove sono i loro pezzi con `data-bad`.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { CHOOSE, type StepId, type Tunnel } from "./creaModel";
import s from "./Crea.module.scss";

export type Bad = { why: string; n: number };

/** L'elemento da segnare per un blocco: se non c'è, si segna il modulo intero. */
export function badSel(step: StepId, why: string, t: Pick<Tunnel, "impOpen">): string {
    const at = (k: string) => `[data-bad="${k}"]`;
    switch (step) {
        case "modifica":
            return at("whats");
        case "parti":
        case "nome":
            return /nome/.test(why) ? at("name") : at("copy");
        case "sezioni":
            return t.impOpen ? at("imp") : at("secs");
        case "contenuto":
        case "piatti":
            if (/link/.test(why)) return at("link");
            if (/testo del bottone/.test(why)) return at("cta");
            if (/titolo/.test(why)) return at("title");
            return /piatto/.test(why) ? at("dishes") : at("price");
        case "tema":
            return /prodotto/.test(why) ? at("prodlist") : /sede/.test(why) ? at("sedelist") : at("about");
        case "onda":
            return at("ask");
        case "racconto":
            return at("title");
        case "quando":
        case "dove":
            if (why === CHOOSE) return at("ask");
            if (why.startsWith("Scegli: ")) return at("insieme");
            if (why.startsWith("Conferma le sedi")) return at("inhd");
            if (why.startsWith("Conferma gli orari")) return at("inhq");
            return /sed[ei]/.test(why) ? `[data-sbox],${at("sedi")}` : at("ore");
        default:
            return "";
    }
}

const FIELDS = "input,select,textarea,button";
// l'icona «circle-alert» di lucide: il messaggio sta fuori dall'albero di React
const ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';

/** Segna nel modulo l'elemento che manca; il messaggio è un `<p role="alert">` subito dopo. */
export function useBad(root: RefObject<HTMLElement | null>, bad: Bad | null, sel: string): void {
    const at = useRef<{ el: HTMLElement; p: HTMLElement | null; why: string } | null>(null);
    const shaken = useRef(0);

    // a ogni disegno: React può aver rifatto l'elemento, o tolto la classe
    useLayoutEffect(() => {
        const form = root.current;
        const el = bad && form ? ((sel && form.querySelector<HTMLElement>(sel)) || form) : null;
        const cur = at.current;
        if (cur && (cur.el !== el || cur.why !== bad?.why || (cur.p && !cur.p.isConnected))) {
            cur.el.classList.remove(s.bad, s.shake);
            cur.p?.remove();
            at.current = null;
        }
        if (!el || !bad) return;
        if (!at.current) {
            // il passo lo dice già da sé (le ore del Calendario): niente doppione
            const said = (el.textContent ?? "").includes(bad.why);
            let p: HTMLElement | null = null;
            if (!said) {
                p = document.createElement("p");
                p.className = s.badmsg;
                p.setAttribute("role", "alert");
                p.innerHTML = ICON;
                p.append(bad.why);
                el.after(p);
            }
            at.current = { el, p, why: bad.why };
        }
        el.classList.add(s.bad);
        if (shaken.current === bad.n) return;
        shaken.current = bad.n;
        el.classList.remove(s.shake);
        void el.offsetWidth;
        el.classList.add(s.shake);
        el.scrollIntoView?.({ block: "center", behavior: "smooth" });
        (el.matches(FIELDS) ? el : el.querySelector<HTMLElement>(FIELDS))?.focus({ preventScroll: true });
    });
    useEffect(
        () => () => {
            at.current?.el.classList.remove(s.bad, s.shake);
            at.current?.p?.remove();
        },
        []
    );
}
