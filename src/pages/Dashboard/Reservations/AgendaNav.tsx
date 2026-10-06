import { ChevronLeft, ChevronRight } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import Text from "@/components/ui/Text/Text";
import styles from "./Reservations.module.scss";

export type AgendaViewMode = "days" | "week";

type AgendaNavProps = {
    mode: AgendaViewMode;
    onModeChange: (next: AgendaViewMode) => void;
    weekOffset: number;
    onWeekOffsetChange: (next: number) => void;
    /** «1–7 giu»: la settimana mostrata. */
    rangeLabel: string;
};

/**
 * Giorni/Settimana e la settimana con ‹ › (e «Oggi» quando si è altrove).
 * Sta a sinistra nella testata delle Prenotazioni (T14 PN1); al telefono
 * la testata compatta non lo porta e l'Agenda lo mostra sopra la lista.
 */
export default function AgendaNav({ mode, onModeChange, weekOffset, onWeekOffsetChange, rangeLabel }: AgendaNavProps) {
    return (
        <div className={styles.agendaNav}>
            <SegmentedControl<AgendaViewMode>
                value={mode}
                onChange={onModeChange}
                options={[
                    { value: "days", label: "Giorni" },
                    { value: "week", label: "Settimana" }
                ]}
            />
            <div className={styles.weekNav} role="group" aria-label="Naviga settimana">
                <IconButton
                    icon={<ChevronLeft size={16} strokeWidth={2} />}
                    aria-label="Settimana precedente"
                    size="sm"
                    onClick={() => onWeekOffsetChange(weekOffset - 1)}
                />
                <Text as="span" variant="body-sm" weight={600} className={styles.weekNavLabel} aria-live="polite">
                    {rangeLabel}
                </Text>
                <IconButton
                    icon={<ChevronRight size={16} strokeWidth={2} />}
                    aria-label="Settimana successiva"
                    size="sm"
                    onClick={() => onWeekOffsetChange(weekOffset + 1)}
                />
                {weekOffset !== 0 && (
                    <Button variant="outline" size="sm" onClick={() => onWeekOffsetChange(0)}>
                        Oggi
                    </Button>
                )}
            </div>
        </div>
    );
}
