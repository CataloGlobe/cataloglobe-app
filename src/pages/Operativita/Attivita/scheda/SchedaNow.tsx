import { DoorClosed, Moon, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import {
    canCloseEarly,
    isTodayOnly,
    nowLabel,
    nowSentence,
    problems,
    type Problem,
    type SchedaFacts
} from "./schedaModel";
import styles from "./Scheda.module.scss";

export interface NowActions {
    canManageHours: boolean;
    closeToday: () => void;
    closeEarly: () => void;
    backToUsual: () => void;
    /** Quale bottone di «Solo per oggi» sta lavorando. */
    busy: "close" | "early" | "back" | null;
    solve: (p: Problem) => void;
    isRetrying: boolean;
}

/**
 * «Adesso» (prototipo C+++): una frase sola su com'è la pagina in questo
 * momento, i due tasti di «Solo per oggi» e sotto i problemi scritti come
 * conseguenze, ognuno col suo bottone.
 */
export function SchedaNow({ facts, actions }: { facts: SchedaFacts; actions: NowActions }) {
    const { a, closure } = facts;
    const segments = nowSentence({
        activity: a,
        hasHours: facts.hasHours,
        spans: facts.spans,
        closure,
        now: facts.now,
        reservationsOn: a.enable_reservations && !facts.reservationsLocked,
        orderingOn: a.ordering_enabled && !facts.orderingLocked
    });
    const list = problems(a, facts.down);
    const todayOnly = isTodayOnly(closure, facts.now);

    let today = null;
    if (actions.canManageHours && facts.hasHours) {
        if (todayOnly) {
            today = (
                <div className={styles.today}>
                    <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<RotateCcw size={14} strokeWidth={1.75} aria-hidden />}
                        loading={actions.busy === "back"}
                        onClick={actions.backToUsual}
                    >
                        Torna agli orari di sempre
                    </Button>
                </div>
            );
        } else if (!closure && facts.spans.some(s => s.b > facts.now.minutes)) {
            today = (
                <div className={styles.today}>
                    <span className={styles.hint}>Solo per oggi</span>
                    <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<DoorClosed size={14} strokeWidth={1.75} aria-hidden />}
                        loading={actions.busy === "close"}
                        disabled={actions.busy !== null && actions.busy !== "close"}
                        onClick={actions.closeToday}
                    >
                        Chiudi oggi
                    </Button>
                    {canCloseEarly(facts.spans, facts.now) && (
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Moon size={14} strokeWidth={1.75} aria-hidden />}
                            loading={actions.busy === "early"}
                            disabled={actions.busy !== null && actions.busy !== "early"}
                            onClick={actions.closeEarly}
                        >
                            Chiudi alle 21
                        </Button>
                    )}
                </div>
            );
        }
    }

    return (
        <div className={styles.now}>
            <span className={styles.nowLab}>Adesso · {nowLabel(facts.now)}</span>
            <div className={styles.nowRow}>
                <p className={styles.say} aria-live="polite">
                    {segments.map((s, i) =>
                        s.tone ? (
                            <span key={i} className={s.tone === "on" ? styles.on : styles.off}>
                                {s.text}
                            </span>
                        ) : (
                            <span key={i}>{s.text}</span>
                        )
                    )}
                </p>
                {today}
            </div>
            {list.map(p => (
                <div key={`${p.part}-${p.text}`} className={styles.prob}>
                    <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
                    <span>{p.text}</span>
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={p.action.kind === "printer" && actions.isRetrying}
                        onClick={() => actions.solve(p)}
                    >
                        {p.button}
                    </Button>
                </div>
            ))}
        </div>
    );
}
