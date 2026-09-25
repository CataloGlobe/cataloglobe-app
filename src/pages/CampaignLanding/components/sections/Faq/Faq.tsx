import { useEffect, useRef, useState } from "react";
import { Logo } from "@components/ui/Logo/Logo";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, SplitHeading } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { FAQ } from "@pages/CampaignLanding/content/landing";
import { COMPANY } from "@/config/company";
import styles from "./Faq.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

const COPIED_MS = 1800;

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

/** 10 · Domande, in breve: fisarmonica (una aperta alla volta) + riquadro contatto. */
export default function Faq() {
    const [open, setOpen] = useState(0);
    const email = COMPANY.contact.info;

    return (
        <Section id="faq" tone="lilla" labelledBy="landing-faq-title">
            <Reveal className={styles.head}>
                <HandNote size="lg" className={styles.handNote}>{FAQ.note}</HandNote>
                <SplitHeading id="landing-faq-title" title={FAQ.title} size="section" />
                <p className={styles.lede}>{FAQ.lede}</p>
            </Reveal>
            <div className={styles.body}>
                <div className={styles.list}>
                    {FAQ.items.map((item, i) => {
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
                                            +
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
