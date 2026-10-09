import { useEffect, useRef, type ReactNode } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { PART_ICON, PART_IMMEDIATE, PART_WHY, RAIL_GROUPS, partTitle, type ProdottoPart } from "./prodottoCopy";
import type { ProdottoFacts } from "./prodottoModel";
import { partCaption, rich } from "./prodottoText";
import { ProdottoPhone } from "./ProdottoPhone";
import styles from "./Prodotto.module.scss";

interface ProdottoFocusProps {
    part: ProdottoPart;
    facts: ProdottoFacts;
    visible: (part: ProdottoPart) => boolean;
    changed: (part: ProdottoPart) => boolean;
    /** Le parti cambiate in tutta la pagina. */
    changeCount: number;
    /** Questa parte va nella bozza della pagina (si salva con Salva). */
    saves: boolean;
    canWrite: boolean;
    editor: ReactNode;
    onPick: (part: ProdottoPart) => void;
    onDone: () => void;
}

/**
 * Una parte a fuoco (artifact «Scheda del prodotto», `viewFocus()`): a
 * sinistra tutte le parti, al centro la card col perché e l'editor, a destra
 * il telefono con la parte accesa. «Fatto» torna al cruscotto; il Salva resta
 * in alto, uno solo per tutta la pagina.
 */
export function ProdottoFocus({
    part,
    facts,
    visible,
    changed,
    changeCount,
    saves,
    canWrite,
    editor,
    onPick,
    onDone
}: ProdottoFocusProps) {
    const Icon = PART_ICON[part];
    const labels = facts.labels;
    const title = partTitle(part, labels);
    const isChanged = changed(part);
    const others = changeCount - (isChanged ? 1 : 0);
    const scrRef = useRef<HTMLDivElement>(null);

    // Esc torna al cruscotto, se non si sta scrivendo in un drawer.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (document.querySelector("[role='dialog'], [role='alertdialog']")) return;
            onDone();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onDone]);

    // Il telefono porta in vista la parte a fuoco.
    useEffect(() => {
        const scr = scrRef.current;
        if (!scr) return;
        const el = scr.querySelector<HTMLElement>(`[data-part="${part}"]`);
        const top = el ? scr.scrollTop + el.getBoundingClientRect().top - scr.getBoundingClientRect().top - 50 : 0;
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        scr.scrollTo?.({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    }, [part, facts]);

    return (
        <div className={`${styles.root} ${styles.focusRoot}`}>
            <div className={styles.focus}>
                <nav className={styles.rail} aria-label={`Parti del ${facts.labels.product.toLowerCase()}`}>
                    {RAIL_GROUPS.map(g => {
                        const parts = g.parts.filter(visible);
                        if (parts.length === 0) return null;
                        return (
                            <div key={g.title} style={{ display: "contents" }}>
                                <div className={styles.gt}>{g.title}</div>
                                {parts.map(o => (
                                    <button key={o} type="button" aria-current={o === part} onClick={() => onPick(o)}>
                                        {partTitle(o, labels)}
                                        {changed(o) && <span className={styles.st} title="Da salvare" />}
                                    </button>
                                ))}
                            </div>
                        );
                    })}
                </nav>

                <div className={styles.fcard}>
                    <div className={styles.fh}>
                        <span className={styles.fico}>
                            <Icon size={18} strokeWidth={1.75} aria-hidden />
                        </span>
                        <h3>{title}</h3>
                        {isChanged && <span className={styles.chg}>Da salvare</span>}
                    </div>
                    <p className={styles.fwhy}>{PART_WHY[part]}</p>
                    <div className={styles.editor}>{editor}</div>
                    <div className={styles.split} />
                    <div className={styles.ffoot}>
                        <div className={styles.savehint}>
                            {canWrite && saves && (
                                isChanged ? (
                                    <>
                                        <b>Cambiato, non ancora salvato.</b>
                                        <span>
                                            {others > 1
                                                ? `Con le altre ${others} modifiche: le salvate tutte insieme con Salva, in alto.`
                                                : others === 1
                                                  ? "Con l'altra modifica: le salvate insieme con Salva, in alto."
                                                  : "Lo salvate con Salva, in alto."}
                                        </span>
                                    </>
                                ) : (
                                    <span>Quello che cambiate qui si salva con Salva, in alto.</span>
                                )
                            )}
                            {canWrite && PART_IMMEDIATE[part] && <span>{PART_IMMEDIATE[part]}</span>}
                        </div>
                        <Button variant="primary" onClick={onDone}>
                            Fatto
                        </Button>
                    </div>
                </div>

                <aside className={styles.fside} aria-label="Così lo vede il cliente">
                    <div className={styles.card}>
                        <span className={styles.cardK}>
                            <Smartphone size={13} strokeWidth={1.75} aria-hidden />
                            Sul telefono
                        </span>
                        <b className={styles.cardTitle}>{title}</b>
                        <p className={styles.cardText}>{rich(partCaption(part, facts))}</p>
                    </div>
                    <ProdottoPhone ref={scrRef} facts={facts} highlight={part} />
                </aside>
            </div>
        </div>
    );
}
