import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Section from "@pages/CampaignLanding/components/Section/Section";
import SectionHeader from "@pages/CampaignLanding/components/SectionHeader/SectionHeader";
import { DEMOS } from "@pages/CampaignLanding/content/landing";
import styles from "./Demos.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * 6 · I tre locali demo. Toccarne uno cambia l'anteprima e il QR; aprire la
 * pagina vera (sheet dentro la landing, consegna §5.1) è Passata 2. I colori
 * di ogni locale arrivano dai token --ld-demo-* via data-demo.
 */
export default function Demos() {
    const [selected, setSelected] = useState(0);
    const venue = DEMOS.venues[selected];

    return (
        <Section tone="paper">
            <SectionHeader title={DEMOS.title} lede={DEMOS.lede} />
            <p className={styles.honesty}>{DEMOS.honesty}</p>

            <div className={styles.layout}>
                <div className={styles.list}>
                    {DEMOS.venues.map((v, i) => (
                        <button
                            key={v.key}
                            type="button"
                            className={cx(styles.venue, i === selected && styles.venueOn)}
                            aria-pressed={i === selected}
                            data-demo={v.key}
                            onClick={() => setSelected(i)}
                        >
                            <span className={styles.initial} aria-hidden="true">
                                {v.initial}
                            </span>
                            <span className={styles.venueText}>
                                <span className={styles.venueName}>{v.name}</span>
                                <span className={styles.venueAddress}>{v.address}</span>
                            </span>
                            {i === selected && <span className={styles.open}>{DEMOS.open}</span>}
                        </button>
                    ))}
                </div>

                <div className={styles.phoneWrap}>
                    <div className={styles.phone} data-demo={venue.key}>
                        <div className={styles.screen}>
                            <div className={styles.cover}>
                                <div className={styles.coverText}>
                                    <span className={cx(styles.phoneName, venue.serif && styles.serif)}>
                                        {venue.name}
                                    </span>
                                    <span className={styles.phoneKind}>{venue.kind}</span>
                                </div>
                            </div>
                            <div className={styles.cats}>
                                {venue.categories.map((cat, i) => (
                                    <span key={cat} className={cx(styles.cat, i === 0 && styles.catOn)}>
                                        {cat}
                                    </span>
                                ))}
                            </div>
                            <div className={styles.featured}>
                                <span className={styles.featuredLabel}>{DEMOS.featuredLabel}</span>
                                <div className={styles.featuredRow}>
                                    <span className={cx(styles.phoneName, venue.serif && styles.serif)}>
                                        {venue.featured.name}
                                    </span>
                                    <span className={styles.price}>{venue.featured.price}</span>
                                </div>
                            </div>
                            <ul className={styles.dishes}>
                                {venue.dishes.map((d) => (
                                    <li key={d.name} className={styles.dish}>
                                        <span>{d.name}</span>
                                        <span className={styles.price}>{d.price}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                <div className={styles.qrCard}>
                    <div className={styles.qr} aria-hidden="true">
                        <QRCodeSVG
                            value={`${DEMOS.publicBaseUrl}${venue.slug}`}
                            size={88}
                            fgColor="currentColor"
                            bgColor="transparent"
                            className={styles.qrSvg}
                        />
                    </div>
                    <div>
                        <span className={styles.qrName}>{venue.name}</span>
                        <span className={styles.qrCaption}>{DEMOS.qrCaption}</span>
                    </div>
                </div>
            </div>
        </Section>
    );
}
