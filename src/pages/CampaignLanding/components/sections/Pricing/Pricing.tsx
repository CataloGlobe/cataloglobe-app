import { useId, useState, type CSSProperties } from "react";
import LandingCta from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { PRICING, type PlanKey } from "@pages/CampaignLanding/content/landing";
import styles from "./Pricing.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

type ItemKind = "ok" | "pro" | "no";

function ItemIcon({ kind }: { kind: ItemKind }) {
    return (
        <span className={cx(styles.itemIcon, styles[`icon-${kind}`])}>
            {kind === "no" ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                </svg>
            )}
        </span>
    );
}

function Item({ text, kind }: { text: string; kind: ItemKind }) {
    return (
        <li className={cx(styles.item, styles[`item-${kind}`])}>
            <ItemIcon kind={kind} />
            <span className={styles.itemText}>
                {kind === "no" && <span className={styles.srOnly}>{PRICING.notIncluded} </span>}
                {text}
            </span>
        </li>
    );
}

/** Le voci solo Pro in un blocco a parte: nel Base grigie con la X, nel Pro in evidenza. */
function ProOnly({ isPro }: { isPro: boolean }) {
    return (
        <div className={cx(styles.proOnly, isPro && styles.proOnlyOn)}>
            <p className={styles.proOnlyLabel}>{PRICING.proOnly}</p>
            <ul className={styles.items}>
                {PRICING.proItems.map((text) => (
                    <Item key={text} text={text} kind={isPro ? "pro" : "no"} />
                ))}
            </ul>
        </div>
    );
}

/**
 * Scheda di un piano: testata (nome, prezzo, prova gratuita, CTA) e voci.
 * `compact` (Pro al telefono): le voci in comune col Base più piccole e fitte.
 */
function PlanCard({ plan, annual, printer, compact = false }: { plan: PlanKey; annual: boolean; printer: boolean; compact?: boolean }) {
    const p = PRICING.plans[plan];
    const isPro = plan === "pro";

    return (
        <div className={cx(styles.card, isPro && styles.cardPro)}>
            <div className={styles.cardTop}>
                <div className={styles.glow} aria-hidden="true" />
                <span className={styles.recommended}>{PRICING.recommended}</span>
                <h3 className={styles.planName}>{p.name}</h3>
                <p className={styles.claim}>{p.claim}</p>
                <div className={styles.priceRow}>
                    <span key={annual ? "year" : "month"} className={styles.priceSwap}>
                        <span className={styles.price}>{annual ? p.year : p.month}</span>
                        <span className={styles.period}>
                            {annual ? PRICING.period.year : PRICING.period.month}
                            <br />
                            {PRICING.perVenue}
                        </span>
                    </span>
                    {annual && (
                        <span className={styles.full}>
                            <span className={styles.srOnly}>{PRICING.fullPriceLabel}: </span>
                            <s>{p.yearFull}</s>
                        </span>
                    )}
                </div>
                <p className={styles.anchor}>{p.anchor}</p>
                <span className={styles.trialBadge}>{PRICING.trialBadge}</span>
                <LandingCta placement={isPro ? "pricing-pro" : "pricing-base"} shape="plan" look={isPro ? "dark" : "soft"} />
                <p className={styles.trial}>{PRICING.cancel}</p>
            </div>
            <div className={styles.divider} />
            <div className={styles.body}>
                <ul className={cx(styles.items, compact && styles.itemsCompact)}>
                    {PRICING.items.map((text) => (
                        <Item key={text} text={text} kind="ok" />
                    ))}
                </ul>
                <ProOnly isPro={isPro} />
                {printer && (
                    <p className={styles.printer}>
                        <b>{PRICING.printer.label}</b>
                        {PRICING.printer.text}
                    </p>
                )}
            </div>
        </div>
    );
}

function Segmented<T extends string>({
    options,
    value,
    onChange,
    label
}: {
    options: { value: T; label: string; badge?: string }[];
    value: T;
    onChange: (v: T) => void;
    label: string;
}) {
    const index = Math.max(0, options.findIndex((o) => o.value === value));
    return (
        <div className={styles.seg} role="group" aria-label={label} style={{ "--seg-i": index } as CSSProperties}>
            <span className={styles.segThumb} aria-hidden="true" />
            {options.map((o) => (
                <button key={o.value} type="button" className={cx(styles.segBtn, o.value === value && styles.segOn)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
                    {o.label}
                    {o.badge && <span className={styles.segBadge}>{o.badge}</span>}
                </button>
            ))}
        </div>
    );
}

/**
 * Mobile: sotto la scheda Pro, una riga che si apre sul Base (nome e claim, mai
 * una domanda che lo sminuisca). Non ripete le voci: dice cosa include e cosa
 * resta al Pro. Si apre con l'altezza animata (griglia 0fr → 1fr).
 */
function BaseOffer({ annual }: { annual: boolean }) {
    const p = PRICING.plans.base;
    const [open, setOpen] = useState(false);
    const bodyId = useId();
    return (
        <div className={cx(styles.baseOffer, open && styles.boOpen)}>
            <button type="button" className={styles.boSummary} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
                <span className={styles.boText}>
                    <span className={styles.boName}>{p.name}</span>
                    <span className={styles.boClaim}>{p.claim}</span>
                </span>
                <span className={styles.boPrice}>
                    {annual ? p.year : p.month}
                    <span className={styles.boPeriod}>{annual ? PRICING.period.year : PRICING.period.month}</span>
                </span>
                <svg className={styles.boChev} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>
            <div id={bodyId} className={styles.boWrap} inert={!open}>
                <div className={styles.boInner}>
                    <div className={styles.boBody}>
                        <p className={styles.boNote}>{PRICING.baseOffer.text}</p>
                        <p className={styles.boAnchor}>{p.anchor}</p>
                        <span className={styles.trialBadge}>{PRICING.trialBadge}</span>
                        <LandingCta placement="pricing-base" shape="plan" look="soft" className={styles.boCta} />
                    </div>
                </div>
            </div>
        </div>
    );
}

/** 8 · Quanto costa: mensile/annuale; su mobile la scheda Pro con il Base sotto, da desktop le due schede. */
export default function Pricing() {
    const [annual, setAnnual] = useState(false);

    return (
        <Section id="prezzi" tone="lilla" labelledBy="landing-pricing-title">
            <Reveal className={styles.head}>
                <HandNote size="lg" className={styles.handNote}>{PRICING.note}</HandNote>
                <SplitHeading id="landing-pricing-title" title={PRICING.title} size="section" className={styles.title} />
                <Segmented
                    label={PRICING.intervalsLabel}
                    value={annual ? "year" : "month"}
                    onChange={(v) => setAnnual(v === "year")}
                    options={[
                        { value: "month", label: PRICING.intervals.month },
                        { value: "year", label: PRICING.intervals.year, badge: PRICING.yearBadge }
                    ]}
                />
            </Reveal>

            <Reveal className={styles.mobilePlans}>
                <PlanCard plan="pro" annual={annual} printer compact />
                <BaseOffer annual={annual} />
            </Reveal>
            <Reveal className={styles.cards} variant="cards">
                <PlanCard plan="base" annual={annual} printer={false} />
                <PlanCard plan="pro" annual={annual} printer />
            </Reveal>

            <p className={styles.footnote}>{PRICING.footnote}</p>
        </Section>
    );
}
