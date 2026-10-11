import { useEffect, useRef, useState } from "react";
import type { HubTab } from "@/types/collectionStyle";
import { useBottomBarAutoHide } from "../../hooks/useBottomBarAutoHide";
import BottomBar from "../bar/BottomBar";
import Island from "../island/Island";
import SheetHost from "../sheets/SheetHost";
import { openSheet, pushSheetPage, type SheetPage } from "../sheets/sheetStack";
import styles from "./ProvaTecnica.module.scss";

/**
 * Banco di prova del redesign (solo staging, `?prova-tecnica=1` su una sede con il
 * flag acceso). Monta i componenti veri (isola, barra, fogli) su una pagina finta,
 * con un contatore di fotogrammi lenti e interruttori per gli effetti costosi:
 * si parte dal più fedele al mockup e si spegne un effetto alla volta finché sul
 * telefono è fluido. Non è prodotto: si toglie quando la prova è chiusa.
 */

const COVER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9826b"/><stop offset="1" stop-color="#3b6fa8"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/></svg>'
    );
const LOGO =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="#f2c14e"/><circle cx="44" cy="44" r="22" fill="#1b1b1b"/></svg>'
    );

const ORARI = Array.from({ length: 7 }, () => []);
const RIGHE_ORARI = ["Lunedì 12–15 · 19–23", "Martedì 12–15 · 19–23", "Mercoledì chiuso", "Giovedì 12–15 · 19–23", "Venerdì 12–15 · 19–24", "Sabato 12–24", "Domenica 12–22"];

type Effetti = { isolaBlur: boolean; barraPiena: boolean; ombre: boolean };
const EFFETTI_INIZIALI: Effetti = { isolaBlur: false, barraPiena: false, ombre: true };

/** Fotogrammi: media al secondo, quanti oltre 25 ms negli ultimi 10 s, il peggiore. */
function useFotogrammi() {
    const [dati, setDati] = useState({ fps: 0, lenti: 0, peggiore: 0 });
    const reset = useRef(0);
    useEffect(() => {
        let raf = 0;
        let ultimo = performance.now();
        let finestra: { t: number; dt: number }[] = [];
        let prossimo = ultimo + 500;
        const giro = (ts: number) => {
            const dt = ts - ultimo;
            ultimo = ts;
            finestra.push({ t: ts, dt });
            finestra = finestra.filter(f => ts - f.t < 10_000 && f.t >= reset.current);
            if (ts >= prossimo) {
                prossimo = ts + 500;
                const ultimoSecondo = finestra.filter(f => ts - f.t < 1000);
                setDati({
                    fps: Math.round(ultimoSecondo.length),
                    lenti: finestra.filter(f => f.dt > 25).length,
                    peggiore: Math.round(Math.max(0, ...finestra.map(f => f.dt)))
                });
            }
            raf = requestAnimationFrame(giro);
        };
        raf = requestAnimationFrame(giro);
        return () => cancelAnimationFrame(raf);
    }, []);
    return { ...dati, azzera: () => (reset.current = performance.now()) };
}

function PaginaProva({ page }: { page: SheetPage }) {
    if (page.key === "info") {
        return (
            <div className={styles.corto}>
                <p>Foglio corto: l'isola resta visibile sotto.</p>
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
    return (
        <ul className={styles.lista}>
            {Array.from({ length: 60 }, (_, i) => (
                <li key={i}>Riga {i + 1}</li>
            ))}
        </ul>
    );
}

export default function ProvaTecnica() {
    const fondo = useRef<HTMLDivElement>(null);
    const stella = useRef<HTMLButtonElement>(null);
    const [tab, setTab] = useState<HubTab>("menu");
    const [conto, setConto] = useState(0);
    const [volo, setVolo] = useState("");
    const [effetti, setEffetti] = useState<Effetti>(EFFETTI_INIZIALI);
    const { hidden } = useBottomBarAutoHide({ mounted: true, preview: false, frozen: false });
    const fps = useFotogrammi();

    const imposta = (chiave: keyof Effetti) => setEffetti(e => ({ ...e, [chiave]: !e[chiave] }));

    // Volo del voto: FLIP a mano con WAAPI su transform e opacity, verso il cerchio dell'ordine.
    const vola = () => {
        const da = stella.current;
        const a = document.querySelector<HTMLElement>('[class*="ordine"]');
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
            setConto(c => c + 1);
            setVolo(`volo finito in ${Math.round(performance.now() - t0)} ms`);
        });
    };

    return (
        <main
            className={styles.banco}
            data-isola-blur={effetti.isolaBlur || undefined}
            data-barra-piena={effetti.barraPiena || undefined}
            data-senza-ombre={!effetti.ombre || undefined}
        >
            <Island
                logoUrl={LOGO}
                coverImageUrl={COVER}
                activityName="Locale di prova"
                menuName="Menu del giorno"
                onSearchOpen={() => openSheet({ key: "lungo", title: "Ricerca", size: "large" })}
                onSearchPointerDown={() => undefined}
                allergensCount={0}
                onOpenMore={() => openSheet({ key: "info", title: "Informazioni", size: "medium" })}
                activeTab={tab}
                onTabChange={setTab}
                showStoryTab
                openingHours={ORARI.map((_, d) => ({ day_of_week: d, slot_index: 0, opens_at: "00:00", closes_at: "23:59", is_closed: false }))}
                upcomingClosures={[]}
                onOpenHours={() => openSheet({ key: "info", title: "Informazioni", size: "medium" })}
            />

            <div ref={fondo} className={styles.contenuto}>
                <div className={styles.azioni}>
                    <button type="button" className={styles.btn} onClick={() => openSheet({ key: "info", title: "Informazioni", size: "medium" })}>
                        Foglio corto
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
                    <div key={i} className={styles.scheda} data-pari={i % 2 === 0 || undefined}>
                        Scheda {i + 1}: sotto l'isola e la barra c'è sempre qualcosa di colorato, così si vede il vetro.
                    </div>
                ))}
            </div>

            <BottomBar
                activeTab={tab}
                onTabChange={setTab}
                showStoryTab
                orderVisible
                selectionCount={conto}
                onOpenOrder={() => openSheet({ key: "lungo", title: "Ordine", size: "large" })}
                hidden={hidden}
            />

            <aside className={styles.pannello} aria-label="Strumenti di prova">
                <div className={styles.numeri}>
                    <strong>{fps.fps} fps</strong> · lenti {fps.lenti} · peggiore {fps.peggiore} ms
                    <button type="button" className={styles.mini} onClick={fps.azzera}>
                        azzera
                    </button>
                </div>
                <label>
                    <input type="checkbox" checked={effetti.isolaBlur} onChange={() => imposta("isolaBlur")} /> blur isola
                </label>
                <label>
                    <input type="checkbox" checked={effetti.barraPiena} onChange={() => imposta("barraPiena")} /> barra sempre piena
                </label>
                <label>
                    <input type="checkbox" checked={effetti.ombre} onChange={() => imposta("ombre")} /> ombre
                </label>
            </aside>

            <SheetHost backgroundRef={fondo} renderPage={page => <PaginaProva page={page} />} />
        </main>
    );
}
