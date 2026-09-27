import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import PublicSheet from "@components/PublicCollectionView/PublicSheet/PublicSheet";
import Section from "@pages/CampaignLanding/components/Section/Section";
import { HandNote, UnderlinedText } from "@pages/CampaignLanding/components/kit/Kit";
import Reveal from "@pages/CampaignLanding/components/kit/Reveal";
import { useInView } from "@pages/CampaignLanding/hooks/useInView";
import { DEMOS, type DemoKey, type DemoVenue } from "@pages/CampaignLanding/content/landing";
import molo280 from "@pages/CampaignLanding/assets/demos/il-molo-34-280.webp";
import molo560 from "@pages/CampaignLanding/assets/demos/il-molo-34-560.webp";
import pausa280 from "@pages/CampaignLanding/assets/demos/la-pausa-280.webp";
import pausa560 from "@pages/CampaignLanding/assets/demos/la-pausa-560.webp";
import velvet280 from "@pages/CampaignLanding/assets/demos/velvet-garden-280.webp";
import velvet560 from "@pages/CampaignLanding/assets/demos/velvet-garden-560.webp";
import styles from "./Demos.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * Screenshot della pagina pubblica vera, 1x e 2x per lo schermo del telefono
 * (280 px sul desktop). Si rifanno con `npm run landing:demo-screenshots`.
 */
const SCREENS: Record<DemoKey, string> = {
    molo: `${molo280} 280w, ${molo560} 560w`,
    pausa: `${pausa280} 280w, ${pausa560} 560w`,
    velvet: `${velvet280} 280w, ${velvet560} 560w`
};
const SCREEN_FALLBACK: Record<DemoKey, string> = { molo: molo280, pausa: pausa280, velvet: velvet280 };

/**
 * Il telefono con lo screenshot del locale scelto. Lazy: la sezione è sotto
 * l'hero. Gli altri due locali si montano (e si scaricano) solo quando la
 * sezione entra nello schermo, così il cambio è una dissolvenza e non un buco.
 */
function PhonePreview({ selected, preload }: { selected: number; preload: boolean }) {
    return (
        <div className={styles.phone}>
            <div className={styles.screen} data-demo={DEMOS.venues[selected].key}>
                {DEMOS.venues.map((v, i) => {
                    const on = i === selected;
                    if (!on && !preload) return null;
                    return (
                        <img
                            key={v.key}
                            className={cx(styles.shot, on && styles.shotOn)}
                            src={SCREEN_FALLBACK[v.key]}
                            srcSet={SCREENS[v.key]}
                            sizes="(min-width: 1024px) 280px, 230px"
                            width={280}
                            height={580}
                            loading="lazy"
                            decoding="async"
                            alt={on ? DEMOS.screenAlt(v.name) : ""}
                            aria-hidden={on ? undefined : true}
                        />
                    );
                })}
                <span className={styles.notch} aria-hidden="true" />
            </div>
        </div>
    );
}

/** Il percorso mostrato nell'iframe è ancora la pagina del locale (anche con la lingua, `/slug/en`). */
const isVenuePath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

/**
 * La pagina pubblica nell'iframe (stessa origine). Se al posto del menù
 * compare l'errore di caricamento o il 404 dell'app, oppure l'iframe esce
 * dalla pagina del locale, l'iframe lascia il posto al messaggio del foglio:
 * niente «Torna alla home» che naviga dentro lo sheet.
 * Segnali letti: `#not-found-title` (NotFound), `#root > [role=alert]`
 * (stato error di PublicCollectionPage), `location.pathname`.
 */
function DemoFrame({ path, title }: { path: string; title: string }) {
    const [failed, setFailed] = useState(false);
    const stopWatching = useRef<() => void>(() => undefined);

    useEffect(() => () => stopWatching.current(), []);

    const onLoad = (e: SyntheticEvent<HTMLIFrameElement>) => {
        stopWatching.current();
        let win: Window | null = null;
        let doc: Document | null = null;
        try {
            win = e.currentTarget.contentWindow;
            doc = e.currentTarget.contentDocument;
        } catch {
            return; // altra origine: niente da leggere, resta la pagina
        }
        if (!win || !doc) return;
        const frameWin = win;
        const frameDoc = doc;
        const check = () => {
            const off = !isVenuePath(frameWin.location.pathname, path);
            const notFound = frameDoc.getElementById("not-found-title") !== null;
            const error = frameDoc.querySelector("#root > [role='alert']") !== null;
            if (off || notFound || error) {
                stopWatching.current();
                setFailed(true);
            }
        };
        const observer = new MutationObserver(check);
        observer.observe(frameDoc.documentElement, { childList: true, subtree: true });
        stopWatching.current = () => observer.disconnect();
        check();
    };

    if (failed) {
        return (
            <div className={styles.sheetFailed} role="status">
                <p className={styles.sheetFailedTitle}>{DEMOS.sheetFailed.title}</p>
                <p className={styles.sheetFailedText}>{DEMOS.sheetFailed.text}</p>
            </div>
        );
    }

    return <iframe className={styles.frame} src={path} title={title} loading="eager" onLoad={onLoad} />;
}

/**
 * La pagina pubblica vera del locale, nello sheet (mai in una scheda nuova, SPEC §2).
 * Niente link «apri in una nuova scheda»: nelle webview in-app porta fuori
 * dalla landing senza ritorno.
 */
function DemoSheet({ venue, open, onClose }: { venue: DemoVenue; open: boolean; onClose: () => void }) {
    const path = `/${venue.slug}`;
    return (
        <div className={styles.sheetScope}>
            <PublicSheet
                isOpen={open}
                onClose={onClose}
                ariaLabel={venue.name}
                contentKey={venue.key}
                headerContent={
                    <div className={styles.sheetHead}>
                        <span className={styles.sheetTitle}>
                            <span className={styles.sheetName}>{venue.name}</span>
                            <span className={styles.sheetUrl}>
                                {DEMOS.publicHost}/{venue.slug}
                            </span>
                        </span>
                        <button type="button" className={styles.sheetClose} aria-label={DEMOS.sheetClose} onClick={onClose}>
                            ✕
                        </button>
                    </div>
                }
            >
                <div className={styles.sheetBody} data-demo={venue.key}>
                    {open && <DemoFrame key={path} path={path} title={venue.name} />}
                </div>
            </PublicSheet>
        </div>
    );
}

/** 7 · «Prova tu»: tre locali di esempio, il telefono e il QR. */
export default function Demos() {
    const [selected, setSelected] = useState(0);
    const [open, setOpen] = useState(false);
    const venue = DEMOS.venues[selected];
    const gridRef = useRef<HTMLDivElement>(null);
    const preload = useInView(gridRef, 0);

    return (
        <Section tone="white" className={styles.section} labelledBy="landing-demos-title">
            <div ref={gridRef} className={styles.grid}>
                <Reveal className={styles.phoneCol}>
                    <PhonePreview selected={selected} preload={preload} />
                </Reveal>
                <Reveal className={styles.textCol}>
                    <HandNote size="lg" className={styles.handNote}>{DEMOS.note}</HandNote>
                    <h2 id="landing-demos-title" className={styles.title}>
                        <UnderlinedText title={DEMOS.title} className={styles.titleHl} />
                    </h2>
                    <p className={styles.lede}>{DEMOS.lede}</p>
                    <div className={styles.mobilePhone}>
                        <PhonePreview selected={selected} preload={preload} />
                    </div>
                    <div className={styles.list}>
                        {DEMOS.venues.map((v, i) => {
                            const on = i === selected;
                            return (
                                <button
                                    key={v.key}
                                    type="button"
                                    className={cx(styles.venue, on && styles.venueOn)}
                                    aria-pressed={on}
                                    aria-haspopup={on ? "dialog" : undefined}
                                    onClick={() => (on ? setOpen(true) : setSelected(i))}
                                >
                                    <span className={styles.thumb} data-demo={v.key} aria-hidden="true">
                                        <span className={styles.thumbTitle} />
                                        <span className={styles.thumbLine} />
                                        <span className={cx(styles.thumbLine, styles.thumbLineShort)} />
                                    </span>
                                    <span className={styles.venueText}>
                                        <span className={styles.venueName}>{v.name}</span>
                                        <span className={styles.venueKind}>{v.kind}</span>
                                    </span>
                                    {on && <span className={styles.open}>{DEMOS.open}</span>}
                                </button>
                            );
                        })}
                    </div>
                    <div className={styles.qrCard}>
                        <span className={styles.qr}>
                            <QRCodeSVG value={`${DEMOS.publicBaseUrl}${venue.slug}`} size={72} fgColor="currentColor" bgColor="transparent" />
                        </span>
                        <span>
                            <span className={styles.qrName}>{venue.name}</span>
                            <span className={styles.qrCaption}>{DEMOS.qrCaption}</span>
                        </span>
                    </div>
                </Reveal>
            </div>
            <DemoSheet venue={venue} open={open} onClose={() => setOpen(false)} />
        </Section>
    );
}
