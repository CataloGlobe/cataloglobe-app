import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button/Button";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { PART_ICON, PART_IMMEDIATE, PART_TITLE, PART_WHY, RAIL_GROUPS, type SchedaPart } from "./schedaCopy";
import { TONE_LABEL, type SchedaFacts, type Tone } from "./schedaModel";
import { SchedaPhone } from "./SchedaPhone";
import { usePhoneFit } from "@/hooks/usePhoneFit";
import styles from "./Scheda.module.scss";

interface SchedaFocusProps {
    part: SchedaPart;
    facts: SchedaFacts;
    tone: (part: SchedaPart) => Tone;
    changed: (part: SchedaPart) => boolean;
    /** Le modifiche da salvare fuori da questa parte. */
    otherChanges: number;
    editor: ReactNode;
    onPick: (part: SchedaPart) => void;
    onDone: () => void;
}

const TONE_DOT: Record<Tone, string> = { ok: styles.stOk, warn: styles.stWarn, off: styles.stOff };
const TONE_BADGE = { ok: "success", warn: "warning", off: "neutral" } as const;

/**
 * Una parte a fuoco (prototipo C+++): a sinistra tutte le parti con il loro
 * pallino, al centro la card con il perché e l'editor, a destra il telefono
 * che si tocca per passare a un'altra parte. «Fatto» torna al cruscotto;
 * il Salva resta in alto, uno solo per tutta la scheda.
 */
export function SchedaFocus({ part, facts, tone, changed, otherChanges, editor, onPick, onDone }: SchedaFocusProps) {
    const sideRef = useRef<HTMLElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const fit = usePhoneFit(sideRef, boxRef, false);
    const Icon = PART_ICON[part];
    const t = tone(part);
    const isChanged = changed(part);

    // Esc torna al cruscotto, se non si sta scrivendo in un drawer.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (document.querySelector("[role='dialog']")) return;
            onDone();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onDone]);

    return (
        <div className={`${styles.root} ${styles.focusRoot}`}>
            <div className={styles.focus} style={fit.vars}>
                <nav className={styles.rail} aria-label="Parti della scheda">
                    {RAIL_GROUPS.map(g => (
                        <div key={g.title} style={{ display: "contents" }}>
                            <div className={styles.gt}>{g.title}</div>
                            {g.parts.map(o => (
                                <button key={o} type="button" aria-current={o === part} onClick={() => onPick(o)}>
                                    {PART_TITLE[o]}
                                    {changed(o) && (
                                        <span className={styles.pn} title="Cambiato">
                                            •
                                        </span>
                                    )}
                                    <span className={`${styles.st} ${TONE_DOT[tone(o)]}`} />
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className={styles.fcard}>
                    <div className={styles.fh}>
                        <span className={styles.fico}>
                            <Icon size={18} strokeWidth={1.75} aria-hidden />
                        </span>
                        <h3>{PART_TITLE[part]}</h3>
                        <StatusBadge variant={TONE_BADGE[t]} label={TONE_LABEL[t]} />
                    </div>
                    <p className={styles.fwhy}>{PART_WHY[part]}</p>
                    <div className={styles.editor}>{editor}</div>
                    <div className={styles.split} />
                    <div className={styles.ffoot}>
                        <div className={styles.savehint}>
                            {isChanged ? (
                                <>
                                    <b>Cambiato, non ancora salvato.</b>
                                    <span>
                                        {otherChanges > 1
                                            ? `Con le altre ${otherChanges} modifiche: le salvi tutte insieme con Salva, in alto.`
                                            : otherChanges === 1
                                              ? "Con l'altra modifica: le salvi insieme con Salva, in alto."
                                              : "Lo salvi con Salva, in alto."}
                                    </span>
                                </>
                            ) : (
                                <span>Quello che cambi qui si salva con Salva, in alto.</span>
                            )}
                            {PART_IMMEDIATE[part] && <span>{PART_IMMEDIATE[part]}</span>}
                        </div>
                        <Button variant="primary" onClick={onDone}>
                            Fatto
                        </Button>
                    </div>
                </div>

                <aside className={styles.fside} ref={sideRef}>
                    <span className={styles.hint}>Come la vede il cliente · tocca una parte</span>
                    <div className={styles.phoneBox} ref={boxRef} style={fit.boxStyle}>
                        <SchedaPhone facts={facts} onPick={onPick} />
                    </div>
                </aside>
            </div>
        </div>
    );
}
