import styles from "./TableSketch.module.scss";

export type TableSketchState = "free" | "open" | "previous" | "maintenance";

type TableSketchProps = {
    /** Posti del tavolo; senza, il tavolo si disegna senza sedie. */
    seats: number | null;
    state: TableSketchState;
};

/** Sedie per lato, al massimo così: oltre il disegno non si legge. */
const MAX_PER_SIDE = 6;

/** Quante sedie su ogni lato: 2 sopra e sotto, 3-4 anche ai lati, 5+ un rettangolo. */
function chairsBySide(seats: number): { top: number; bottom: number; left: number; right: number } {
    if (seats <= 0) return { top: 0, bottom: 0, left: 0, right: 0 };
    if (seats <= 2) return { top: 1, bottom: seats - 1, left: 0, right: 0 };
    if (seats <= 4) return { top: 1, bottom: 1, left: 1, right: seats - 3 };
    return {
        top: Math.min(Math.ceil(seats / 2), MAX_PER_SIDE),
        bottom: Math.min(Math.floor(seats / 2), MAX_PER_SIDE),
        left: 0,
        right: 0
    };
}

function shapeOf(seats: number | null): "small" | "square" | "long" {
    if (seats === null || seats <= 2) return "small";
    return seats <= 4 ? "square" : "long";
}

function Chairs({ count, side }: { count: number; side: "top" | "bottom" | "left" | "right" }) {
    if (count === 0) return <span className={styles[side]} />;
    return (
        <span className={styles[side]}>
            {Array.from({ length: count }, (_, i) => (
                <span key={i} className={styles.chair} />
            ))}
        </span>
    );
}

/**
 * Il tavolo disegnato sulla Mappa (correzioni UI T14 SV2): la forma viene dai
 * posti (2 quadrato piccolo, 4 quadrato, 6+ rettangolo, le sedie intorno), lo
 * stato è il colore del tavolo: libero bianco, aperto verde, aperto da un
 * servizio precedente grigio, fuori servizio tratteggiato. Solo decorazione:
 * nome e stato li dice la tessera.
 */
export function TableSketch({ seats, state }: TableSketchProps) {
    const chairs = chairsBySide(seats ?? 0);
    return (
        <div className={styles.frame} data-state={state} aria-hidden>
            <div className={styles.layout}>
                <Chairs count={chairs.top} side="top" />
                <Chairs count={chairs.left} side="left" />
                <span className={styles.table} data-shape={shapeOf(seats)} />
                <Chairs count={chairs.right} side="right" />
                <Chairs count={chairs.bottom} side="bottom" />
            </div>
        </div>
    );
}
