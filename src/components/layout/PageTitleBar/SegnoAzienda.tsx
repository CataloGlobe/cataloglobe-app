import { MapPin } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { useTenant } from "@/context/useTenant";
import styles from "./PageTitleBar.module.scss";

/** «SP» da «San Pietro»: le iniziali delle prime due parole. */
function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0]!.toUpperCase())
        .join("");
}

/**
 * Il segno dell'azienda in Menù e vetrina (Visual Redesign 2, «Due righe»):
 * quello che si crea qui vale per tutte le sedi. Al telefono è il segnaposto
 * tondo, come «Sede».
 */
export function SegnoAzienda({ sedi, compact }: { sedi: number; compact: boolean }) {
    const { selectedTenant } = useTenant();
    const name = selectedTenant?.name ?? "";
    const sub = sedi > 1 ? `Vale per tutte le ${sedi} sedi` : "La tua azienda";
    if (!name) return null;
    if (compact) {
        return (
            <Tooltip content={`${name} · ${sub}`}>
                <span className={styles.azPin} role="img" aria-label={`${name}: ${sub.toLowerCase()}`}>
                    <MapPin size={20} aria-hidden />
                </span>
            </Tooltip>
        );
    }
    return (
        <span className={styles.az}>
            <span className={styles.azLogo} aria-hidden>
                {initials(name)}
            </span>
            <span>
                <b>{name}</b>
                <small>{sub}</small>
            </span>
        </span>
    );
}
