import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Rocket, Tag, Utensils, type LucideIcon } from "lucide-react";
import { Logo } from "@components/ui/Logo/Logo";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { FAQ, type FaqGroupIcon } from "@pages/CampaignLanding/content/landing";
import { COMPANY } from "@/config/company";
import styles from "./Faq.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

const COPIED_MS = 1800;

const GROUP_ICONS: Record<FaqGroupIcon, LucideIcon> = { rocket: Rocket, utensils: Utensils, tag: Tag };

/** Indice in `FAQ.items` della prima domanda di ogni gruppo. */
const GROUP_START = FAQ.groups.map((_, g) => FAQ.groups.slice(0, g).reduce((n, group) => n + group.items.length, 0));

/** Copia negli appunti; l'icona diventa una spunta e compare «Copiato» per 1,8 s. */
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef(0);

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const copy = () => {
        navigator.clipboard?.writeText(text).catch(() => undefined);
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    };

    return (
        <span className={styles.copyWrap}>
            <button type="button" className={cx(styles.copy, copied && styles.copied)} aria-label={FAQ.copy} onClick={copy}>
                <svg className={styles.icCopy} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="12" height="12" rx="2.5" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <svg className={styles.icOk} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            </button>
            <span className={styles.tip} aria-hidden="true">
                {FAQ.copied}
            </span>
            <span className={styles.srOnly} role="status">
                {copied ? FAQ.copied : ""}
            </span>
        </span>
    );
}

/**
 * 10 · Domande, in breve: pill dei gruppi (tablist) sopra la fisarmonica (una
 * domanda aperta alla volta) + riquadro contatto. Tutti i pannelli stanno
 * nell'HTML prerenderizzato; quelli inattivi con `hidden`, mai smontati.
 */
export default function Faq() {
    const [tab, setTab] = useState(0);
    const [open, setOpen] = useState(0);
    const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
    const email = COMPANY.contact.info;

    const select = (g: number) => {
        if (g === tab) return;
        setTab(g);
        setOpen(GROUP_START[g]);
    };

    // Frecce sinistra/destra (e Home/Fine) tra le pill: il fuoco segue la scelta.
    const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
        const last = FAQ.groups.length - 1;
        const next =
            e.key === "ArrowRight" ? (tab === last ? 0 : tab + 1)
            : e.key === "ArrowLeft" ? (tab === 0 ? last : tab - 1)
            : e.key === "Home" ? 0
            : e.key === "End" ? last
            : null;
        if (next === null) return;
        e.preventDefault();
        select(next);
        tabsRef.current[next]?.focus();
    };

    return (
        <Section id="faq" tone="lilla" labelledBy="landing-faq-title">
            <Reveal className={styles.head}>
                <HandNote size="lg" className={styles.handNote}>{FAQ.note}</HandNote>
                <SplitHeading id="landing-faq-title" title={FAQ.title} size="section" />
                <p className={styles.lede}>{FAQ.lede}</p>
            </Reveal>
            <div className={styles.body}>
                <div className={styles.tabs} role="tablist" aria-label={FAQ.groupsLabel}>
                    {FAQ.groups.map((group, g) => {
                        const Icon = GROUP_ICONS[group.icon];
                        const active = g === tab;
                        return (
                            <button
                                key={group.id}
                                ref={(el) => {
                                    tabsRef.current[g] = el;
                                }}
                                type="button"
                                role="tab"
                                id={`landing-faq-tab-${group.id}`}
                                aria-selected={active}
                                aria-controls={`landing-faq-panel-${group.id}`}
                                tabIndex={active ? 0 : -1}
                                className={cx(styles.tab, active && styles.tabActive)}
                                onClick={() => select(g)}
                                onKeyDown={onTabKey}
                            >
                                <span className={styles.tabTop}>
                                    <Icon className={styles.tabIcon} size={16} strokeWidth={2} aria-hidden="true" />
                                    <span className={styles.tabCount}>{group.items.length}</span>
                                </span>
                                <span className={styles.tabLabel}>{group.label}</span>
                            </button>
                        );
                    })}
                </div>

                {FAQ.groups.map((group, g) => (
                    <div
                        key={group.id}
                        id={`landing-faq-panel-${group.id}`}
                        role="tabpanel"
                        aria-labelledby={`landing-faq-tab-${group.id}`}
                        hidden={g !== tab}
                        className={styles.list}
                    >
                        {group.items.map((item, k) => {
                            const i = GROUP_START[g] + k;
                            const isOpen = i === open;
                            const id = `landing-faq-${i}`;
                            return (
                                <div key={item.q} className={styles.item}>
                                    <h3 className={styles.qWrap}>
                                        <button
                                            type="button"
                                            className={styles.q}
                                            aria-expanded={isOpen}
                                            aria-controls={id}
                                            onClick={() => setOpen(isOpen ? -1 : i)}
                                        >
                                            <span className={styles.qText}>{item.q}</span>
                                            <span className={cx(styles.plus, isOpen && styles.plusOpen)} aria-hidden="true">
                                                {/* «+» chiuso, «−» aperto: il tratto verticale si chiude sul centro */}
                                                <svg className={styles.plusIcon} width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" focusable="false">
                                                    <path d="M1 7h12" />
                                                    <path className={styles.plusBar} d="M7 1v12" />
                                                </svg>
                                            </span>
                                        </button>
                                    </h3>
                                    <div id={id} className={cx(styles.a, isOpen && styles.aOpen)} role="region" aria-label={item.q}>
                                        <div className={styles.aInner}>
                                            <p className={styles.aText}>{item.a}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}

                <div className={styles.contact}>
                    <div className={styles.contactInner}>
                        <span className={styles.mark} aria-hidden="true">
                            <Logo variant="icon" color="mono-white" className={styles.markIcon} alt="" />
                        </span>
                        <div className={styles.contactText}>
                            <p className={styles.more}>{FAQ.more}</p>
                            <div className={styles.mailRow}>
                                <a className={styles.mail} href={`mailto:${email}`}>
                                    {email}
                                </a>
                                <CopyButton text={email} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Section>
    );
}
