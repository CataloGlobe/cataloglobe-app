import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Larghezza NATURALE di un elemento: quella che occuperebbe se nulla lo
 * comprimesse. `offsetWidth` da solo non basta — un contenuto compresso o
 * scrollabile riporta la larghezza del contenitore, non quella del contenuto.
 *
 * Si somma quindi l'overflow orizzontale più profondo trovato nel sottoalbero:
 * copre sia il caso "figlio flex schiacciato" sia "figlio con overflow-x: auto"
 * (le tab e il SegmentedControl scrollano internamente).
 *
 * Il risultato NON dipende dallo stato corrente del layout — proprietà
 * necessaria: se dipendesse, passare a due righe cambierebbe la misura che ha
 * deciso il passaggio e il componente oscillerebbe.
 */
function naturalWidth(el: HTMLElement): number {
    let overflow = 0;

    const walk = (node: HTMLElement) => {
        const delta = node.scrollWidth - node.clientWidth;
        if (delta > overflow) overflow = delta;
        for (const child of Array.from(node.children)) {
            if (child instanceof HTMLElement) walk(child);
        }
    };
    walk(el);

    return el.offsetWidth + overflow;
}

/** Somma delle larghezze naturali dei figli diretti + i gap tra loro. */
function naturalRowWidth(el: HTMLElement): number {
    const children = Array.from(el.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement
    );
    if (children.length === 0) return 0;

    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    return children.reduce((sum, child) => sum + naturalWidth(child), 0) + gap * (children.length - 1);
}

/** Come sta la banda: riga singola, due righe (azioni sopra, tab sotto) o barra compatta. */
export type ToolbarLayout = {
    mode: "row" | "stacked" | "compact";
    /** Quale versione delle azioni usare: 0 è `actions`, poi le più strette. */
    step: number;
};

const ROW: ToolbarLayout = { mode: "row", step: 0 };

/**
 * La parte pura della scelta, provata in `toolbarLayout.test.ts`.
 *
 * `actions` sono le larghezze naturali delle versioni delle azioni, dalla più
 * comoda alla più stretta. Si prende la prima che sta in riga con `leading`;
 * se nessuna ci sta e la pagina accetta due righe (`stack`), la prima che sta
 * da sola sopra le tab; altrimenti la barra compatta.
 */
export function chooseToolbarLayout({
    available,
    gap,
    leading,
    actions,
    stack
}: {
    available: number;
    gap: number;
    leading: number | null;
    actions: Array<number | null>;
    stack: boolean;
}): ToolbarLayout {
    // Tolleranza 1px: arrotondamenti sub-pixel non devono far sfarfallare il
    // layout su un ridimensionamento continuo della finestra.
    const fits = (width: number) => width <= available + 1;
    const steps = actions.length > 0 ? actions : [null];

    // Si misura ciò che c'è: uno slot solo può eccedere lo spazio da sé. Il
    // gap conta solo quando ci sono davvero due slot a contendersi la riga.
    for (let step = 0; step < steps.length; step++) {
        const width = steps[step];
        const required = (leading ?? 0) + (width ?? 0) + (leading !== null && width !== null ? gap : 0);
        if (fits(required)) return { mode: "row", step };
    }
    if (stack && leading !== null && fits(leading)) {
        const step = steps.findIndex(width => fits(width ?? 0));
        if (step >= 0) return { mode: "stacked", step };
    }
    return { mode: "compact", step: 0 };
}

/**
 * Decide come sta la toolbar di sezione (tab a sinistra + azioni a destra).
 *
 * La soglia NON è un breakpoint in px: confronta la larghezza naturale del
 * contenuto reale con lo spazio disponibile nel contenitore. Due pagine con
 * contenuto diverso cambiano forma a larghezze diverse — è voluto.
 *
 * Gli slot si misurano sommando i loro figli (`naturalRowWidth`) invece di
 * leggerne la larghezza: sono celle di griglia, quindi si allargano fino alla
 * colonna assegnata — che in stato compatto è la riga intera. Leggerli
 * direttamente significherebbe misurare la banda invece del contenuto, e il
 * layout non tornerebbe mai a riga singola allargando la finestra.
 *
 * `actionsRefs` sono le versioni delle azioni da misurare: di solito una, lo
 * slot stesso. Con più versioni (`PageHeaderConfig.condensed`) sono copie
 * nascoste, così la misura non dipende da quale versione è a vista.
 */
export function useCompactToolbar(
    containerRef: RefObject<HTMLElement | null>,
    leadingRef: RefObject<HTMLElement | null>,
    actionsRefs: ReadonlyArray<RefObject<HTMLElement | null>>,
    stack: boolean,
    signal?: unknown
): ToolbarLayout {
    const [layout, setLayout] = useState<ToolbarLayout>(ROW);
    const layoutRef = useRef<ToolbarLayout>(ROW);

    const measure = useCallback(() => {
        const container = containerRef.current;
        const leading = leadingRef.current;
        const actions = actionsRefs.map(ref => ref.current);

        let next = ROW;
        // Nessuno slot da misurare: non c'è niente che possa non entrare.
        if (container && (leading || actions.some(Boolean))) {
            const style = getComputedStyle(container);
            next = chooseToolbarLayout({
                available:
                    container.clientWidth -
                    (parseFloat(style.paddingLeft) || 0) -
                    (parseFloat(style.paddingRight) || 0),
                gap: parseFloat(style.columnGap) || 0,
                leading: leading ? naturalRowWidth(leading) : null,
                actions: actions.map(el => (el ? naturalRowWidth(el) : null)),
                stack
            });
        }

        if (next.mode === layoutRef.current.mode && next.step === layoutRef.current.step) return;
        layoutRef.current = next;
        setLayout(next);
    }, [containerRef, leadingRef, actionsRefs, stack]);

    // Prima del paint: evita il flash della riga singola su una toolbar che
    // nasce già compatta.
    useLayoutEffect(() => {
        measure();
    });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(() => measure());
        observer.observe(container);
        // Gli slot vanno osservati a parte: il loro contenuto cambia senza che
        // il contenitore cambi larghezza (azioni diverse per tab attiva, badge
        // con conteggio, CTA che compare al caricamento dei permessi).
        if (leadingRef.current) observer.observe(leadingRef.current);
        for (const ref of actionsRefs) if (ref.current) observer.observe(ref.current);

        return () => observer.disconnect();
        // `signal` riaggancia gli observer quando i nodi degli slot compaiono o
        // vengono sostituiti (config della pagina che arriva dopo il primo
        // render, oppure cambio pagina con lo slot riusato).
    }, [containerRef, leadingRef, actionsRefs, measure, signal]);

    return layout;
}
