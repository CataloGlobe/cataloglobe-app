import { useState } from "react";
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
        <div className={cx(styles.card, isPro && styles.cardPro)}>
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

function Check({ on }: { on: boolean }) {
    return on ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    ) : (
        <span className={styles.cmpDash} aria-hidden="true" />
    );
}

/**
 * Mobile: una scheda sola che confronta i due piani. Due colonne strette a
 * destra, Base e Pro, con nome e prezzo in testa; la colonna Pro ha un fondo
 * viola unico dall'alto in basso. Sotto le voci comuni, poi quelle solo Pro.
 * Un pulsante solo in fondo. Da desktop restano le due schede (PlanCard).
 */
function CompareCard({ annual }: { annual: boolean }) {
    const row = (text: string, base: boolean, pro: boolean) => (
        <tr key={text}>
            <th scope="row" className={styles.cmpText}>
                {text}
            </th>
            {[base, pro].map((on, i) => (
                <td key={i} className={cx(styles.cmpCell, i === 1 && styles.cmpCellPro)}>
                    <Check on={on} />
                    <span className={styles.srOnly}>{on ? PRICING.included : PRICING.excluded}</span>
                </td>
            ))}
        </tr>
    );

    return (
        <div className={styles.compare}>
            <div className={styles.cmpBody}>
                <span className={styles.cmpProBg} aria-hidden="true" />
                <table className={styles.cmpTable}>
                    <thead>
                        <tr>
                            <th scope="col" className={styles.cmpCorner}>
                                <span className={styles.srOnly}>{PRICING.compareFeatures}</span>
                            </th>
                            {(["base", "pro"] as const).map((key) => {
                                const p = PRICING.plans[key];
                                return (
                                    <th key={key} scope="col" className={cx(styles.cmpPlan, key === "pro" && styles.cmpPlanPro)}>
                                        {key === "pro" && <span className={styles.cmpBadge}>{PRICING.recommended}</span>}
                                        <span className={styles.cmpName}>{p.name}</span>
                                        <span className={styles.cmpPrice}>{annual ? p.year : p.month}</span>
                                        <span className={styles.cmpPeriod}>{annual ? PRICING.period.year : PRICING.period.month}</span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>{PRICING.items.map((t) => row(t, true, true))}</tbody>
                    <tbody>
                        <tr>
                            <th scope="colgroup" colSpan={3} className={styles.cmpGroup}>
                                {PRICING.compareProOnly}
                            </th>
                        </tr>
                        {PRICING.proItems.map((t) => row(t, false, true))}
                    </tbody>
                </table>
            </div>
            <p className={styles.cmpNote}>
                <b>{PRICING.printer.label}</b>
                {PRICING.printer.text}
            </p>
            <div className={styles.cmpFoot}>
                <LandingCta placement="pricing-pro" shape="plan" look="dark" className={styles.cmpCta} />
                <p className={styles.cmpTrial}>{PRICING.trial}</p>
            </div>
        </div>
    );
}

/** 8 · Quanto costa: mensile/annuale; su mobile la tabella di confronto, da desktop le due schede. */
export default function Pricing() {
    const [annual, setAnnual] = useState(false);

    return (
        <Section id="prezzi" tone="lilla" labelledBy="landing-pricing-title">
            <Reveal className={styles.head}>
                <HandNote size="lg" className={styles.handNote}>{PRICING.note}</HandNote>
                <SplitHeading id="landing-pricing-title" title={PRICING.title} size="section" className={styles.title} />
                <p className={styles.anchor}>{PRICING.plans.base.anchor}</p>
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

            <Reveal className={styles.compareWrap}>
                <CompareCard annual={annual} />
            </Reveal>
            <Reveal className={styles.cards} variant="cards">
                <PlanCard plan="base" annual={annual} printer={false} />
                <PlanCard plan="pro" annual={annual} printer />
            </Reveal>

            <p className={styles.footnote}>{PRICING.footnote}</p>
        </Section>
    );
}
