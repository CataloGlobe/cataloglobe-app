import styles from "./ComparePanel.module.scss";

type ComparePanelProps = {
    label: string;
    items: string[];
    /** "before" = neutro con ✕; "after" = accento tenue con spunta. */
    tone: "before" | "after";
};

/** Pannello di confronto prima/dopo: etichetta + elenco con ✕ o spunta. */
export default function ComparePanel({ label, items, tone }: ComparePanelProps) {
    const isAfter = tone === "after";

    return (
        <div className={isAfter ? `${styles.panel} ${styles.brand}` : styles.panel}>
            <p className={styles.label}>{label}</p>
            <ul className={styles.list}>
                {items.map((item) => (
                    <li key={item} className={styles.item}>
                        <svg
                            className={styles.icon}
                            width="17"
                            height="17"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path d={isAfter ? "M20 6 9 17l-5-5" : "M18 6 6 18M6 6l12 12"} />
                        </svg>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
