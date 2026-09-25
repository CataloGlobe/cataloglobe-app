import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { RangeInput } from "@/components/ui/Input/RangeInput";
import Text from "@/components/ui/Text/Text";
import styles from "./MomentBand.module.scss";

/** Il cursore va dalle 00 alle 24 a passi di mezz'ora. */
export const MOMENT_STEP_MINUTES = 30;
export const MOMENT_MAX_MINUTES = 24 * 60;
const MARKS = ["00", "06", "12", "18", "24"] as const;

type MomentBandProps = {
    /** «Oggi alle HH:MM» — l'ora del cursore, di Roma. */
    timeLabel: string;
    headline: string;
    /** «N ha modifiche a mano in corso…», se ce ne sono. */
    manual: string | null;
    hint: string;
    minutes: number;
    onMinutesChange: (minutes: number) => void;
    /** Il cursore è sull'ora di adesso: niente «Torna ad adesso». */
    atNow: boolean;
    onBackToNow: () => void;
};

/**
 * La banda del momento di Programmazione (§20.3, §50.7): cosa succede alle
 * sedi nell'ora del cursore. Il cursore muove la banda e la matrice, non
 * l'elenco delle regole, che resta ad adesso.
 */
export function MomentBand({ timeLabel, headline, manual, hint, minutes, onMinutesChange, atNow, onBackToNow }: MomentBandProps) {
    // Agganciata in alto mentre la pagina scorre (§21.3): compatta, restano
    // l'ora, l'esito e il cursore. Agganciata sta a -1 px: la sua riga più
    // alta esce dal contenitore che scorre, ed è così che lo si sa.
    const regionRef = useRef<HTMLDivElement | null>(null);
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        const region = regionRef.current;
        if (!region || typeof IntersectionObserver === "undefined") return;
        let root: HTMLElement | null = region.parentElement;
        while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
        const observer = new IntersectionObserver(([entry]) => setCompact(entry.intersectionRatio < 1), {
            root,
            threshold: [1]
        });
        observer.observe(region);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={regionRef} role="region" aria-label="Il momento" className={styles.sticky}>
            <Card className={`${styles.band}${compact ? ` ${styles.compact}` : ""}`}>
                <div className={styles.body}>
                    <div className={styles.eyebrowRow}>
                        <Text as="p" variant="caption" colorVariant="muted" className={styles.eyebrow}>
                            {timeLabel}
                        </Text>
                        {!atNow && (
                            <Button variant="ghost" size="sm" onClick={onBackToNow}>
                                Torna ad adesso
                            </Button>
                        )}
                    </div>
                    <Text as="h2" variant={compact ? "title-sm" : "title-md"}>
                        {headline}
                    </Text>
                    {!compact && (
                        <div className={styles.lines}>
                            {manual && <Text variant="body-sm">{manual}</Text>}
                            <Text variant="body-sm" colorVariant="muted">
                                {hint}
                            </Text>
                        </div>
                    )}
                    <RangeInput
                        aria-label="Ora"
                        aria-valuetext={timeLabel}
                        min={0}
                        max={MOMENT_MAX_MINUTES}
                        step={MOMENT_STEP_MINUTES}
                        value={minutes}
                        onChange={event => onMinutesChange(Number(event.target.value))}
                        showValue={false}
                        marks={compact ? undefined : MARKS}
                    />
                </div>
            </Card>
        </div>
    );
}
