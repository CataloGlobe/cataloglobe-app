import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import s from './LandingPage.module.scss';
import {
    SCHEDULE_RULES,
    PAIN_ROWS,
    HOW_STEPS,
    DEMOS,
    PRICING_TIERS,
    INCLUDED_FEATURES,
    FAQ_ITEMS,
    type Demo,
} from './landingData';

// ─── Feature icon constants (defined once, not re-created on render) ──────────
const ICON_SCHEDULING = (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="22" height="19" rx="3" stroke="#6366F1" strokeWidth="1.8" />
        <path d="M3 10h22" stroke="#6366F1" strokeWidth="1.8" />
        <circle cx="9" cy="16" r="2" fill="#6366F1" opacity="0.3" />
        <circle cx="14" cy="16" r="2" fill="#6366F1" />
        <circle cx="19" cy="16" r="2" fill="#6366F1" opacity="0.3" />
        <path d="M8 3v4M20 3v4" stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
);

const ICON_MULTISEDE = (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="14" cy="8" r="4" stroke="#6366F1" strokeWidth="1.8" />
        <circle cx="6" cy="21" r="3" stroke="#6366F1" strokeWidth="1.8" opacity="0.4" />
        <circle cx="14" cy="21" r="3" stroke="#6366F1" strokeWidth="1.8" />
        <circle cx="22" cy="21" r="3" stroke="#6366F1" strokeWidth="1.8" opacity="0.4" />
        <path d="M14 12v6M9.5 18.5L12 13M18.5 18.5L16 13" stroke="#6366F1" strokeWidth="1.4" opacity="0.5" />
    </svg>
);

const ICON_REVIEW = (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path
            d="M14 3l3.2 6.5L24 10.5l-5 4.9 1.2 6.9L14 19.1l-6.2 3.2L9 15.4l-5-4.9 6.8-1L14 3z"
            stroke="#6366F1"
            strokeWidth="1.8"
            strokeLinejoin="round"
        />
        <path d="M14 3l3.2 6.5L24 10.5l-5 4.9 1.2 6.9L14 19.1" fill="#6366F1" opacity="0.12" />
    </svg>
);

const ICON_HUB = (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="6" y="3" width="16" height="22" rx="3" stroke="#6366F1" strokeWidth="1.8" />
        <rect x="10" y="8" width="8" height="5" rx="1.5" fill="#6366F1" opacity="0.15" stroke="#6366F1" strokeWidth="1.2" />
        <path d="M10 17h8M10 20h5" stroke="#6366F1" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
    </svg>
);

const FEATURE_ITEMS = [
    {
        title: 'Scheduling intelligente',
        desc: 'Menu pranzo, aperitivo, cena — si alternano da soli. Promozioni che compaiono e scompaiono in automatico, su qualsiasi scala.',
        icon: ICON_SCHEDULING,
    },
    {
        title: 'Multi-sede, un pannello',
        desc: 'Aggiorna un prezzo e si propaga ovunque. Oppure personalizza sede per sede. Tu scegli il livello di controllo.',
        icon: ICON_MULTISEDE,
    },
    {
        title: 'Review Guard',
        desc: 'Intercetta le recensioni negative prima che arrivino su Google. Raccogli feedback strutturato per migliorare davvero il servizio.',
        icon: ICON_REVIEW,
    },
    {
        title: 'Hub digitale per ogni sede',
        desc: "Il QR non porta solo al menu — apre un hub con menu, recensioni e promozioni. Ogni scansione è un'opportunità.",
        icon: ICON_HUB,
    },
] as const;

// ─── Scroll-reveal wrapper (Framer Motion) ───────────
function Animate({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '0px 0px -50px 0px' });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
        >
            {children}
        </motion.div>
    );
}

// ─── Navbar ───────────────────────────────────────────
function Navbar() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    return (
        <nav className={`${s.navbar} ${scrolled ? s.navbarScrolled : ''}`}>
            <a href="/" className={s.navLogo}>
                Catalo<span className={s.navGlobe}>Globe</span>
            </a>
            <div className={s.navLinks}>
                {[
                    { label: 'Funzionalità', id: 'funzionalità' },
                    { label: 'Come funziona', id: 'come-funziona' },
                    { label: 'Prezzi', id: 'prezzi' },
                ].map(({ label, id }) => (
                    <a
                        key={id}
                        href={`#${id}`}
                        className={s.navLink}
                        onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                    >
                        {label}
                    </a>
                ))}
                <a href="/login" className={s.navLinkAccedi}>Accedi</a>
                <a href="/sign-up" className={s.navCta}>Prova gratis</a>
            </div>
        </nav>
    );
}

// ─── Hero (no animation wrapper — always visible immediately) ─────────
function Hero() {
    return (
        <section className={s.hero}>
            <div className={s.heroGrid} aria-hidden="true" />
            <div className={s.heroGlow} aria-hidden="true" />
            <div className={s.heroInner}>
                <div className={s.heroContent}>
                    <div className={s.heroBadge}>
                        <span className={s.badgeDot} />
                        <span className={s.badgeText}>Beta aperta — 3 mesi gratis</span>
                    </div>

                    <h1 className={s.heroH1}>
                        I tuoi menu si<br />aggiornano da soli.
                    </h1>

                    <p className={s.heroSub}>
                        Un unico punto di controllo per prodotti, prezzi, promozioni e sedi.
                        Tu definisci le regole, CataloGlobe fa il resto.
                    </p>

                    <div className={s.heroCtas}>
                        <a href="/sign-up" className={s.ctaPrimary}>Inizia gratis</a>
                        <a href="#" className={s.ctaSecondary}>
                            Richiedi una demo <span>→</span>
                        </a>
                    </div>

                    <p className={s.heroSubtext}>
                        Nessuna carta di credito · Configura tutto gratis · Paghi solo se vai live
                    </p>
                </div>

                {/* Product mockup — desktop only */}
                <div className={s.heroMockupWrapper}>
                    <div className={s.mockupShell}>
                        <div className={s.mockupChrome}>
                            <span className={s.mockupDotRed} />
                            <span className={s.mockupDotYellow} />
                            <span className={s.mockupDotGreen} />
                        </div>
                        <div className={s.mockupBody}>
                            {SCHEDULE_RULES.map((rule, i) => (
                                <div key={i} className={s.scheduleRow}>
                                    <div className={s.scheduleRowLeft}>
                                        <span
                                            className={s.scheduleRowDot}
                                            style={{ background: rule.statusColor }}
                                        />
                                        <div>
                                            <div className={s.scheduleRowName}>{rule.name}</div>
                                            <div className={s.scheduleRowMeta}>{rule.type}</div>
                                        </div>
                                    </div>
                                    <span
                                        className={s.scheduleBadge}
                                        style={{
                                            color: rule.statusColor,
                                            background: `${rule.statusColor}14`,
                                        }}
                                    >
                                        {rule.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─── Pain Bridge ──────────────────────────────────────
function PainBridge() {
    return (
        <section className={s.painBridge}>
            <div className={s.painWrap}>
                <Animate>
                    <div className={s.painHeader}>
                        <span className={s.painHeaderLabel}>Oggi</span>
                        <span />
                        <span className={s.painHeaderLabelAccent}>Con CataloGlobe</span>
                    </div>
                </Animate>
                {PAIN_ROWS.map((row, i) => (
                    <Animate key={i} delay={0.04 + i * 0.05}>
                        <div className={s.painRow}>
                            <span className={s.painBefore}>{row.before}</span>
                            <span className={s.painArrow} aria-hidden="true">
                                <svg width="20" height="12" viewBox="0 0 20 12" fill="none" aria-hidden="true">
                                    <path
                                        d="M0 6h16M13 1l5 5-5 5"
                                        stroke="#6366F1"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </span>
                            <span className={s.painAfter}>{row.after}</span>
                        </div>
                    </Animate>
                ))}
            </div>
        </section>
    );
}

// ─── How It Works ─────────────────────────────────────
function HowItWorks() {
    return (
        <section id="come-funziona" className={s.howItWorks}>
            <div className={s.wrap}>
                <Animate>
                    <span className={s.sectionLabel}>Come funziona</span>
                </Animate>
                <Animate delay={0.04}>
                    <h2 className={s.sectionH2}>
                        Tre passi.<br />Zero manutenzione.
                    </h2>
                </Animate>
                <div className={s.stepsGrid}>
                    {HOW_STEPS.map((step, i) => (
                        <Animate key={i} delay={i * 0.08}>
                            <div className={s.stepCard}>
                                <span className={s.stepNum}>{step.num}</span>
                                <h3 className={s.stepTitle}>{step.title}</h3>
                                <p className={s.stepDesc}>{step.desc}</p>
                            </div>
                        </Animate>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─── Features ─────────────────────────────────────────
function Features() {
    return (
        <section id="funzionalità" className={s.features}>
            <div className={s.featuresGlow} aria-hidden="true" />
            <div className={`${s.wrap} ${s.featuresInner}`}>
                <Animate>
                    <span className={s.sectionLabel}>Funzionalità</span>
                </Animate>
                <Animate delay={0.04}>
                    <h2 className={s.featuresH2}>
                        Non un menu builder.<br />Un motore di distribuzione.
                    </h2>
                </Animate>
                <Animate delay={0.08}>
                    <p className={s.featuresSub}>
                        Il contenuto è separato dalla distribuzione. Tu crei una volta, il sistema mostra ovunque.
                    </p>
                </Animate>
                <div className={s.featuresGrid}>
                    {FEATURE_ITEMS.map((f, i) => (
                        <Animate key={f.title} delay={i * 0.08}>
                            <div className={s.featureCard}>
                                <div className={s.featureIcon}>{f.icon}</div>
                                <h3 className={s.featureTitle}>{f.title}</h3>
                                <p className={s.featureDesc}>{f.desc}</p>
                            </div>
                        </Animate>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─── Demo Carousel ────────────────────────────────────
interface QRProps {
    slug: string;
}

function QRPlaceholder({ slug }: QRProps) {
    const seed = slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const g = 7;
    const cells: React.ReactNode[] = [];

    for (let r = 0; r < g; r++) {
        for (let c = 0; c < g; c++) {
            const h = ((seed * (r + 1) * 7 + (c + 1) * 13) % 100);
            const finder = (r < 2 && c < 2) || (r < 2 && c >= g - 2) || (r >= g - 2 && c < 2);
            const center = r === 3 && c === 3;
            if (finder || center || h < 42) {
                cells.push(
                    <rect
                        key={`${r}-${c}`}
                        x={c * 7 + 4}
                        y={r * 7 + 4}
                        width="6"
                        height="6"
                        rx="0.5"
                        fill="currentColor"
                    />
                );
            }
        }
    }

    return (
        <svg width="55" height="55" viewBox="0 0 55 55" style={{ color: '#0c0a1d', flexShrink: 0 }}>
            <rect width="55" height="55" rx="6" fill="#f6f5f9" stroke="#eae8f0" strokeWidth="0.5" />
            {cells}
        </svg>
    );
}

interface CardProps {
    demo: Demo;
    offset: number;
}

function DemoCard({ demo, offset }: CardProps) {
    const abs = Math.abs(offset);
    const tx = offset * 210;
    const sc = 1 - abs * 0.14;
    const ry = -offset * 15;
    const z = -abs * 130;
    const op = abs > 1 ? 0 : 1 - abs * 0.4;
    const isCenter = offset === 0;
    const isDark = Boolean(demo.dark);

    const cardBg = isDark ? '#0f0d1a' : '#ffffff';
    const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    const shadow = isCenter
        ? `0 28px 70px rgba(0,0,0,${isDark ? 0.5 : 0.14})`
        : `0 8px 24px rgba(0,0,0,${isDark ? 0.3 : 0.06})`;

    return (
        <div
            className={s.cardOuter}
            style={{
                transform: `translateX(-50%) translateX(${tx}px) translateZ(${z}px) rotateY(${ry}deg) scale(${sc})`,
                opacity: op,
                transition: 'all 0.55s cubic-bezier(.4,0,.2,1)',
                zIndex: 10 - abs,
                pointerEvents: isCenter ? 'auto' : 'none',
                filter: isCenter ? 'none' : `blur(${abs * 0.8}px) brightness(0.75)`,
            }}
        >
            <div
                className={`${s.cardShell} ${isDark ? s.cardDark : s.cardLight}`}
                style={{
                    background: cardBg,
                    border: `1px solid ${cardBorder}`,
                    boxShadow: shadow,
                    '--card-accent': demo.accent,
                } as React.CSSProperties}
            >
                {/* Hero area */}
                <div
                    className={s.cardHero}
                    style={{ background: demo.heroGrad }}
                >
                    <div className={s.cardHeroOrb1} />
                    <div className={s.cardHeroOrb2} />
                    <div className={s.cardHeroOrb3} />
                    <div className={s.cardHeroOverlay}>
                        <div className={s.cardHeroName}>{demo.name}</div>
                        <div className={s.cardHeroAddress}>{demo.address}</div>
                    </div>
                </div>

                {/* Hub buttons */}
                <div className={s.cardHub}>
                    {[
                        { icon: '📋', label: 'Menu', main: true },
                        { icon: '🎉', label: 'Eventi & Promo', main: false },
                        { icon: '⭐', label: 'Dicci la tua', main: false },
                    ].map((btn, j) => (
                        <div
                            key={j}
                            className={`${s.cardHubBtn} ${btn.main ? s.cardHubBtnMain : ''}`}
                            style={btn.main
                                ? { background: demo.accent }
                                : { background: isDark ? 'rgba(255,255,255,0.06)' : '#faf9fc', color: isDark ? 'rgba(255,255,255,0.45)' : '#8b8998' }
                            }
                        >
                            <span>{btn.icon}</span>{btn.label}
                        </div>
                    ))}
                </div>

                {/* Category pills */}
                <div className={s.cardPills}>
                    {demo.categories.map((cat, j) => (
                        <span
                            key={j}
                            className={`${s.cardPill} ${j === 0 ? s.cardPillActive : ''}`}
                            style={j === 0 ? { background: demo.accent } : undefined}
                        >
                            {cat}
                        </span>
                    ))}
                </div>

                {/* Section title */}
                <div className={s.cardSectionTitle}>{demo.categories[0]}</div>

                {/* Products */}
                <div className={s.cardProducts}>
                    {demo.items.map((item, j) => (
                        <div key={j} className={s.cardProduct}>
                            <div
                                className={s.cardProductThumb}
                                style={{ background: item.bg }}
                            >
                                {item.emoji}
                            </div>
                            <div className={s.cardProductInfo}>
                                <div className={s.cardProductHeader}>
                                    <span className={s.cardProductName}>{item.name}</span>
                                    <div className={s.cardProductAdd}>+</div>
                                </div>
                                <div
                                    className={s.cardProductPrice}
                                    style={{ color: demo.accent }}
                                >
                                    {item.price}
                                </div>
                                <div className={s.cardProductDesc}>{item.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function DemoCarousel() {
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);

    const go = useCallback((dir: number) => {
        setActive(p => (p + dir + DEMOS.length) % DEMOS.length);
    }, []);

    useEffect(() => {
        if (paused) return;
        const t = setInterval(() => setActive(p => (p + 1) % DEMOS.length), 4500);
        return () => clearInterval(t);
    }, [paused]);

    return (
        <section
            className={s.carousel}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div className={s.wrap}>
                <div className={s.carouselHeader}>
                    <Animate>
                        <span className={s.sectionLabel}>Provalo dal vivo</span>
                    </Animate>
                    <Animate delay={0.04}>
                        <h2 className={s.carouselH2}>Scansiona. Esplora. Decidi.</h2>
                    </Animate>
                    <Animate delay={0.08}>
                        <p className={s.carouselSub}>
                            Menu demo reali — esattamente come li vedranno i tuoi clienti.
                        </p>
                    </Animate>
                </div>
            </div>

            {/* 3D Carousel stage */}
            <div className={s.carouselStage}>
                <div className={s.carouselInner}>
                    {DEMOS.map((demo, i) => {
                        let off = i - active;
                        if (off > DEMOS.length / 2) off -= DEMOS.length;
                        if (off < -DEMOS.length / 2) off += DEMOS.length;
                        return <DemoCard key={i} demo={demo} offset={off} />;
                    })}
                </div>

                {/* Nav arrows — desktop only */}
                <button
                    className={`${s.arrowBtn} ${s.arrowLeft} ${s.arrowDesktop}`}
                    onClick={() => go(-1)}
                    aria-label="Precedente"
                >
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M11 4L6 9l5 5" stroke="#55536a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button
                    className={`${s.arrowBtn} ${s.arrowRight} ${s.arrowDesktop}`}
                    onClick={() => go(1)}
                    aria-label="Successivo"
                >
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M7 4l5 5-5 5" stroke="#55536a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </div>

            {/* QR + dots */}
            <div className={s.carouselFooter}>
                <div className={s.qrCard}>
                    <QRPlaceholder slug={DEMOS[active].slug} />
                    <div>
                        <div className={s.qrName}>{DEMOS[active].name}</div>
                        <div className={s.qrSub}>Scansiona per provare il menu demo</div>
                    </div>
                </div>
                <div className={s.carouselNavRow}>
                    {/* Left arrow — mobile only */}
                    <button
                        className={`${s.arrowBtn} ${s.arrowMobile}`}
                        onClick={() => go(-1)}
                        aria-label="Precedente"
                    >
                        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                            <path d="M11 4L6 9l5 5" stroke="#55536a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <div className={s.dots}>
                        {DEMOS.map((_, i) => (
                            <button
                                key={i}
                                className={`${s.dot} ${i === active ? s.dotActive : ''}`}
                                onClick={() => setActive(i)}
                                aria-label={`Demo ${i + 1}`}
                            />
                        ))}
                    </div>

                    {/* Right arrow — mobile only */}
                    <button
                        className={`${s.arrowBtn} ${s.arrowMobile}`}
                        onClick={() => go(1)}
                        aria-label="Successivo"
                    >
                        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                            <path d="M7 4l5 5-5 5" stroke="#55536a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>
            </div>
        </section>
    );
}

// ─── Pricing ──────────────────────────────────────────
function Pricing() {
    return (
        <section id="prezzi" className={s.pricing}>
            <div className={s.pricingWrap}>
                <Animate>
                    <span className={s.sectionLabel}>Prezzi</span>
                </Animate>
                <Animate delay={0.04}>
                    <h2 className={s.pricingH2}>Più sedi attivi, meno paghi.</h2>
                </Animate>
                <Animate delay={0.08}>
                    <p className={s.pricingSub}>
                        Configura tutto gratis — paghi solo quando attivi una sede. Prezzi graduali: ogni fascia paga il suo prezzo.
                    </p>
                </Animate>

                <Animate delay={0.12}>
                    <div className={s.tiersGrid}>
                        {PRICING_TIERS.map((tier, i) => (
                            <div
                                key={i}
                                className={`${s.tierCard} ${tier.popular ? s.tierCardPopular : ''}`}
                            >
                                {tier.popular && (
                                    <div className={s.popularBadge}>Più scelto</div>
                                )}
                                <div>
                                    <span className={s.tierRange}>{tier.range}</span>{' '}
                                    <span className={s.tierLabel}>{tier.label}</span>
                                </div>
                                {tier.price ? (
                                    <>
                                        <div className={s.tierPrice}>€{tier.price}</div>
                                        <div className={s.tierUnit}>/sede/mese</div>
                                    </>
                                ) : (
                                    <>
                                        <div className={s.tierCustom}>Su misura</div>
                                        <div className={s.tierUnit}>Contattaci</div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </Animate>

                <Animate delay={0.16}>
                    <div className={s.calcCard}>
                        <span>
                            <span className={s.calcBold}>Esempio:</span>
                            {' '}7 sedi → 3×€39 + 4×€29 ={' '}
                            <span className={s.calcAccent}>€233/mese</span>
                        </span>
                        <span className={s.calcNote}>· IVA inclusa</span>
                    </div>
                </Animate>

                <Animate delay={0.2}>
                    <div className={s.includesCard}>
                        <p className={s.includesTitle}>Tutto incluso in ogni piano:</p>
                        <div className={s.includesGrid}>
                            {INCLUDED_FEATURES.map((feat, i) => (
                                <div key={i} className={s.includesItem}>
                                    <div className={s.includesCheck}>
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                            <path
                                                d="M2 5.2L4.2 7.4L8 3"
                                                stroke="#6366F1"
                                                strokeWidth="1.6"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </div>
                                    <span className={s.includesText}>{feat}</span>
                                </div>
                            ))}
                        </div>
                        <a href="/sign-up" className={s.pricingCta}>Inizia gratis — 3 mesi inclusi</a>
                        <p className={s.pricingCtaNote}>
                            I primi clienti beta non pagano per 3 mesi · Nessuna carta richiesta
                        </p>
                    </div>
                </Animate>
            </div>
        </section>
    );
}

// ─── FAQ ──────────────────────────────────────────────
function FAQ() {
    const [open, setOpen] = useState<number | null>(null);

    return (
        <section id="faq" className={s.faq}>
            <div className={s.faqWrap}>
                <div className={s.faqHeader}>
                    <Animate>
                        <span className={s.sectionLabel}>FAQ</span>
                    </Animate>
                    <Animate delay={0.04}>
                        <h2 className={s.faqH2}>Domande frequenti</h2>
                    </Animate>
                </div>
                {FAQ_ITEMS.map((item, i) => (
                    <Animate key={item.q} delay={i * 0.04}>
                        <div className={s.faqItem}>
                            <button
                                className={s.faqQuestion}
                                onClick={() => setOpen(open === i ? null : i)}
                                aria-expanded={open === i}
                            >
                                <span className={s.faqQuestionText}>{item.q}</span>
                                <span
                                    className={`${s.faqIcon} ${open === i ? s.faqIconOpen : ''}`}
                                    aria-hidden="true"
                                >
                                    +
                                </span>
                            </button>
                            <div
                                className={s.faqAnswer}
                                style={{ maxHeight: open === i ? '160px' : '0' }}
                            >
                                <p className={s.faqAnswerText}>{item.a}</p>
                            </div>
                        </div>
                    </Animate>
                ))}
            </div>
        </section>
    );
}

// ─── Final CTA ────────────────────────────────────────
function FinalCTA() {
    return (
        <section className={s.finalCta}>
            <div className={s.finalGlow} aria-hidden="true" />
            <div className={s.finalWrap}>
                <Animate>
                    <h2 className={s.finalH2}>
                        Pronto a smettere di aggiornare menu a mano?
                    </h2>
                </Animate>
                <Animate delay={0.06}>
                    <p className={s.finalSub}>Configura tutto gratis. Attiva quando sei pronto.</p>
                </Animate>
                <Animate delay={0.12}>
                    <div className={s.finalCtas}>
                        <a href="/sign-up" className={s.ctaIndigo}>Inizia gratis</a>
                        <a href="#" className={s.ctaOutline}>Richiedi una demo</a>
                    </div>
                </Animate>
            </div>
        </section>
    );
}

// ─── Footer ───────────────────────────────────────────
interface FooterLink {
    label: string;
    href: string;
}

interface FooterCol {
    title: string;
    links: FooterLink[];
}

function Footer() {
    const cols: FooterCol[] = [
        {
            title: 'Prodotto',
            links: [
                { label: 'Funzionalità', href: '#funzionalità' },
                { label: 'Prezzi', href: '#prezzi' },
                { label: 'FAQ', href: '#faq' },
                { label: 'Changelog', href: '#' },
            ],
        },
        {
            title: 'Legale',
            links: [
                { label: 'Privacy Policy', href: '/legal/privacy' },
                { label: 'Termini di Servizio', href: '/legal/termini' },
                { label: 'Cookie Policy', href: '/legal/privacy' },
            ],
        },
        {
            title: 'Contatti',
            links: [
                { label: 'info@cataloglobe.com', href: 'mailto:info@cataloglobe.com' },
                { label: 'Supporto', href: '#' },
            ],
        },
    ];

    return (
        <footer className={s.footer}>
            <div className={s.footerTop}>
                <div>
                    <div className={s.footerLogo}>
                        Catalo<span className={s.footerGlobe}>Globe</span>
                    </div>
                    <p className={s.footerDesc}>
                        Menu digitali dinamici per ristoranti, bar, hotel e attività commerciali.
                    </p>
                </div>
                <div className={s.footerCols}>
                    {cols.map((col) => (
                        <div key={col.title}>
                            <p className={s.footerColTitle}>{col.title}</p>
                            {col.links.map((link) => (
                                <a key={link.label} href={link.href} className={s.footerLink}>{link.label}</a>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <div className={s.footerBottom}>
                <p className={s.footerCopy}>© 2026 CataloGlobe · P.IVA XXXXXXXXXX</p>
                <p className={s.footerCity}>Milano, Italia</p>
            </div>
        </footer>
    );
}

// ─── Landing Page ─────────────────────────────────────
export default function LandingPage() {
    return (
        <div className={s.landing}>
            <Navbar />
            <Hero />
            <PainBridge />
            <Features />
            <HowItWorks />
            <DemoCarousel />
            <Pricing />
            <FAQ />
            <FinalCTA />
            <Footer />
        </div>
    );
}
