import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { describeCatalogSummary, describeSeatReason, type Appearance } from "@/utils/ruleAppearance";
import styles from "./CatalogAppearanceBar.module.scss";

/** Cosa succede a ciò che si salva qui, in una riga accanto alla pillola. */
const CONSEQUENCE: Record<Appearance["summary"], string> = {
    liveNow: "Le modifiche salvate vanno subito online",
    assigned: "Le modifiche vanno online con la sua regola",
    stoppedOnly: "Nessun cliente lo vede adesso",
    unassigned: "Nessun cliente lo vede adesso"
};

type CatalogAppearanceBarProps = {
    appearance: Appearance;
    businessId: string;
};

/**
 * «Dove è attivo» nella barra della pagina (correzioni UI MD2), al posto della
 * banda: la pillola con lo stato e i nomi delle sedi in onda, la conseguenza
 * del salvataggio, e una freccia che apre un pannello sopra il contenuto (non
 * lo spinge). Una voce per sede con la regola e il perché; si chiude con clic
 * fuori, Esc o di nuovo sulla freccia. Le sedi in onda vengono prima.
 */
export function CatalogAppearanceBar({ appearance, businessId }: CatalogAppearanceBarProps) {
    const navigate = useNavigate();
    const summary = describeCatalogSummary(appearance);
    const seats = [...appearance.seats].sort((a, b) => Number(b.reason === "live") - Number(a.reason === "live"));
    const liveNames = seats.filter(seat => seat.reason === "live").map(seat => seat.name);
    // Con una sede sola il nome è già nella pillola.
    const names = liveNames.length > 1 ? liveNames.join(", ") : null;

    return (
        <div className={styles.bar}>
            <Menu
                trigger={
                    <button type="button" className={styles.trigger} aria-label={`Dove è attivo: ${summary.label}`}>
                        <StatusBadge variant={summary.tone} label={summary.label} />
                        {names && (
                            <Text as="span" variant="body-sm" colorVariant="muted" className={styles.names}>
                                {names}
                            </Text>
                        )}
                        <ChevronDown size={16} aria-hidden className={styles.chevron} />
                    </button>
                }
            >
                <Menu.Label>Dove è attivo</Menu.Label>
                {seats.length > 0 ? (
                    seats.map(seat => (
                        <Menu.Item
                            key={seat.activityId}
                            description={`regola ${seat.rule.name?.trim() || "senza nome"} · ${describeSeatReason(seat)}`}
                            onSelect={() => navigate(`/business/${businessId}/scheduling/${seat.rule.id}`)}
                        >
                            {seat.name}
                        </Menu.Item>
                    ))
                ) : (
                    <Menu.Item disabled description="Si assegna dal Calendario.">
                        Nessuna regola lo porta in una sede
                    </Menu.Item>
                )}
            </Menu>
            <Text as="span" variant="body-sm" colorVariant="muted" className={styles.consequence}>
                {CONSEQUENCE[appearance.summary]}
            </Text>
        </div>
    );
}
