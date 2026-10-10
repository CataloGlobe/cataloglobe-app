import { useEffect, useRef, useState, type RefObject } from "react";
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

/** Scheda di un piano: testata (nome, prezzo, CTA) e la stessa lista di voci per entrambi. */
function PlanCard({ plan, annual, printer }: { plan: PlanKey; annual: boolean; printer: boolean }) {
    const p = PRICING.plans[plan];
    const isPro = plan === "pro";
    const items: { text: string; kind: ItemKind }[] = [
        ...PRICING.items.map((text) => ({ text, kind: "ok" as const })),
        ...PRICING.proItems.map((text) => ({ text, kind: isPro ? ("pro" as const) : ("no" as const) }))
    ];

    return (
        <div className={cx(styles.card, isPro && styles.cardPro)} data-plan={plan}>
            <div className={styles.cardTop}>
                <div className={styles.glow} aria-hidden="true" />
                <span className={styles.recommended}>{PRICING.recommended}</span>
                <h3 className={styles.planName}>{p.name}</h3>
                <p className={styles.claim}>{p.claim}</p>
                <div className={styles.priceRow}>
                    <span className={styles.price}>{annual ? p.year : p.month}</span>
                    <span className={styles.period}>
                        {annual ? PRICING.period.year : PRICING.period.month}
                        <br />
                        {PRICING.perVenue}
                    </span>
                    {annual && (
                        <span className={styles.full}>
                            <span className={styles.srOnly}>{PRICING.fullPriceLabel}: </span>
                            <s>{p.yearFull}</s>
                        </span>
                    )}
                </div>
                <LandingCta placement={isPro ? "pricing-pro" : "pricing-base"} shape="plan" look={isPro ? "dark" : "soft"} />
                <p className={styles.trial}>{PRICING.trial}</p>
            </div>
            <div className={styles.divider} />
            <ul className={styles.items}>
                {items.map((item) => (
                    <li key={item.text} className={cx(styles.item, styles[`item-${item.kind}`])}>
                        <ItemIcon kind={item.kind} />
                        <span className={styles.itemText}>
                            {item.kind === "no" && <span className={styles.srOnly}>{PRICING.notIncluded} </span>}
                            {item.text}
                        </span>
                    </li>
                ))}
                {printer && (
                    <li className={styles.printer}>
                        <b>{PRICING.printer.label}</b>
                        {PRICING.printer.text}
                    </li>
                )}
            </ul>
        </div>
    );
}

function Segmented<T extends string>({
    options,
    value,
    onChange,
    label
}: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
    label: string;
}) {
    return (
        <div className={styles.seg} role="group" aria-label={label}>
            {options.map((o) => (
                <button key={o.value} type="button" className={cx(styles.segBtn, o.value === value && styles.segOn)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/** Ordine delle schede nella striscia mobile: Pro davanti, Base si intravede a destra. */
const MOBILE_ORDER: PlanKey[] = ["pro", "base"];

/**
 * Mobile: le due schede in una striscia che scorre col dito (scroll-snap),
 * la scheda in vista letta con un IntersectionObserver per i pallini e la
 * frase sopra. Da desktop la striscia è la riga delle due schede.
 */
function usePlanInView(strip: RefObject<HTMLDivElement | null>, onPlan: (p: PlanKey) => void) {
    useEffect(() => {
        const root = strip.current;
        if (!root || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    const p = (e.target as HTMLElement).dataset.plan as PlanKey | undefined;
                    if (e.isIntersecting && p) onPlan(p);
                }
            },
            { root, threshold: 0.6 }
        );
        root.querySelectorAll("[data-plan]").forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, [strip, onPlan]);
}

/** 8 · Quanto costa: mensile/annuale; su mobile le due schede scorrono, Pro davanti. */
export default function Pricing() {
    const [annual, setAnnual] = useState(false);
    const [plan, setPlan] = useState<PlanKey>("pro");
    const strip = useRef<HTMLDivElement>(null);
    usePlanInView(strip, setPlan);

    const goTo = (p: PlanKey) => {
        const el = strip.current?.querySelector<HTMLElement>(`[data-plan="${p}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    };

    return (
        <Section id="prezzi" tone="lilla" labelledBy="landing-pricing-title">
            <Reveal className={styles.head}>
                <HandNote size="lg" className={styles.handNote}>{PRICING.note}</HandNote>
                <SplitHeading id="landing-pricing-title" title={PRICING.title} size="section" className={styles.title} />
                <p className={styles.anchor}>
                    <span className={styles.anchorDesktop}>{PRICING.plans.base.anchor}</span>
                    <span className={styles.anchorMobile}>{PRICING.plans[plan].anchor}</span>
                </p>
                <Segmented
                    label={PRICING.intervalsLabel}
                    value={annual ? "year" : "month"}
                    onChange={(v) => setAnnual(v === "year")}
                    options={[
                        { value: "month", label: PRICING.intervals.month },
                        { value: "year", label: PRICING.intervals.year }
                    ]}
                />
            </Reveal>

            <Reveal className={styles.cards} variant="cards">
                <div ref={strip} className={styles.strip}>
                    <PlanCard plan="base" annual={annual} printer={false} />
                    <PlanCard plan="pro" annual={annual} printer />
                </div>
            </Reveal>
            <div className={styles.dots} role="group" aria-label={PRICING.plansLabel}>
                {MOBILE_ORDER.map((p) => (
                    <button
                        key={p}
                        type="button"
                        className={cx(styles.dot, p === plan && styles.dotOn)}
                        aria-pressed={p === plan}
                        aria-label={PRICING.plans[p].name}
                        onClick={() => goTo(p)}
                    />
                ))}
            </div>

            <p className={styles.footnote}>{PRICING.footnote}</p>
        </Section>
    );
}
