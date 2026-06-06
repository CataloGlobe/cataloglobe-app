import { Globe, PencilLine } from "lucide-react";
import type { ReservationSource } from "@/types/reservation";
import styles from "./Reservations.module.scss";

export type ChannelMarkVariant = "boxed" | "plain";

interface Props {
    source: ReservationSource;
    /**
     * "boxed" → 34×34 rounded soft-grey pill, used in Inbox where the
     * channel is a strong visual marker.
     * "plain" → inline muted icon, used in Agenda · Giorni where time is
     * the hero and channel is a quiet secondary signal.
     */
    variant?: ChannelMarkVariant;
    /** Icon size override. Defaults: boxed=16, plain=15. */
    size?: number;
}

const META: Record<ReservationSource, { label: string; Icon: typeof Globe }> = {
    online: { label: "Ricevuta online", Icon: Globe },
    manual: { label: "Inserita a mano", Icon: PencilLine }
};

/**
 * Visual mark for the channel a reservation came from. Renders the matching
 * Lucide icon + `title` tooltip in two visual variants. Intentionally muted —
 * sits beside the customer name without competing with it.
 */
export default function ChannelMark({ source, variant = "boxed", size }: Props) {
    // Defensive: a row with no `source` (e.g. frontend deployed before the
    // migration applies) or with an unexpected value renders nothing instead
    // of crashing the list.
    const meta = META[source];
    if (!meta) return null;
    const { label, Icon } = meta;
    const resolvedSize = size ?? (variant === "boxed" ? 16 : 15);
    const className =
        variant === "boxed" ? styles.channelMark : styles.channelMarkPlain;
    return (
        <span
            className={className}
            data-source={source}
            title={label}
            aria-label={label}
        >
            <Icon size={resolvedSize} strokeWidth={2} aria-hidden />
        </span>
    );
}
