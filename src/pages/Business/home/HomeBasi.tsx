import type { ReactNode } from "react";
import { Check, ConciergeBell, CalendarDays, Soup, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import type { ChecklistItem } from "@/components/ui/Checklist/Checklist";
import styles from "./HomeBasi.module.scss";

/** «Le basi» nella forma della copia «Visual Redesign PR 3» (`cBasi`): barra e «n di 4»
 *  in testa, un passo per riga con la sua icona, «Fai ora» sui passi aperti (il primo in viola). */
const ICONS: Record<string, ReactNode> = {
    location: <ConciergeBell />,
    products: <Soup />,
    catalog: <UtensilsCrossed />,
    rule: <CalendarDays />
};

export function HomeBasi({ items }: { items: ChecklistItem[] }) {
    const done = items.filter(i => i.done).length;
    const first = items.findIndex(i => !i.done);
    return (
        <Card
            title="Le basi"
            actions={
                <span className={styles.head}>
                    <span className={styles.bar} style={{ "--p": `${(done / items.length) * 100}%` } as React.CSSProperties}>
                        <i />
                    </span>
                    <b>
                        {done} di {items.length}
                    </b>
                </span>
            }
        >
            <ul className={styles.steps}>
                {items.map((item, i) => (
                    <li key={item.id} className={item.done ? styles.done : undefined}>
                        <span className={styles.ic} aria-hidden="true">
                            {item.done ? <Check /> : ICONS[item.id]}
                        </span>
                        <span className={styles.text}>
                            <b>{item.title}</b>
                            {item.description && <small>{item.description}</small>}
                        </span>
                        {!item.done && (
                            <Button size="sm" variant={i === first ? "primary" : "secondary"} onClick={item.onAction}>
                                {item.actionLabel ?? "Fai ora"}
                            </Button>
                        )}
                    </li>
                ))}
            </ul>
        </Card>
    );
}
