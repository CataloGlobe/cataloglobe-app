import { useRef, useState } from "react";
import { Bold, Italic } from "lucide-react";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { StoryTextBlock } from "@/services/supabase/stories";
import styles from "./TextBlock.module.scss";

interface TextBlockProps {
    block: StoryTextBlock;
    onChange: (next: StoryTextBlock) => void;
    disabled?: boolean;
}

type EmphasisKind = "bold" | "italic";
const MARKER: Record<EmphasisKind, string> = { bold: "**", italic: "*" };

interface Span {
    kind: EmphasisKind;
    /** Indice del marcatore di apertura. */
    open: number;
    /** Indice del marcatore di chiusura. */
    close: number;
    /** Testo interno [innerStart, innerEnd). */
    innerStart: number;
    innerEnd: number;
}

/**
 * Localizza lo span di enfasi che racchiude la selezione [start, end], o null.
 * NON è un parser di render (nessun nodo): dice solo se il caret/selezione è
 * "dentro" un `**grassetto**` o `*corsivo*`, per accendere il bottone e per il
 * toggle-off. Gli span non si sovrappongono (no annidamento) → al più uno copre.
 *
 * ⚠️ SYNC con parseInlineEmphasis.ts: stesse regole di pairing (longest-match
 * `**` prima di `*`, coppie chiuse, no annidamento). È il 3º punto che duplica
 * quelle regole (parser + regex excerpt + questo). Tenuto minimale di proposito.
 */
function findEnclosingSpan(value: string, start: number, end: number): Span | null {
    const covers = (a: number, b: number) => start >= a && end <= b;
    let i = 0;
    const n = value.length;
    while (i < n) {
        if (value.startsWith("**", i)) {
            const close = value.indexOf("**", i + 2);
            if (close !== -1) {
                if (covers(i + 2, close))
                    return { kind: "bold", open: i, close, innerStart: i + 2, innerEnd: close };
                i = close + 2;
                continue;
            }
            i += 2;
            continue;
        }
        if (value[i] === "*") {
            const close = value.indexOf("*", i + 1);
            if (close !== -1) {
                if (covers(i + 1, close))
                    return { kind: "italic", open: i, close, innerStart: i + 1, innerEnd: close };
                i = close + 1;
                continue;
            }
            i += 1;
            continue;
        }
        i += 1;
    }
    return null;
}

export function TextBlock({ block, onChange, disabled }: TextBlockProps) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const [active, setActive] = useState<{ bold: boolean; italic: boolean }>({
        bold: false,
        italic: false
    });

    // Ricalcola lo stato attivo dei bottoni dalla posizione corrente del caret.
    // Legge da el.value (DOM, sempre aggiornato dal controlled) così è corretto
    // anche subito dopo un toggle, quando la closure avrebbe il valore vecchio.
    const syncActive = () => {
        const el = ref.current;
        if (!el) return;
        const span = findEnclosingSpan(el.value, el.selectionStart, el.selectionEnd);
        setActive({ bold: span?.kind === "bold", italic: span?.kind === "italic" });
    };

    const restoreSelection = (el: HTMLTextAreaElement, nextStart: number, nextEnd: number) => {
        // Ripristina selezione/caret DOPO il re-render controllato (stesso pattern
        // rAF di StoryBlockEditor), poi riallinea lo stato dei bottoni.
        requestAnimationFrame(() => {
            const max = el.value.length;
            el.focus();
            el.setSelectionRange(Math.min(nextStart, max), Math.min(nextEnd, max));
            syncActive();
        });
    };

    const toggle = (kind: EmphasisKind) => {
        const el = ref.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const value = block.content;
        const marker = MARKER[kind];
        const mlen = marker.length;
        const span = findEnclosingSpan(value, start, end);

        if (span && span.kind === kind) {
            // OFF: togli i due marcatori dello span che contiene la selezione.
            const next =
                value.slice(0, span.open) +
                value.slice(span.innerStart, span.innerEnd) +
                value.slice(span.close + mlen);
            onChange({ ...block, content: next });
            // start/end erano dentro l'inner (dopo l'apertura) → si spostano di -mlen.
            restoreSelection(el, start - mlen, end - mlen);
            return;
        }

        // ON: avvolge la selezione (selezione vuota → caret tra i marcatori `**|**`).
        const next = value.slice(0, start) + marker + value.slice(start, end) + marker + value.slice(end);
        onChange({ ...block, content: next });
        restoreSelection(el, start + mlen, end + mlen);
    };

    return (
        <div className={styles.root}>
            <div className={styles.toolbar}>
                <button
                    type="button"
                    aria-label="Grassetto"
                    title="Grassetto"
                    aria-pressed={active.bold}
                    className={`${styles.toolBtn} ${active.bold ? styles.active : ""}`}
                    disabled={disabled}
                    // Make-or-break iOS: senza preventDefault il tap ruba il focus
                    // al textarea e azzera la selezione prima che toggle() la legga.
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => toggle("bold")}
                >
                    <Bold size={15} />
                </button>
                <button
                    type="button"
                    aria-label="Corsivo"
                    title="Corsivo"
                    aria-pressed={active.italic}
                    className={`${styles.toolBtn} ${active.italic ? styles.active : ""}`}
                    disabled={disabled}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => toggle("italic")}
                >
                    <Italic size={15} />
                </button>
            </div>

            <Textarea
                ref={ref}
                value={block.content}
                onChange={e => onChange({ ...block, content: e.target.value })}
                onSelect={syncActive}
                onKeyUp={syncActive}
                onClick={syncActive}
                onFocus={syncActive}
                placeholder="Scrivi un paragrafo..."
                rows={5}
                disabled={disabled}
            />
        </div>
    );
}
