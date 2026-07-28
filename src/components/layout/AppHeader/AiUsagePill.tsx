import { useNavigate } from "react-router-dom";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useTenant } from "@/context/useTenant";
import type { AiUsageCycle } from "@/types/aiUsage";
import { formatUsagePercent, showsUsagePill } from "@/utils/aiUsage";
import styles from "./AiUsagePill.module.scss";

/**
 * Indicatore quota AI nell'header business. Compare SOLO in stato `warning` o
 * `blocked` — invisibile in `ok`/`not_eligible`. Elemento discreto e
 * autoesplicativo (parole, non solo una barra): cliccando porta alla sezione
 * "Utilizzo AI" in Abbonamento.
 */
export function AiUsagePill({ usage }: { usage: AiUsageCycle | null }) {
    const navigate = useNavigate();
    const { selectedTenantId } = useTenant();

    if (!usage || !showsUsagePill(usage.status)) return null;

    const blocked = usage.status === "blocked";
    const label = blocked ? "AI esaurita" : `AI all'${formatUsagePercent(usage.percent)}`;

    const go = () => {
        if (selectedTenantId) navigate(`/business/${selectedTenantId}/subscription#utilizzo-ai`);
    };

    return (
        <button
            type="button"
            onClick={go}
            className={`${styles.pill} ${blocked ? styles.blocked : styles.warning}`}
            aria-label={`${label} — apri Utilizzo AI`}
        >
            {blocked ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
            <span className={styles.label}>{label}</span>
        </button>
    );
}
