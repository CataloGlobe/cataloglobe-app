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

/**
 * Decide se la toolbar di sezione (tab a sinistra + azioni a destra) sta su una
 * riga sola o deve passare a due (azioni sopra, tab sotto).
 *
 * La soglia NON è un breakpoint in px: confronta la larghezza naturale del
 * contenuto reale con lo spazio disponibile nel contenitore. Due pagine con
 * contenuto diverso passano quindi a due righe a larghezze diverse — è voluto.
 *
 * I due slot si misurano sommando i loro figli (`naturalRowWidth`) invece di
 * leggerne la larghezza: sono celle di griglia, quindi si allargano fino alla
 * colonna assegnata — che in stato compatto è la riga intera. Leggerli
 * direttamente significherebbe misurare la banda invece del contenuto, e il
 * layout non tornerebbe mai a riga singola allargando la finestra.
 */
export function useCompactToolbar(
    containerRef: RefObject<HTMLElement | null>,
    leadingRef: RefObject<HTMLElement | null>,
    actionsRef: RefObject<HTMLElement | null>,
    signal?: unknown
): boolean {
    const [isCompact, setIsCompact] = useState(false);
    const isCompactRef = useRef(false);

    const measure = useCallback(() => {
        const container = containerRef.current;
        const leading = leadingRef.current;
        const actions = actionsRef.current;

        // Nessuno slot da misurare: non c'è niente che possa non entrare.
        if (!container || (!leading && !actions)) {
            if (isCompactRef.current) {
                isCompactRef.current = false;
                setIsCompact(false);
            }
            return;
        }

        const style = getComputedStyle(container);
        const available =
            container.clientWidth -
            (parseFloat(style.paddingLeft) || 0) -
            (parseFloat(style.paddingRight) || 0);
        const gap = parseFloat(style.columnGap) || 0;

        // Gli slot si misurano sui figli, mai sul contenitore: sono celle di
        // griglia e si allargano fino alla colonna assegnata, che in stato
        // compatto è la riga intera. Misurarli direttamente vorrebbe dire
        // leggere "largo quanto la banda" e non tornare mai a riga singola.
        //
        // Si misura ciò che c'è: uno slot solo può eccedere lo spazio da sé
        // (una fila di azioni su schermo stretto, o molte tab). Il gap conta
        // solo quando ci sono davvero due slot a contendersi la riga.
        const required =
            (leading ? naturalRowWidth(leading) : 0) +
            (actions ? naturalRowWidth(actions) : 0) +
            (leading && actions ? gap : 0);
        // Tolleranza 1px: arrotondamenti sub-pixel non devono far sfarfallare
        // il layout su un ridimensionamento continuo della finestra.
        const next = required > available + 1;

        if (next === isCompactRef.current) return;
        isCompactRef.current = next;
        setIsCompact(next);
    }, [containerRef, leadingRef, actionsRef]);

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
        // I due slot vanno osservati a parte: il loro contenuto cambia senza che
        // il contenitore cambi larghezza (azioni diverse per tab attiva, badge
        // con conteggio, CTA che compare al caricamento dei permessi).
        if (leadingRef.current) observer.observe(leadingRef.current);
        if (actionsRef.current) observer.observe(actionsRef.current);

        return () => observer.disconnect();
        // `signal` riaggancia gli observer quando i nodi degli slot compaiono o
        // vengono sostituiti (config della pagina che arriva dopo il primo
        // render, oppure cambio pagina con lo slot riusato).
    }, [containerRef, leadingRef, actionsRef, measure, signal]);

    return isCompact;
}
