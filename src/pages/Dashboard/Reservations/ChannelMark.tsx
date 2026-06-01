import { Globe, PencilLine } from "lucide-react";
import type { ReservationSource } from "@/types/reservation";
import styles from "./Reservations.module.scss";

interface Props {
    source: ReservationSource;
    size?: number;
}

const META: Record<ReservationSource, { label: string; Icon: typeof Globe }> = {
    online: { label: "Ricevuta online", Icon: Globe },
    manual: { label: "Inserita a mano", Icon: PencilLine }
};

/**
 * Visual mark for the channel a reservation came from. Renders a small pill
 * with the matching Lucide icon + `title` tooltip. Intentionally muted —
 * sits beside the customer name without competing with it.
 */
export default function ChannelMark({ source, size = 13 }: Props) {
    // Defensive: a row with no `source` (e.g. frontend deployed before the
    // migration applies) or with an unexpected value renders nothing instead
    // of crashing the list.
    const meta = META[source];
    if (!meta) return null;
    const { label, Icon } = meta;
    return (
        <span
            className={styles.channelMark}
            data-source={source}
            title={label}
            aria-label={label}
        >
            <Icon size={size} strokeWidth={2} aria-hidden />
        </span>
    );
}
