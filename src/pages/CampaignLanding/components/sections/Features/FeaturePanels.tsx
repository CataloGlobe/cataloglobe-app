import type { ReactNode } from "react";
import { FEATURES, type FeatureKey } from "@pages/CampaignLanding/content/landing";
import styles from "./FeaturePanels.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

function Star() {
    return (
        <svg className={styles.star} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
        </svg>
    );
}

function Stars({ label }: { label: string }) {
    return (
        <span className={styles.stars} role="img" aria-label={label}>
            {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} />
            ))}
        </span>
    );
}

/** Scena + illustrazione + didascalia: lo scheletro comune dei nove pannelli. */
function Panel({ scene, caption, children }: { scene: string; caption: ReactNode; children: ReactNode }) {
    return (
        <div>
            <p className={styles.scene}>{scene}</p>
            {children}
            <p className={styles.caption}>{caption}</p>
        </div>
    );
}

/** Freccia fra «lo vede il cliente» e «lo vedi tu»: verticale su mobile, orizzontale da desktop. */
function Connector() {
    return <span className={styles.connector} aria-hidden="true" />;
}

function Orders() {
    const o = FEATURES.orders;
    return (
        <Panel scene={o.scene} caption={o.caption}>
            <div className={styles.flow}>
                <div className={cx(styles.card, styles.flowCard)}>
                    <span className={styles.kicker}>{FEATURES.customerLabel}</span>
                    <span className={styles.cardTitle}>{o.table}</span>
                    <ul className={styles.list}>
                        {o.lines.map((line) => (
                            <li key={line.name} className={styles.lineRow}>
                                <span>{line.name}</span>
                                <span className={styles.qty}>{line.qty}</span>
                            </li>
                        ))}
                    </ul>
                    <div className={styles.total}>
                        <span className={styles.totalLabel}>{o.totalLabel}</span>
                        <span className={styles.totalValue}>{o.total}</span>
                    </div>
                    <span className={styles.sent}>{o.sentLabel}</span>
                </div>

                <Connector />

                <div className={styles.flowYou}>
                    <p className={styles.kickerYou}>{o.youLabel}</p>
                    <div className={styles.printer} aria-hidden="true">
                        <div className={styles.printerHead}>
                            <span className={styles.printerLabel}>{o.printerLabel}</span>
                            <span className={styles.led} />
                        </div>
                        <div className={styles.printerSlot} />
                        <div className={styles.paperWindow}>
                            <div className={styles.ticket}>
                                <div className={styles.ticketVenue}>{o.ticket.venue}</div>
                                <div className={styles.ticketRule} />
                                <div className={styles.ticketMeta}>
                                    <span>{o.ticket.table}</span>
                                    <span>{o.ticket.time}</span>
                                </div>
                                <div className={styles.ticketRule} />
                                {o.ticket.lines.map((line) => (
                                    <div key={line.name} className={styles.ticketLine}>
                                        <span className={styles.ticketQty}>{line.qty}</span>
                                        <span>{line.name}</span>
                                    </div>
                                ))}
                                <div className={styles.ticketRule} />
                                <div className={styles.ticketNumber}>{o.ticket.number}</div>
                            </div>
                            <div className={styles.ticketEdge} />
                        </div>
                    </div>
                </div>
            </div>
        </Panel>
    );
}

function Reservations() {
    const r = FEATURES.reservations;
    return (
        <Panel
            scene={r.scene}
            caption={
                <>
                    {r.caption.before}
                    <strong>{r.caption.strong}</strong>
                    {r.caption.after}
                </>
            }
        >
            <div className={styles.flow}>
                <div className={cx(styles.card, styles.flowCard)}>
                    <span className={styles.kicker}>{FEATURES.customerLabel}</span>
                    <span className={styles.cardTitle}>{r.formTitle}</span>
                    <div className={styles.party}>
                        <span className={styles.partyLabel}>{r.partyLabel}</span>
                        {r.partySizes.map((size) => (
                            <span key={size} className={cx(styles.partyChip, size === r.partySelected && styles.partyChipOn)}>
                                {size}
                            </span>
                        ))}
                    </div>
                    <div className={styles.fieldRow}>
                        <span className={styles.fakeField}>{r.date}</span>
                        <span className={styles.fakeField}>{r.time}</span>
                    </div>
                    <span className={cx(styles.fakeField, styles.fakeFieldFull)}>{r.guest}</span>
                    <span className={styles.sent}>{r.sentLabel}</span>
                </div>

                <Connector />

                <div className={styles.flowYou}>
                    <p className={styles.kickerYou}>{FEATURES.youLabel}</p>
                    <div className={cx(styles.card, styles.cardTight)}>
                        <span className={styles.kicker}>{r.agendaTitle}</span>
                        <ul className={styles.agenda}>
                            {r.agenda.map((row) => (
                                <li key={row.time} className={cx(styles.agendaRow, row.isNew && styles.agendaRowNew)}>
                                    <span className={styles.agendaTime}>{row.time}</span>
                                    <span className={styles.agendaName}>{row.name}</span>
                                    <span className={styles.agendaCovers}>{row.covers}</span>
                                    <span className={cx(styles.agendaStatus, row.isNew && styles.agendaStatusNew)}>
                                        {row.status}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className={cx(styles.card, styles.cardTight, styles.stacked)}>
                        <span className={styles.kicker}>{r.guestsTitle}</span>
                        <ul className={styles.guests}>
                            {r.guests.map((g) => (
                                <li key={g.name} className={cx(styles.guestRow, g.isNew && styles.guestRowNew)}>
                                    <span>{g.name}</span>
                                    <span className={styles.guestVisits}>{g.visits}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </Panel>
    );
}

function Reviews() {
    const r = FEATURES.reviews;
    return (
        <Panel scene={r.scene} caption={r.caption}>
            <div className={styles.pair}>
                <div className={cx(styles.card, styles.cardSmall)}>
                    <span className={styles.kicker}>{FEATURES.customerLabel}</span>
                    <span className={styles.question}>{r.question}</span>
                    <Stars label={r.starsLabel} />
                    <span className={styles.draft}>{r.draft}</span>
                    <span className={styles.send}>{r.send}</span>
                </div>
                <div className={cx(styles.card, styles.cardSmall)}>
                    <span className={styles.kickerYouInline}>{FEATURES.youLabel}</span>
                    <div className={styles.reviewHead}>
                        <Stars label={r.starsLabel} />
                        <span className={styles.when}>{r.when}</span>
                    </div>
                    <p className={styles.quote}>{r.quote}</p>
                    <p className={styles.author}>{r.author}</p>
                    <span className={styles.hint}>{r.hint}</span>
                </div>
            </div>
        </Panel>
    );
}

function Venues() {
    const v = FEATURES.venues;
    return (
        <Panel scene={v.scene} caption={v.caption}>
            <div className={cx(styles.card, styles.cardPad)}>
                <ul className={styles.list}>
                    {v.rows.map((row) => (
                        <li key={row.venue} className={styles.venueRow}>
                            <span className={styles.venueName}>{row.venue}</span>
                            <span className={styles.venueMenu}>{row.menu}</span>
                            <span className={styles.venueHours}>{row.hours}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className={styles.inside}>
                <span className={styles.kickerAzione}>{v.insideLabel}</span>
                <div className={styles.chips}>
                    {v.inside.map((chip) => (
                        <span key={chip} className={styles.chip}>
                            {chip}
                        </span>
                    ))}
                </div>
            </div>
        </Panel>
    );
}

function Team() {
    const t = FEATURES.team;
    return (
        <Panel scene={t.scene} caption={t.caption}>
            <div className={cx(styles.card, styles.cardPad)}>
                <span className={styles.kicker}>{t.title}</span>
                <ul className={styles.people}>
                    {t.people.map((p) => (
                        <li key={p.name} className={styles.person}>
                            <div className={styles.personHead}>
                                <span className={styles.personName}>{p.name}</span>
                                <span className={styles.role}>{p.role}</span>
                                <span className={styles.personWhere}>{p.where}</span>
                            </div>
                            <span className={styles.personCan}>{p.can}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </Panel>
    );
}

function Hours() {
    const h = FEATURES.hours;
    return (
        <Panel scene={h.scene} caption={h.caption}>
            <div className={cx(styles.card, styles.cardPad)}>
                <div className={styles.ruleHead}>
                    <span className={styles.kicker}>{h.ruleTitle}</span>
                    <span className={styles.live}>
                        <span className={styles.liveDot} aria-hidden="true" />
                        {h.live}
                    </span>
                </div>
                <dl className={styles.rule}>
                    {h.rule.map((row) => (
                        <div key={row.key} className={styles.ruleRow}>
                            <dt className={styles.ruleKey}>{row.key}</dt>
                            <dd className={cx(styles.ruleValue, row.strong && styles.ruleValueStrong)}>{row.value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
            <div className={cx(styles.card, styles.cardSmall, styles.stacked)}>
                <span className={styles.kicker}>{h.phoneTitle}</span>
                <div className={styles.soldOutRow}>
                    <s className={styles.soldOutDish}>{h.soldOutDish}</s>
                    <span className={styles.soldOut}>{h.soldOut}</span>
                    <span className={styles.toggle} aria-hidden="true" />
                </div>
                <p className={styles.soldOutNote}>{h.soldOutNote}</p>
            </div>
        </Panel>
    );
}

function Languages() {
    const l = FEATURES.languages;
    return (
        <Panel scene={l.scene} caption={l.caption}>
            <div className={cx(styles.card, styles.cardPad)}>
                <div className={styles.dishHead}>
                    <span className={styles.dishName}>{l.dish}</span>
                    <span className={styles.dishPrice}>{l.price}</span>
                </div>
                <ul className={styles.list}>
                    {l.translations.map((t) => (
                        <li key={t.lang} className={styles.translation} lang={t.lang.toLowerCase()}>
                            <span className={styles.lang}>{t.lang}</span>
                            <span className={styles.translationText}>{t.text}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <p className={styles.available}>{l.available}</p>
        </Panel>
    );
}

function Styles() {
    const s = FEATURES.styles;
    return (
        <Panel scene={s.scene} caption={s.caption}>
            <div className={styles.pair}>
                {s.variants.map((variant) => {
                    const night = variant.tone === "night";
                    return (
                        <div
                            key={variant.label}
                            className={cx(styles.card, styles.styleCard, night && styles.styleCardNight)}
                            data-demo={night ? "molo" : undefined}
                        >
                            <span className={styles.kicker}>{variant.label}</span>
                            <div className={styles.styleName}>
                                <span>{s.venue}</span>
                            </div>
                            <ul className={styles.list}>
                                {s.dishes.map((d) => (
                                    <li key={d.name} className={styles.styleRow}>
                                        <span className={styles.styleDish}>{d.name}</span>
                                        <span className={styles.stylePrice}>{d.price}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className={styles.styleSlot}>{s.slot}</p>
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
}

function Stories() {
    const s = FEATURES.stories;
    return (
        <Panel scene={s.scene} caption={s.caption}>
            <div className={cx(styles.card, styles.cardSmall)}>
                <span className={styles.storyDish}>{s.dish}</span>
                <span className={styles.storyDesc}>{s.dishDesc}</span>
                <div className={styles.behind}>
                    <span className={styles.kickerTerra}>{s.behindLabel}</span>
                    <span className={styles.behindTitle}>{s.behindTitle}</span>
                    <span className={styles.behindRead}>{s.read}</span>
                </div>
            </div>
            <div className={cx(styles.card, styles.cardSmall, styles.stacked)}>
                <span className={styles.kicker}>{s.storyLabel}</span>
                <span className={styles.storyTitle}>{s.storyTitle}</span>
                <span className={styles.storyBody}>{s.storyBody}</span>
            </div>
        </Panel>
    );
}

const PANELS: Record<FeatureKey, () => ReactNode> = {
    orders: Orders,
    reservations: Reservations,
    reviews: Reviews,
    venues: Venues,
    team: Team,
    hours: Hours,
    languages: Languages,
    styles: Styles,
    stories: Stories
};

/** Il pannello della voce scelta, fermo nello stato che racconta la scena. */
export default function FeaturePanel({ feature }: { feature: FeatureKey }) {
    const Current = PANELS[feature];
    return <Current />;
}
