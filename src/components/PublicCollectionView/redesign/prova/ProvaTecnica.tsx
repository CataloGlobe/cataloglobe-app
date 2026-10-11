import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { HubTab } from "@/types/collectionStyle";
import CollectionSectionNav from "../../CollectionSectionNav/CollectionSectionNav";
import type { CollectionViewSection } from "../../CollectionView/CollectionView";
import type { OpeningHoursEntry } from "../../PublicOpeningHours/PublicOpeningHours";
import { useBottomBarAutoHide } from "../../hooks/useBottomBarAutoHide";
import BottomBar from "../bar/BottomBar";
import Island from "../island/Island";
import SheetHost from "../sheets/SheetHost";
import { openSheet, pushSheetPage, type SheetPage } from "../sheets/sheetStack";
import styles from "./ProvaTecnica.module.scss";

/**
 * Banco di prova del redesign (solo staging, `?prova-tecnica=1` su una sede con il
 * flag acceso). Monta i componenti veri (isola, barra, fogli, barra delle categorie,
 * ricerca) su una pagina finta, con un contatore di fotogrammi lenti e interruttori
 * per gli effetti costosi: si parte dal più fedele al mockup e si spegne un effetto
 * alla volta finché sul telefono è fluido. Non è prodotto: si toglie quando la prova
 * è chiusa.
 */

const importSearchOverlay = () => import("../../SearchOverlay/SearchOverlay");
const SearchOverlay = lazy(importSearchOverlay);

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

const RIGHE_ORARI = ["Lunedì 12–15 · 19–23", "Martedì 12–15 · 19–23", "Mercoledì chiuso", "Giovedì 12–15 · 19–23", "Venerdì 12–15 · 19–24", "Sabato 12–24", "Domenica 12–22"];

const CATEGORIE = ["Antipasti", "Primi", "Secondi", "Contorni", "Pizze", "Dolci", "Vini", "Bevande"];
const SEZIONI: CollectionViewSection[] = CATEGORIE.map((nome, c) => ({
    id: `cat-${c}`,
    name: nome,
    level: 1,
    parentCategoryId: null,
    items: Array.from({ length: 6 }, (_, i) => ({
        id: `p-${c}-${i}`,
        name: `${nome} ${i + 1}`,
        description: "Piatto di prova, con una descrizione abbastanza lunga da andare a capo.",
        price: 8 + i,
        parentSelected: false
    }))
}));

type StatoLocale = "aperto" | "chiude" | "chiuso";

/** Ora di Roma: giorno della settimana (lunedì = 0) e minuti dalla mezzanotte. */
function oraDiRoma(): { dow: number; minuti: number } {
    const parti = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
            .formatToParts(new Date())
            .map(p => [p.type, p.value])
    );
    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parti.weekday);
    return { dow, minuti: (Number(parti.hour) % 24) * 60 + Number(parti.minute) };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Orari finti che fanno dire all'isola lo stato scelto: aperto, chiude tra 25 min, chiuso (apre domani). */
function orariPer(stato: StatoLocale): OpeningHoursEntry[] {
    const { dow, minuti } = oraDiRoma();
    return Array.from({ length: 7 }, (_, d) => {
        const base = { day_of_week: d, slot_index: 0, is_closed: false };
        if (stato === "aperto") return { ...base, opens_at: "00:00", closes_at: "23:59" };
        if (d !== dow) return { ...base, opens_at: "12:00", closes_at: "23:00" };
        if (stato === "chiude") return { ...base, opens_at: "00:00", closes_at: hhmm(Math.min(minuti + 25, 1439)) };
        return { ...base, opens_at: null, closes_at: null, is_closed: true };
    });
}

type Effetti = { isolaBlur: boolean; barraBlur: boolean; ombre: boolean; stratoBarra: boolean; stratoIsola: boolean };
/** Com'è il prodotto oggi: barra e isola senza blur, ombre, barra su uno strato suo. */
const EFFETTI_INIZIALI: Effetti = { isolaBlur: false, barraBlur: false, ombre: true, stratoBarra: true, stratoIsola: false };
const NOMI_EFFETTI: Record<keyof Effetti, string> = {
    isolaBlur: "blur isola",
    barraBlur: "blur barra",
    ombre: "ombre",
    stratoBarra: "strato barra",
    stratoIsola: "strato isola"
};

/** Fotogrammi: media al secondo, quanti oltre 25 ms negli ultimi 10 s, il peggiore. */
function useFotogrammi() {
    // Scritto nel DOM, non nello stato: un render del banco ogni 500 ms
    // sporcherebbe proprio i tempi che misura.
    const testoRef = useRef<HTMLElement>(null);
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
                const lenti = finestra.filter(f => f.dt > 25).length;
                const peggiore = Math.round(Math.max(0, ...finestra.map(f => f.dt)));
                if (testoRef.current) {
                    testoRef.current.textContent = `${ultimoSecondo.length} fps · lenti ${lenti} · peggiore ${peggiore} ms`;
                }
            }
            raf = requestAnimationFrame(giro);
        };
        raf = requestAnimationFrame(giro);
        return () => cancelAnimationFrame(raf);
    }, []);
    return { testoRef, azzera: () => (reset.current = performance.now()) };
}

/** Categoria in vista: la prima sezione che attraversa la riga sotto isola e categorie. */
function useSezioneAttiva(attivo: boolean) {
    const [id, setId] = useState<string | null>(SEZIONI[0].id);
    useEffect(() => {
        if (!attivo) return;
        const io = new IntersectionObserver(
            voci => {
                const visibile = voci.filter(v => v.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
                if (visibile) setId(visibile.target.id);
            },
            { rootMargin: "-130px 0px -60% 0px" }
        );
        SEZIONI.forEach(s => {
            const el = document.getElementById(s.id);
            if (el) io.observe(el);
        });
        return () => io.disconnect();
    }, [attivo]);
    return [id, setId] as const;
}

function PaginaProva({ page }: { page: SheetPage }) {
    if (page.key === "info") {
        return (
            <div className={styles.corto}>
                <p>Foglio corto: l'isola resta visibile sotto. «Orari ›» spinge una pagina alta.</p>
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
    const [stato, setStato] = useState<StatoLocale>("aperto");
    const [ricerca, setRicerca] = useState(false);
    const { hidden, ignoreProgrammaticScroll } = useBottomBarAutoHide({ mounted: true, preview: false, frozen: ricerca });
    const fps = useFotogrammi();
    const [sezione, setSezione] = useSezioneAttiva(tab === "menu");
    const orari = useMemo(() => orariPer(stato), [stato]);

    const imposta = (chiave: keyof Effetti) => setEffetti(e => ({ ...e, [chiave]: !e[chiave] }));

    // Cambio tab: in cima senza far sparire la barra, come la pagina vera.
    const cambiaTab = (nuova: HubTab) => {
        if (nuova === tab) return;
        ignoreProgrammaticScroll();
        setTab(nuova);
        window.scrollTo(0, 0);
    };

    // Tocco su una categoria: scroll con lo spazio di isola compatta e barra delle categorie.
    const vaiA = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return;
        setSezione(id);
        ignoreProgrammaticScroll();
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 124, behavior: "smooth" });
    };

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
            data-barra-blur={effetti.barraBlur || undefined}
            data-senza-ombre={!effetti.ombre || undefined}
            data-senza-strato-barra={!effetti.stratoBarra || undefined}
            data-strato-isola={effetti.stratoIsola || undefined}
        >
            <Island
                // Lo stato del locale si ricalcola al minuto: cambiando gli orari si rimonta.
                key={stato}
                logoUrl={LOGO}
                coverImageUrl={COVER}
                activityName="Locale di prova"
                menuName="Menu del giorno"
                onSearchOpen={() => setRicerca(true)}
                onSearchPointerDown={() => void importSearchOverlay()}
                allergensCount={0}
                onOpenMore={() => openSheet({ key: "info", title: "Informazioni", size: "medium" })}
                activeTab={tab}
                onTabChange={cambiaTab}
                showStoryTab
                openingHours={orari}
                upcomingClosures={[]}
                onOpenHours={() => openSheet({ key: "info", title: "Informazioni", size: "medium" })}
            />

            <div ref={fondo} className={styles.contenuto}>
                {tab === "menu" ? (
                    <>
                        <CollectionSectionNav
                            sections={SEZIONI.map(s => ({ id: s.id, name: s.name }))}
                            activeSectionId={sezione}
                            onSelect={vaiA}
                            variant="public"
                            style={{ navStyle: "filled" }}
                        />
                        <div className={styles.azioni}>
                            <button type="button" className={styles.btn} onClick={() => openSheet({ key: "info", title: "Informazioni", size: "medium" })}>
                                Foglio con spinta
                            </button>
                            <button type="button" className={styles.btn} onClick={() => openSheet({ key: "lungo", title: "Foglio lungo", size: "large" })}>
                                Foglio lungo
                            </button>
                            <button ref={stella} type="button" className={styles.btn} onClick={vola}>
                                ★ Volo del voto
                            </button>
                        </div>
                        <p className={styles.esito}>{volo || "Tocca ★ per far partire il volo"}</p>
                        {SEZIONI.map((s, c) => (
                            <section key={s.id} id={s.id} className={styles.sezione}>
                                <h2>{s.name}</h2>
                                {s.items.map((p, i) => (
                                    <div key={p.id} className={styles.scheda} data-pari={(c + i) % 2 === 0 || undefined}>
                                        <strong>{p.name}</strong> · sotto l'isola e la barra c'è sempre qualcosa di colorato.
                                    </div>
                                ))}
                            </section>
                        ))}
                    </>
                ) : (
                    <article className={styles.storia}>
                        <h2>La nostra storia</h2>
                        {Array.from({ length: 14 }, (_, i) => (
                            <p key={i}>
                                Paragrafo {i + 1}. Una pagina lunga di solo testo, per provare il cambio tab: si torna in cima e la barra resta in
                                vista.
                            </p>
                        ))}
                    </article>
                )}
            </div>

            <BottomBar
                activeTab={tab}
                onTabChange={cambiaTab}
                showStoryTab
                orderVisible
                selectionCount={conto}
                onOpenOrder={() => openSheet({ key: "lungo", title: "Ordine", size: "large" })}
                hidden={hidden}
            />

            <aside className={styles.pannello} aria-label="Strumenti di prova">
                <div className={styles.numeri}>
                    <strong ref={fps.testoRef}>0 fps</strong>
                    <button type="button" className={styles.mini} onClick={fps.azzera}>
                        azzera
                    </button>
                </div>
                {(Object.keys(NOMI_EFFETTI) as (keyof Effetti)[]).map(k => (
                    <label key={k}>
                        <input type="checkbox" checked={effetti[k]} onChange={() => imposta(k)} /> {NOMI_EFFETTI[k]}
                    </label>
                ))}
                <div className={styles.stati} role="group" aria-label="Stato del locale">
                    {(["aperto", "chiude", "chiuso"] as StatoLocale[]).map(s => (
                        <button key={s} type="button" className={styles.mini} aria-pressed={stato === s} onClick={() => setStato(s)}>
                            {s}
                        </button>
                    ))}
                </div>
            </aside>

            {/* Ricerca vera, con il campo fantasma dell'isola che fa salire la tastiera iOS nel gesto. */}
            <Suspense fallback={null}>
                <AnimatePresence>
                    {ricerca && (
                        <SearchOverlay
                            key="search"
                            isOpen={ricerca}
                            onClose={() => setRicerca(false)}
                            sections={SEZIONI}
                            mode="public"
                            visibleProductCount={48}
                            totalProductCount={48}
                        />
                    )}
                </AnimatePresence>
            </Suspense>

            <SheetHost backgroundRef={fondo} renderPage={page => <PaginaProva page={page} />} />
        </main>
    );
}
