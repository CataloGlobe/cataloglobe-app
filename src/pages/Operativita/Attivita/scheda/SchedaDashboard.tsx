import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Pencil, QrCode as QrIcon, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { QrCode } from "@/components/ui/QrCode/QrCode";
import { buildPublicUrl } from "@/utils/publicUrl";
import { QR_DEFAULT_BG, QR_DEFAULT_FG } from "../components/ActivityQrDrawer";
import {
    DASH_GROUPS,
    HIDDEN_CAPTION,
    PART_CAPTION,
    PART_TITLE,
    ZONE_CARD,
    type SchedaPart
} from "./schedaCopy";
import { partOnPhone, type SchedaFacts } from "./schedaModel";
import { SchedaNow, type NowActions } from "./SchedaNow";
import { SchedaPhone } from "./SchedaPhone";
import { SchedaTile, type TileActions } from "./SchedaTile";
import { useSchedaFollow } from "./useSchedaFollow";
import { usePhoneFit } from "@/hooks/usePhoneFit";
import styles from "./Scheda.module.scss";

interface SchedaDashboardProps {
    facts: SchedaFacts;
    tiles: TileActions;
    now: NowActions;
    onCopyLink: () => void;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** «testo con **grassetto**» → nodi. */
function rich(text: string) {
    return text.split("**").map((piece, i) => (i % 2 ? <b key={i}>{piece}</b> : <span key={i}>{piece}</span>));
}

/**
 * Il cruscotto della Scheda (prototipo C+++ «Scorrono insieme», 2026-10-09):
 * le tessere stanno nello stesso ordine del telefono e il telefono scorre
 * insieme alla scheda. Passando su una tessera la sua parte si accende e la
 * card fissa sopra il telefono dice cos'è; il telefono non si muove.
 */
export function SchedaDashboard({ facts, tiles, now, onCopyLink }: SchedaDashboardProps) {
    const { a } = facts;
    const rootRef = useRef<HTMLDivElement>(null);
    const colRef = useRef<HTMLDivElement>(null);
    const sideRef = useRef<HTMLElement>(null);
    const scrRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const fit = usePhoneFit(sideRef, boxRef, true);
    const [hl, setHl] = useState<SchedaPart | null>(null);
    const zone = useSchedaFollow(rootRef, scrRef, hl !== null);

    // Come nel prototipo: sopra una tessera si accende la sua parte; negli
    // spazi fra le tessere resta l'ultima; sopra il telefono non cambia
    // niente; fuori dalla scheda si spegne.
    useEffect(() => {
        const onOver = (e: MouseEvent) => {
            const target = e.target as Element | null;
            if (!target || !rootRef.current) return;
            if (sideRef.current?.contains(target)) return;
            const t = target.closest<HTMLElement>("[data-k]");
            if (!t && colRef.current?.contains(target)) return;
            const k = t && rootRef.current.contains(t) ? (t.dataset.k as SchedaPart) : null;
            setHl(prev => (prev === k ? prev : k));
        };
        document.addEventListener("mouseover", onOver);
        return () => document.removeEventListener("mouseover", onOver);
    }, []);

    const publicUrl = buildPublicUrl(a.slug);
    const [cardTitle, cardText] = hl
        ? [PART_TITLE[hl], partOnPhone(hl, facts) ? PART_CAPTION[hl] : HIDDEN_CAPTION]
        : ZONE_CARD[zone];

    const coverStyle = a.cover_image ? { backgroundImage: `url("${a.cover_image}")` } : undefined;

    return (
        <div className={styles.root} ref={rootRef}>
            <div className={styles.dash} style={fit.vars}>
                <div className={styles.col} ref={colRef}>
                    <div className={styles.hero}>
                        <button type="button" className={styles.identity} data-k="locale" onClick={() => tiles.open("locale")}>
                            <span className={cx(styles.identityCover, styles.cover, !a.cover_image && styles.coverNone)} style={coverStyle} />
                            <span className={styles.edit}>
                                <Pencil size={14} strokeWidth={1.75} aria-hidden />
                                Cambia foto, nome e presentazione
                            </span>
                            <span className={styles.overlay}>
                                <h3>{a.name}</h3>
                                {a.description && <p>{a.description}</p>}
                            </span>
                        </button>
                        <div className={styles.linkCard} data-k="link">
                            <div className={styles.linkRow}>
                                <div className={styles.qr}>
                                    <QrCode
                                        value={publicUrl}
                                        fileName={`qr-${a.slug}`}
                                        size={70}
                                        level="M"
                                        fgColor={a.qr_fg_color ?? QR_DEFAULT_FG}
                                        bgColor={a.qr_bg_color ?? QR_DEFAULT_BG}
                                        showActions={false}
                                        status={a.status === "active" ? "ready" : "unavailable"}
                                    />
                                </div>
                                <div className={styles.linkText}>
                                    <span className={styles.lab}>La vostra pagina</span>
                                    <span className={styles.url}>{publicUrl.replace(/^https?:\/\//, "")}</span>
                                    <span className={styles.hint}>Il QR porta qui. Da stampare su tavoli, vetrina e volantini.</span>
                                </div>
                            </div>
                            <div className={styles.acts}>
                                <Button variant="secondary" size="sm" leftIcon={<Copy size={14} strokeWidth={1.75} aria-hidden />} onClick={onCopyLink}>
                                    Copia
                                </Button>
                                <Button
                                    as="a"
                                    variant="secondary"
                                    size="sm"
                                    href={publicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    leftIcon={<ExternalLink size={14} strokeWidth={1.75} aria-hidden />}
                                >
                                    Apri
                                </Button>
                                <Button variant="secondary" size="sm" leftIcon={<QrIcon size={14} strokeWidth={1.75} aria-hidden />} onClick={() => tiles.open("link")}>
                                    QR e PDF
                                </Button>
                            </div>
                        </div>
                    </div>

                    <SchedaNow facts={facts} actions={now} />

                    {DASH_GROUPS.map((g, gi) => (
                        <section key={g.title} aria-label={g.title}>
                            <div className={styles.groupHead}>
                                <h3>{g.title}</h3>
                                <span className={styles.hint}>{g.hint}</span>
                            </div>
                            <div className={cx(styles.tiles, gi === 1 && styles.tiles2)}>
                                {g.parts.map(k => (
                                    <SchedaTile key={k} part={k} facts={facts} actions={tiles} wide={k === "orari"} highlighted={hl === k} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>

                <aside className={styles.side} ref={sideRef} aria-label="Sul telefono">
                    <div className={cx(styles.card, fit.slim && styles.cardSlim)} aria-live="polite">
                        <span className={styles.cardK}>
                            <Smartphone size={13} strokeWidth={1.75} aria-hidden />
                            Sul telefono
                        </span>
                        <b className={styles.cardTitle}>{cardTitle}</b>
                        <p className={styles.cardText}>{rich(cardText)}</p>
                    </div>
                    <div className={styles.phoneBox} ref={boxRef} style={fit.boxStyle}>
                        <SchedaPhone ref={scrRef} facts={facts} highlight={hl} />
                    </div>
                </aside>
            </div>
        </div>
    );
}
