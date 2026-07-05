/**
 * LandingRedesign.mockup.tsx — MOCKUP di redesign landing (register BRAND).
 *
 * NON è l'implementazione: la landing viva (LandingPage.tsx) resta intatta.
 * Concept: "la giornata di un locale che scorre". Cliente primario = locale
 * singolo. L'eroe (~60% del peso) è la demo del prodotto che si dimostra da
 * solo: orologio, menu che cambia per fascia oraria, badge Programmata/Attiva/
 * Conclusa, QR reale. Unico movimento atmosferico: la luce che scorre con la
 * giornata (fredda al mattino → oro all'aperitivo → blu la sera).
 *
 * Gerarchia a tre cerchi: (1) motore = giornata che scorre, (2) leve del
 * motore, (3) gestisci & cresci (un pannello sobrio). Chiusura-promessa
 * multi-sede prima del prezzo.
 *
 * Dati reali riusati (read-only) da landingData.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
    ArrowRight,
    Plus,
    BarChart3,
    MessageSquareText,
    Users,
    QrCode,
} from "lucide-react";
import { PRICING_PLANS, FAQ_ITEMS, DEMOS } from "./landingData";
import s from "./LandingRedesign.mockup.module.scss";

/* ── Fasce del giorno (staged su "Il Molo 34", Portofino) ──────────── */
type DaypartKey = "mattino" | "pranzo" | "aperitivo" | "cena";

interface Daypart {
    key: DaypartKey;
    time: string;
    label: string;
    tabName: string;
    menu: { name: string; price: string }[];
}

const DAYPARTS: Daypart[] = [
    {
        key: "mattino",
        time: "08:00",
        label: "Colazioni",
        tabName: "Mattino",
        menu: [
            { name: "Cappuccino", price: "€1,60" },
            { name: "Cornetto integrale", price: "€1,40" },
            { name: "Spremuta d'arancia", price: "€3,50" },
            { name: "Focaccia e latte", price: "€2,80" },
        ],
    },
    {
        key: "pranzo",
        time: "13:00",
        label: "Pranzo",
        tabName: "Pranzo",
        menu: [
            { name: "Trofie al pesto", price: "€12" },
            { name: "Insalata di mare", price: "€16" },
            { name: "Acciughe di Monterosso", price: "€11" },
            { name: "Acqua Panna 0,75L", price: "€3" },
        ],
    },
    {
        key: "aperitivo",
        time: "18:30",
        label: "Aperitivo",
        tabName: "Aperitivo",
        menu: [
            { name: "Spritz del Molo", price: "€8" },
            { name: "Tagliere ligure", price: "€14" },
            { name: "Focaccia di Recco", price: "€7" },
            { name: "Olive taggiasche", price: "€5" },
        ],
    },
    {
        key: "cena",
        time: "21:00",
        label: "Cena",
        tabName: "Cena",
        menu: [
            { name: "Catalana di gamberi", price: "€24" },
            { name: "Branzino al sale", price: "€22" },
            { name: "Trofie al pesto", price: "€13" },
            { name: "Sciacchetrà", price: "€9" },
        ],
    },
];

const SCENE_CLASS: Record<DaypartKey, string> = {
    mattino: s.sceneMattino,
    pranzo: s.scenePranzo,
    aperitivo: s.sceneAperitivo,
    cena: s.sceneCena,
};

const AUTO_MS = 4200;
const HERO_DEMO = DEMOS[0]; // Il Molo 34
const HUB_URL =
    typeof window !== "undefined"
        ? `${window.location.origin}/${HERO_DEMO.slug}`
        : `https://cataloglobe.app/${HERO_DEMO.slug}`;

/* ── Ruolo del badge in base alla posizione nella giornata ─────────── */
function ruleFor(index: number, active: number): { label: string; cls: string } {
    if (index === active) return { label: "Attiva ora", cls: s.ruleActive };
    if (index < active) return { label: "Conclusa", cls: s.ruleDone };
    return { label: "Programmata", cls: s.ruleScheduled };
}

/* =================================================================== */

export default function LandingRedesign() {
    const reduce = useReducedMotion();
    const [active, setActive] = useState<number>(2); // default: aperitivo (oro, invitante)
    const [paused, setPaused] = useState(false);
    const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

    // Unico movimento atmosferico: la giornata avanza da sola.
    useEffect(() => {
        if (reduce || paused) return;
        const id = window.setInterval(() => {
            setActive((i) => (i + 1) % DAYPARTS.length);
        }, AUTO_MS);
        return () => window.clearInterval(id);
    }, [reduce, paused]);

    const dp = DAYPARTS[active];
    const rule = ruleFor(active, active); // active row is always "Attiva ora"

    const onTabKey = useCallback(
        (e: React.KeyboardEvent, i: number) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const next =
                    e.key === "ArrowRight"
                        ? (i + 1) % DAYPARTS.length
                        : (i - 1 + DAYPARTS.length) % DAYPARTS.length;
                setActive(next);
                tabsRef.current[next]?.focus();
            }
        },
        [],
    );

    return (
        <div className={s.page}>
            <div className={s.ribbon}>
                Mockup redesign — la landing viva resta intatta · route <code>/landing-redesign</code>
            </div>

            {/* ============ HERO — la giornata che scorre ============ */}
            <header
                className={s.hero}
                data-daypart={dp.key}
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
                onFocusCapture={() => setPaused(true)}
                onBlurCapture={() => setPaused(false)}
            >
                {/* Sfondo "giornata": cielo che vira (crossfade) + sole che arca +
                    orizzonte di Portofino costante con lucine serali */}
                <div className={s.scene} aria-hidden="true">
                    {DAYPARTS.map((d, i) => (
                        <motion.div
                            key={d.key}
                            className={`${s.sceneLayer} ${SCENE_CLASS[d.key]}`}
                            initial={false}
                            animate={{ opacity: i === active ? 1 : 0 }}
                            transition={{ duration: reduce ? 0 : 1.1, ease: "easeInOut" }}
                        />
                    ))}
                    <div className={s.ambient} />
                    <div className={s.grain} />
                </div>

                <div className={s.container}>
                    <div className={s.heroInner}>
                        {/* Voce umana (serif) */}
                        <div className={s.voice}>
                            <span className={s.wordmark}>
                                <span className={s.wordmarkDot} />
                                CataloGlobe
                            </span>
                            <h1 className={s.heroH1}>
                                Il tuo menu <em>vive la giornata</em> del tuo locale.
                            </h1>
                            <p className={s.heroSub}>
                                Colazioni, pranzo, aperitivo, cena. Imposti le regole una volta:
                                il menu giusto compare da solo, all'ora giusta. Tu servi ai
                                tavoli, non aggiorni il sito.
                            </p>
                            <div className={s.heroCtas}>
                                <a className={s.ctaPrimary} href="#waitlist">
                                    Richiedi accesso <ArrowRight size={17} strokeWidth={2.2} />
                                </a>
                                <a className={s.ctaGhost} href="#giornata">
                                    Guarda com'è fatto
                                </a>
                            </div>
                            <p className={s.heroNote}>
                                Configuri tutto gratis · paghi solo quando vai live.
                            </p>
                        </div>

                        {/* Demo prodotto — superficie bianca costante, sempre leggibile */}
                        <div className={s.stage}>
                            <div className={s.device}>
                                <div className={s.deviceChrome}>
                                    <span className={s.dots}>
                                        <i className={s.dot} />
                                        <i className={s.dot} />
                                        <i className={s.dot} />
                                    </span>
                                    <span className={s.deviceUrl}>
                                        cataloglobe.app/<b>{HERO_DEMO.slug}</b>
                                    </span>
                                </div>

                                <div className={s.clockRow}>
                                    <span className={s.clock}>
                                        <AnimatePresence mode="popLayout" initial={false}>
                                            <motion.span
                                                key={dp.time}
                                                className={s.clockTime}
                                                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: reduce ? 0 : -6 }}
                                                transition={{ duration: 0.28 }}
                                            >
                                                {dp.time}
                                            </motion.span>
                                        </AnimatePresence>
                                        <span className={s.clockLabel}>{dp.label}</span>
                                    </span>
                                    <span className={`${s.ruleBadge} ${rule.cls}`}>
                                        <span className={s.ruleDot} />
                                        {rule.label}
                                    </span>
                                </div>

                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.ul
                                        key={dp.key}
                                        className={s.menu}
                                        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: reduce ? 0 : -8 }}
                                        transition={{ duration: 0.3, ease: "easeOut" }}
                                    >
                                        {dp.menu.map((item) => (
                                            <li className={s.menuRow} key={item.name}>
                                                <span className={s.menuName}>{item.name}</span>
                                                <span className={s.menuDots} aria-hidden="true" />
                                                <span className={s.menuPrice}>{item.price}</span>
                                            </li>
                                        ))}
                                    </motion.ul>
                                </AnimatePresence>

                                <div className={s.deviceFoot}>
                                    <span className={s.qrFrame}>
                                        <QRCodeSVG
                                            value={HUB_URL}
                                            size={58}
                                            level="M"
                                            aria-label={`QR code del menu di ${HERO_DEMO.name}`}
                                        />
                                    </span>
                                    <span className={s.footCopy}>
                                        <span className={s.footTitle}>Un solo QR sul tavolo</span>
                                        <span className={s.footSub}>
                                            Il cliente inquadra: trova sempre il menu dell'ora giusta.
                                        </span>
                                    </span>
                                </div>
                            </div>

                            {/* Tablist fasce del giorno */}
                            <div
                                className={s.dayparts}
                                role="tablist"
                                aria-label="Fasce della giornata"
                            >
                                {DAYPARTS.map((d, i) => (
                                    <button
                                        key={d.key}
                                        ref={(el) => {
                                            tabsRef.current[i] = el;
                                        }}
                                        role="tab"
                                        aria-selected={i === active}
                                        tabIndex={i === active ? 0 : -1}
                                        className={`${s.daypartTab} ${
                                            i === active ? s.daypartActive : ""
                                        }`}
                                        onClick={() => setActive(i)}
                                        onKeyDown={(e) => onTabKey(e, i)}
                                    >
                                        <span className={s.daypartName}>{d.tabName}</span>
                                        <span className={s.daypartTime}>{d.time}</span>
                                    </button>
                                ))}
                            </div>

                            {!reduce && (
                                <div className={s.dayTrack} aria-hidden="true">
                                    <motion.div
                                        key={`${active}-${paused}`}
                                        className={s.dayTrackFill}
                                        initial={{ width: "0%" }}
                                        animate={{ width: paused ? "0%" : "100%" }}
                                        transition={{
                                            duration: paused ? 0 : AUTO_MS / 1000,
                                            ease: "linear",
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main>
                {/* ============ SECONDO CERCHIO — le leve del motore ============ */}
                <section className={s.section} id="giornata" aria-labelledby="leve-h2">
                    <div className={s.container}>
                        <div className={s.sectionLead}>
                            <p className={s.sectionKicker}>Quello che il motore ti mette in mano</p>
                            <h2 className={s.sectionH2} id="leve-h2">
                                Impostata la giornata, il resto sono <em>gesti singoli</em>.
                            </h2>
                            <p className={s.sectionH2Sub}>
                                Non sono funzioni sparse: sono cose che il motore fa succedere
                                al momento giusto, senza che tu ci torni sopra.
                            </p>
                        </div>

                        <div className={s.levers}>
                            {/* Leva 1 — contenuti in evidenza / promo / eventi */}
                            <div className={s.lever}>
                                <div className={s.leverText}>
                                    <span className={s.leverIndex}>La prima leva</span>
                                    <h3 className={s.leverH3}>
                                        Il venerdì sera va in vetrina da solo.
                                    </h3>
                                    <p className={s.leverBody}>
                                        Programmi una promo o un evento e il motore lo porta in
                                        home all'ora giusta, poi lo ritira quando è finito.
                                        L'aperitivo del venerdì non te lo dimentichi mai più.
                                    </p>
                                </div>
                                <div className={s.leverDemo}>
                                    <div className={s.chip}>
                                        <div className={s.chipHead}>In evidenza · adesso in home</div>
                                        <div className={s.chipBody}>
                                            <div className={s.promoCard}>
                                                <span className={s.promoWhen}>
                                                    <b>VEN</b>
                                                    <span>18:30</span>
                                                </span>
                                                <span>
                                                    <span className={s.promoTitle}>
                                                        Aperitivo in terrazza
                                                    </span>
                                                    <span className={s.promoMeta}>
                                                        Attivo · si chiude alle 21:00
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Leva 2 — cambio stile quando vuoi */}
                            <div className={`${s.lever} ${s.leverAlt}`}>
                                <div className={s.leverText}>
                                    <span className={s.leverIndex}>La seconda leva</span>
                                    <h3 className={s.leverH3}>
                                        Cambi veste al locale in un gesto.
                                    </h3>
                                    <p className={s.leverBody}>
                                        Estate chiara, feste in tono caldo, dehors la sera in blu
                                        profondo. Cambi lo stile della pagina quando vuoi — i
                                        prodotti e i prezzi restano esattamente gli stessi.
                                    </p>
                                </div>
                                <div className={s.leverDemo}>
                                    <div className={s.chip}>
                                        <div className={s.chipHead}>Stile della pagina</div>
                                        <div className={s.chipBody}>
                                            <StyleSwapDemo reduce={!!reduce} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Leva 3 — traduzione realtime */}
                            <div className={s.lever}>
                                <div className={s.leverText}>
                                    <span className={s.leverIndex}>La terza leva</span>
                                    <h3 className={s.leverH3}>
                                        Il turista legge il menu nella sua lingua.
                                    </h3>
                                    <p className={s.leverBody}>
                                        La pagina si traduce da sola in base a chi la apre. Un
                                        cliente da Monaco inquadra il QR e trova già tutto in
                                        tedesco — tu non traduci niente a mano.
                                    </p>
                                </div>
                                <div className={s.leverDemo}>
                                    <div className={s.chip}>
                                        <div className={s.chipHead}>Traduzione della pagina</div>
                                        <div className={s.chipBody}>
                                            <TranslateDemo />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ============ TERZO CERCHIO — gestisci e cresci ============ */}
                <section className={`${s.section} ${s.sectionAlt}`} aria-labelledby="cresci-h2">
                    <div className={s.container}>
                        <div className={s.sectionLead}>
                            <h2 className={s.sectionH2} id="cresci-h2">
                                E quando vuoi <em>capire e crescere</em>.
                            </h2>
                            <p className={s.sectionH2Sub}>
                                Gli strumenti per gestire il locale, non una vetrina di funzioni.
                                Ci sono quando ti servono.
                            </p>
                        </div>

                        <div className={s.growPanel}>
                            <div className={s.growRow}>
                                <span className={s.growName}>
                                    <span className={s.growIcon}><BarChart3 size={18} strokeWidth={2} /></span>
                                    Analitiche
                                </span>
                                <p className={s.growDesc}>
                                    Capisci cosa vende davvero e a che ora — non a sensazione.
                                </p>
                                <span className={s.growStat}>
                                    Trofie al pesto · <b>128</b> questa settimana
                                </span>
                            </div>
                            <div className={s.growRow}>
                                <span className={s.growName}>
                                    <span className={s.growIcon}><MessageSquareText size={18} strokeWidth={2} /></span>
                                    Recensioni interne
                                </span>
                                <p className={s.growDesc}>
                                    Intercetti il feedback prima che finisca su Google.
                                </p>
                                <span className={s.growStat}>
                                    <b>★ 4,6</b> · 12 nuove da leggere
                                </span>
                            </div>
                            <div className={s.growRow}>
                                <span className={s.growName}>
                                    <span className={s.growIcon}><Users size={18} strokeWidth={2} /></span>
                                    Team
                                </span>
                                <p className={s.growDesc}>
                                    Deleghi al personale senza dare le chiavi di tutto.
                                </p>
                                <span className={s.growStat}>
                                    <b>3</b> membri · permessi per sede
                                </span>
                            </div>
                            <div className={s.growRow}>
                                <span className={s.growName}>
                                    <span className={s.growIcon}><QrCode size={18} strokeWidth={2} /></span>
                                    Al tavolo
                                    <span className={s.proTag}>PRO</span>
                                </span>
                                <p className={s.growDesc}>
                                    Ordine al tavolo e prenotazioni via QR, quando sei pronto.
                                </p>
                                <span className={s.growStat}>Attivi con un clic</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ============ CHIUSURA-PROMESSA — multi-sede come crescita ============ */}
                <section className={s.promise} aria-label="Da un locale a una catena">
                    <div className={s.container}>
                        <p className={s.promiseLine}>
                            Inizia con un locale, scala a una catena <em>con lo stesso gesto</em>.
                        </p>
                        <p className={s.promiseSub}>
                            Le regole che imposti per un menu valgono per venti. Aggiungi una
                            sede e il motore fa già tutto il resto.
                        </p>
                    </div>
                </section>

                {/* ============ PREZZI (dati reali) ============ */}
                <section className={s.section} id="prezzi" aria-labelledby="prezzi-h2">
                    <div className={s.container}>
                        <div className={s.sectionLead}>
                            <h2 className={s.sectionH2} id="prezzi-h2">
                                Un prezzo per sede. <em>Chiaro.</em>
                            </h2>
                            <p className={s.sectionH2Sub}>
                                IVA inclusa. Dal secondo locale ogni sede costa il 10% in meno.
                            </p>
                        </div>

                        <div className={s.plans}>
                            {PRICING_PLANS.map((plan) => {
                                const base = PRICING_PLANS.find((p) => p.key === "base")!;
                                const isPro = plan.key === "pro";
                                return (
                                    <div
                                        key={plan.key}
                                        className={`${s.plan} ${plan.popular ? s.planPopular : ""}`}
                                    >
                                        {plan.popular && (
                                            <span className={s.planBadge}>Consigliato</span>
                                        )}
                                        <span className={s.planName}>{plan.name}</span>
                                        <span className={s.planPrice}>{plan.priceLabel}</span>
                                        <span className={s.planDiscount}>{plan.discountNote}</span>
                                        <div className={s.planDivider} />
                                        {isPro && (
                                            <p className={s.planIntro}>{plan.featuresIntro}</p>
                                        )}
                                        <ul className={s.planList}>
                                            {plan.features.map((f) => (
                                                <li className={s.planItem} key={f}>
                                                    <Check className={s.checkIcon} />
                                                    {f}
                                                </li>
                                            ))}
                                            {/* Pro: eco compatta del Base → non sembra "più vuoto" */}
                                            {isPro &&
                                                base.features.slice(0, 3).map((f) => (
                                                    <li
                                                        className={`${s.planItem} ${s.planItemInherited}`}
                                                        key={`inh-${f}`}
                                                    >
                                                        <Check className={s.checkIconMuted} />
                                                        {f}
                                                    </li>
                                                ))}
                                            {isPro && (
                                                <li
                                                    className={`${s.planItem} ${s.planItemInherited}`}
                                                >
                                                    <Check className={s.checkIconMuted} />
                                                    …e tutto il resto del piano Base
                                                </li>
                                            )}
                                        </ul>
                                        <a
                                            href="#waitlist"
                                            className={`${s.planCta} ${
                                                plan.popular ? s.planCtaPrimary : s.planCtaGhost
                                            }`}
                                        >
                                            Richiedi accesso
                                        </a>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ============ FAQ (dati reali) ============ */}
                <section className={`${s.section} ${s.sectionAlt}`} aria-labelledby="faq-h2">
                    <div className={s.container}>
                        <div className={s.sectionLead}>
                            <h2 className={s.sectionH2} id="faq-h2">
                                Domande, in breve.
                            </h2>
                        </div>
                        <FaqList />
                    </div>
                </section>
            </main>

            {/* ============ CTA finale (serale) ============ */}
            <section className={s.finalCta} id="waitlist" aria-labelledby="final-h2">
                <h2 className={s.finalTitle} id="final-h2">
                    Metti in scena la giornata del tuo locale. <em>Da oggi.</em>
                </h2>
                <p className={s.finalSub}>
                    Configuri prodotti, regole e stile gratis. Paghi solo quando pubblichi.
                </p>
                <a className={s.finalCtaBtn} href="#">
                    Richiedi accesso <ArrowRight size={18} strokeWidth={2.2} />
                </a>
                <p className={s.finalNote}>Nessuna carta richiesta per iniziare.</p>
            </section>
        </div>
    );
}

/* ── Check icon (SVG inline, coerente con set Lucide) ───────────────── */
function Check({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

/* ── Leva 2: cambio stile (swatch auto-ciclanti, pausabile) ─────────── */
function StyleSwapDemo({ reduce }: { reduce: boolean }) {
    const styles = [
        { key: "warm", cls: s.swatchWarm, label: "Caldo" },
        { key: "cool", cls: s.swatchCool, label: "Chiaro" },
        { key: "night", cls: s.swatchNight, label: "Sera" },
    ];
    const [i, setI] = useState(0);
    useEffect(() => {
        if (reduce) return;
        const id = window.setInterval(() => setI((v) => (v + 1) % styles.length), 2600);
        return () => window.clearInterval(id);
    }, [reduce, styles.length]);
    return (
        <div className={s.styleSwap}>
            <div className={s.styleSwatches}>
                {styles.map((st, idx) => (
                    <span
                        key={st.key}
                        className={`${st.cls} ${s.swatch} ${idx === i ? s.swatchActive : ""}`}
                    >
                        {st.label}
                    </span>
                ))}
            </div>
            <p className={s.styleNote}>
                Stile attivo: <b>{styles[i].label}</b> — stessi prodotti, stessi prezzi.
            </p>
        </div>
    );
}

/* ── Leva 3: traduzione realtime (toggle IT/DE/EN) ──────────────────── */
function TranslateDemo() {
    const langs = ["IT", "DE", "EN"] as const;
    const [lang, setLang] = useState<(typeof langs)[number]>("IT");
    const rows: Record<(typeof langs)[number], { name: string; price: string }[]> = {
        IT: [
            { name: "Trofie al pesto", price: "€12" },
            { name: "Insalata di mare", price: "€16" },
        ],
        DE: [
            { name: "Trofie mit Pesto", price: "€12" },
            { name: "Meeresfrüchtesalat", price: "€16" },
        ],
        EN: [
            { name: "Trofie with pesto", price: "€12" },
            { name: "Seafood salad", price: "€16" },
        ],
    };
    return (
        <div>
            <div className={s.langRow}>
                <span className={s.langToggle}>
                    {langs.map((l) => (
                        <button
                            key={l}
                            className={`${s.langOpt} ${lang === l ? s.langOptActive : ""}`}
                            aria-pressed={lang === l}
                            onClick={() => setLang(l)}
                        >
                            {l}
                        </button>
                    ))}
                </span>
                <span className={s.langLine}>lingua del visitatore</span>
            </div>
            {rows[lang].map((r) => (
                <div className={s.transRow} key={r.name}>
                    <span className={s.transName}>{r.name}</span>
                    <span className={s.transPrice}>{r.price}</span>
                </div>
            ))}
        </div>
    );
}

/* ── FAQ accordion (dati reali, accessibile) ────────────────────────── */
function FaqList() {
    const [open, setOpen] = useState<number | null>(0);
    const reduce = useReducedMotion();
    return (
        <div className={s.faqList}>
            {FAQ_ITEMS.map((item, i) => {
                const isOpen = open === i;
                return (
                    <div className={s.faqItem} key={item.q}>
                        <button
                            className={s.faqQ}
                            aria-expanded={isOpen}
                            onClick={() => setOpen(isOpen ? null : i)}
                        >
                            {item.q}
                            <Plus
                                size={20}
                                strokeWidth={2}
                                className={`${s.faqIcon} ${isOpen ? s.faqIconOpen : ""}`}
                            />
                        </button>
                        <AnimatePresence initial={false}>
                            {isOpen && (
                                <motion.div
                                    className={s.faqA}
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: reduce ? 0 : 0.28, ease: "easeOut" }}
                                >
                                    <p className={s.faqAInner}>{item.a}</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}
