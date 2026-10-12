import { useEffect, useRef, useState } from "react";
import SheetHost from "../sheets/SheetHost";
import { openSheet, pushSheetPage, type SheetPage } from "../sheets/sheetStack";
import styles from "./ProvaTecnica.module.scss";

/**
 * Pagina di prova della PR 1 (solo staging, `?prova-tecnica=1` su una sede con il
 * flag acceso). Serve a guardare su un telefono vero tre cose prima di costruire
 * il resto: isola a soglia, spinta nei fogli, volo del voto. Non è prodotto: si
 * toglie quando la prova è chiusa.
 */

const SOGLIA_ALTA = 40;
const SOGLIA_BASSA = 8;

function useIsolaCompatta(): { compatta: boolean; alta: React.RefObject<HTMLDivElement | null>; bassa: React.RefObject<HTMLDivElement | null> } {
    // Due sentinelle (40 px e 8 px) per l'isteresi: nessun lavoro a ogni scroll,
    // un solo render per passaggio.
    const alta = useRef<HTMLDivElement>(null);
    const bassa = useRef<HTMLDivElement>(null);
    const [compatta, setCompatta] = useState(false);
    useEffect(() => {
        const a = alta.current;
        const b = bassa.current;
        if (!a || !b) return;
        const oa = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) setCompatta(true);
        });
        const ob = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) setCompatta(false);
        });
        oa.observe(a);
        ob.observe(b);
        return () => {
            oa.disconnect();
            ob.disconnect();
        };
    }, []);
    return { compatta, alta, bassa };
}

const RIGHE_ORARI = ["Lunedì 12–15 · 19–23", "Martedì 12–15 · 19–23", "Mercoledì chiuso", "Giovedì 12–15 · 19–23", "Venerdì 12–15 · 19–24", "Sabato 12–24", "Domenica 12–22"];

function PaginaProva({ page }: { page: SheetPage }) {
    if (page.key === "info") {
        return (
            <div className={styles.corto}>
                <p>Foglio corto (circa 150 px): l'isola resta visibile sotto.</p>
                <button type="button" className={styles.btn} onClick={() => pushSheetPage({ key: "orari", title: "Orari", size: "large" })}>
                    Orari ›
                </button>
            </div>
        );
    }
    if (page.key === "orari") {
        return (
            <ul className={styles.lista}>
                {RIGHE_ORARI.map(r => (
                    <li key={r}>{r}</li>
                ))}
            </ul>
        );
    }
    // «lungo»: abbastanza righe da dover scorrere dentro il foglio
    return (
        <ul className={styles.lista}>
            {Array.from({ length: 60 }, (_, i) => (
                <li key={i}>Riga {i + 1}</li>
            ))}
        </ul>
    );
}

export default function ProvaTecnica() {
    const { compatta, alta, bassa } = useIsolaCompatta();
    const fondo = useRef<HTMLDivElement>(null);
    const stella = useRef<HTMLButtonElement>(null);
    const barra = useRef<HTMLDivElement>(null);
    const [volo, setVolo] = useState<string>("");
    const [conteggio, setConteggio] = useState(0);

    // Volo del voto: FLIP a mano con WAAPI su transform e opacity, niente layout.
    const vola = () => {
        const da = stella.current;
        const a = barra.current;
        if (!da || !a || !da.animate) return;
        const r1 = da.getBoundingClientRect();
        const r2 = a.getBoundingClientRect();
        const clone = da.cloneNode(true) as HTMLElement;
        clone.removeAttribute("id");
        clone.className = styles.volante;
        clone.style.left = `${r1.left}px`;
        clone.style.top = `${r1.top}px`;
        document.body.appendChild(clone);
        const t0 = performance.now();
        const anim = clone.animate(
            [
                { transform: "translate(0,0) scale(1)", opacity: 1 },
                { transform: `translate(${r2.left - r1.left}px, ${r2.top - r1.top}px) scale(0.6)`, opacity: 0.2 }
            ],
            { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
        anim.finished.finally(() => {
            clone.remove();
            setConteggio(c => c + 1);
            setVolo(`volo finito in ${Math.round(performance.now() - t0)} ms`);
        });
    };

    return (
        <div className={styles.pagina}>
            <div ref={alta} className={styles.sentinellaAlta} style={{ top: SOGLIA_ALTA }} aria-hidden />
            <div ref={bassa} className={styles.sentinellaBassa} style={{ top: SOGLIA_BASSA }} aria-hidden />
            <div className={styles.isola} data-compact={compatta} role="banner">
                <strong>Locale di prova</strong>
                <span className={styles.stato}>{compatta ? "compatta" : "estesa"}</span>
            </div>
            <div ref={fondo} className={styles.contenuto}>
                <h1>Prova tecnica del redesign</h1>
                <p>Solo staging. Scorri: l'isola passa da estesa a compatta a 40 px e torna a 8 px.</p>
                <div className={styles.azioni}>
                    <button type="button" className={styles.btn} onClick={() => openSheet({ key: "info", title: "Informazioni", size: "medium" })}>
                        Foglio corto + spinta
                    </button>
                    <button type="button" className={styles.btn} onClick={() => openSheet({ key: "lungo", title: "Foglio lungo", size: "large" })}>
                        Foglio lungo
                    </button>
                    <button ref={stella} type="button" className={styles.btn} onClick={vola}>
                        ★ Volo del voto
                    </button>
                </div>
                <p className={styles.esito}>{volo || "Tocca ★ per far partire il volo"}</p>
                {Array.from({ length: 40 }, (_, i) => (
                    <p key={i} className={styles.riempitivo}>
                        Paragrafo {i + 1} per avere pagina da scorrere.
                    </p>
                ))}
            </div>
            <div ref={barra} className={styles.barra}>
                Barra · voti {conteggio}
            </div>
            <SheetHost backgroundRef={fondo} renderPage={page => <PaginaProva page={page} />} />
        </div>
    );
}
