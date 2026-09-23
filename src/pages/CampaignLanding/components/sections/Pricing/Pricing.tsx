import { useState } from "react";
import { formatEuroWholeCents, MONTHS_PER_INTERVAL } from "@utils/planPricing";
import type { BillingInterval } from "@/types/plan";
import LandingCta from "@pages/CampaignLanding/components/LandingCta/LandingCta";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { PRICING, type PlanKey } from "@pages/CampaignLanding/content/landing";
import styles from "./Pricing.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

const INTERVALS: BillingInterval[] = ["month", "year"];
const PLANS: PlanKey[] = ["base", "pro"];

function Check() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

function Cross() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

function Segmented<T extends string>({
    label,
    options,
    value,
    onChange,
    className
}: {
    label: string;
    options: { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}) {
    return (
        <div className={cx(styles.segmented, className)} role="group" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    className={cx(styles.segment, o.value === value && styles.segmentOn)}
                    aria-pressed={o.value === value}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function PlanCard({ plan, interval }: { plan: PlanKey; interval: BillingInterval }) {
    const p = PRICING.plans[plan];
    const isPro = plan === "pro";
    const priceCents = interval === "year" ? p.yearCents : p.monthCents;
    const fullYearCents = p.monthCents * MONTHS_PER_INTERVAL.year;

    return (
        <div className={styles.card}>
            <div className={cx(styles.head, isPro ? styles.headPro : styles.headBase)}>
                <span className={styles.sheen} aria-hidden="true" />
                <span className={styles.streak} aria-hidden="true" />
                {isPro && <span className={styles.glowIn} aria-hidden="true" />}
                <div className={styles.headBody}>
                    <div className={styles.planName}>
                        <span className={styles.dot} aria-hidden="true" />
                        {p.name}
                    </div>
                    <div className={styles.priceRow}>
                        <span className={styles.price}>{formatEuroWholeCents(priceCents)}</span>
                        <span className={styles.priceMeta}>
                            {interval === "year" && (
                                <s className={styles.full}>
                                    <span className={styles.srOnly}>{PRICING.fullPriceLabel} </span>
                                    {formatEuroWholeCents(fullYearCents)}
                                </s>
                            )}
                            <span className={styles.period}>{PRICING.period[interval]}</span>
                        </span>
                    </div>
                </div>
            </div>

            <p className={styles.claim}>{p.claim}</p>
            <div className={styles.cta}>
                <LandingCta
                    placement={isPro ? "pricing-pro" : "pricing-base"}
                    look={isPro ? "filled" : "ghost"}
                    size="plan"
                    block
                />
            </div>
            <p className={styles.trial}>{PRICING.trial}</p>

            <div className={styles.divider} />
            <p className={styles.includes}>{PRICING.includes}</p>
            <ul className={styles.items}>
                {PRICING.items.map((item) => {
                    const on = !item.proOnly || isPro;
                    const iconClass = !on ? styles.iconOff : item.proOnly ? styles.iconStrong : styles.iconSoft;
                    return (
                        <li key={item.title} className={cx(styles.item, !on && styles.itemOff)}>
                            <span className={cx(styles.icon, iconClass)}>{on ? <Check /> : <Cross />}</span>
                            <span>
                                <span className={styles.itemTitle}>{item.title}</span>
                                <span className={styles.itemDesc}>{item.desc}</span>
                            </span>
                        </li>
                    );
                })}
            </ul>
            {isPro && <p className={styles.extra}>{PRICING.proExtra}</p>}
        </div>
    );
}

/**
 * 7 · Prezzi. Mobile: un piano alla volta, scelto dal selettore (Pro di
 * default). Desktop: i due piani affiancati, il Pro incorniciato come
 * consigliato. Importi da `content/landing.ts`, formattati con planPricing.
 */
export default function Pricing() {
    const [interval, setBillingInterval] = useState<BillingInterval>("month");
    const [plan, setPlan] = useState<PlanKey>("pro");

    return (
        <Section tone="white" id="prezzi">
            <div className={styles.header}>
                <SectionHeader title={PRICING.title} lede={PRICING.lede} maxWidth={740} />
            </div>

            <Segmented
                label={PRICING.intervalsLabel}
                options={INTERVALS.map((i) => ({ value: i, label: PRICING.intervals[i] }))}
                value={interval}
                onChange={setBillingInterval}
                className={styles.intervals}
            />
            {interval === "year" && <p className={styles.yearlyNote}>{PRICING.yearlyNote}</p>}
            <Segmented
                label={PRICING.plansLabel}
                options={PLANS.map((k) => ({ value: k, label: PRICING.plans[k].name }))}
                value={plan}
                onChange={setPlan}
                className={styles.plans}
            />

            <div className={styles.grid}>
                <div className={cx(styles.col, styles.colBase, plan !== "base" && styles.hiddenMobile)}>
                    <PlanCard plan="base" interval={interval} />
                </div>
                <div className={cx(styles.col, styles.colPro, plan !== "pro" && styles.hiddenMobile)}>
                    <p className={styles.recommended}>{PRICING.recommended}</p>
                    <PlanCard plan="pro" interval={interval} />
                </div>
            </div>

            <p className={styles.footnote}>{PRICING.footnote}</p>
        </Section>
    );
}
