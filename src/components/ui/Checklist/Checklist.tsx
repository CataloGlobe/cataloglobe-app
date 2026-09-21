import { useId, useState } from "react";
import { Check, ChevronDown, Circle, CircleCheck } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Chip } from "@/components/ui/Chip/Chip";
import { Button } from "@/components/ui/Button/Button";
import styles from "./Checklist.module.scss";

/**
 * Checklist — cosa manca, e cosa c'è già; le basi non spariscono, collassano
 * (design system §5, scheda Checklist). Panoramica e setup guidato, stessi
 * criteri.
 *
 * Anatomia: intestazione «n di 4» con barra · righe (ListRow variante
 * checklist: spunta · titolo · una riga · «Fai ora» sulle aperte, muted sulle
 * fatte) · stato `done`: una riga verde «Le basi ci sono» con i nomi come Chip
 * spuntati, apribile. Vive in una Card flush (la rende lei).
 *
 * Non per i prerequisiti di un'azione (→ PrerequisitesRow), non per lo stato
 * della pagina (→ StatusStrip).
 */
export interface ChecklistItem {
    id: string;
    title: string;
    /** Una riga sotto il titolo. */
    description?: string;
    done: boolean;
    /** Azione primaria sm sulle righe aperte; default «Fai ora». */
    actionLabel?: string;
    onAction?: () => void;
}

export interface ChecklistProps {
    /** Titolo dell'intestazione; default «Le basi». */
    title?: string;
    items: ChecklistItem[];
    /** Riga verde dello stato done; default «Le basi ci sono». */
    doneTitle?: string;
    /** Skeleton di quattro righe. */
    loading?: boolean;
    className?: string;
}

export function Checklist({ title = "Le basi", items, doneTitle = "Le basi ci sono", loading = false, className }: ChecklistProps) {
    const [expanded, setExpanded] = useState(false);
    const panelId = useId();
    const doneCount = items.filter(i => i.done).length;
    const total = items.length;
    const allDone = total > 0 && doneCount === total;

    if (loading) {
        return (
            <Card flush className={className} bodyClassName={styles.body}>
                <ChecklistHeader title={title} done={0} total={4} />
                {Array.from({ length: 4 }, (_, i) => (
                    <ListRow key={i} loading />
                ))}
            </Card>
        );
    }

    const rows = items.map(item => (
        <ListRow
            key={item.id}
            leading={
                item.done ? (
                    <CircleCheck className={styles.iconDone} aria-label="Fatto" />
                ) : (
                    <Circle className={styles.iconOpen} aria-label="Da fare" />
                )
            }
            title={item.title}
            subtitle={item.description}
            muted={item.done}
            trailing={
                !item.done && item.onAction ? (
                    <Button variant="primary" size="sm" onClick={item.onAction}>
                        {item.actionLabel ?? "Fai ora"}
                    </Button>
                ) : undefined
            }
        />
    ));

    if (allDone) {
        return (
            <Card flush className={className} bodyClassName={styles.body}>
                <button
                    type="button"
                    className={styles.doneRow}
                    onClick={() => setExpanded(e => !e)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                >
                    <span className={styles.doneIcon} aria-hidden="true">
                        <Check size={14} strokeWidth={2.5} />
                    </span>
                    <span className={styles.doneBody}>
                        <Text as="span" variant="body-sm" weight={500} className={styles.doneTitle}>
                            {doneTitle}
                        </Text>
                        <span className={styles.doneChips}>
                            {items.map(item => (
                                <Chip key={item.id} label={item.title} selected />
                            ))}
                        </span>
                    </span>
                    <ChevronDown className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`} aria-hidden="true" />
                </button>
                <div id={panelId} hidden={!expanded}>
                    {rows}
                </div>
            </Card>
        );
    }

    return (
        <Card flush className={className} bodyClassName={styles.body}>
            <ChecklistHeader title={title} done={doneCount} total={total} />
            {rows}
        </Card>
    );
}

function ChecklistHeader({ title, done, total }: { title: string; done: number; total: number }) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
        <div className={styles.header}>
            <div className={styles.headerText}>
                <Text as="span" variant="body-sm" weight={500}>
                    {title}
                </Text>
                <Text as="span" variant="caption" colorVariant="muted">
                    {done} di {total}
                </Text>
            </div>
            <div
                className={styles.bar}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                aria-label={`${done} di ${total}`}
            >
                <div className={styles.barFill} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
