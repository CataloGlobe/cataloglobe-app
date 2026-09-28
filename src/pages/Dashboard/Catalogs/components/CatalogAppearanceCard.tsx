import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { describeCatalogSummary, describeSeatReason, type Appearance } from "@/utils/ruleAppearance";

const CONSEQUENCE: Record<Appearance["summary"], string> = {
    liveNow: "Quello che cambi qui lo vedono subito. Non c'è una bozza: il menù è uno e va in onda com'è.",
    assigned: "Adesso non lo vede nessuno, ma una regola viva lo porta: le modifiche vanno in onda con lei.",
    stoppedOnly: "Lo nominano solo regole ferme: puoi lavorarci senza che nessuno veda niente.",
    unassigned: "Puoi lavorarci senza che nessuno veda niente."
};

/** Oltre, la banda si apre a richiesta: il dettaglio è l'albero, non la banda. */
const VISIBLE_SEATS = 4;

type CatalogAppearanceCardProps = {
    appearance: Appearance;
    businessId: string;
};

/**
 * La banda del dettaglio (§23.2, #244): chi lo sta guardando adesso, sede per
 * sede, e perché una sede non lo mostra. Tre toni: accento in onda, ambra
 * assegnato ma non adesso, neutro altrimenti. Ogni riga apre la sua regola.
 * Le sedi in onda vengono prima; oltre quattro, «Mostra tutte».
 */
export function CatalogAppearanceCard({ appearance, businessId }: CatalogAppearanceCardProps) {
    const summary = describeCatalogSummary(appearance);
    const [expanded, setExpanded] = useState(false);
    const seats = [...appearance.seats].sort((a, b) => Number(b.reason === "live") - Number(a.reason === "live"));
    const hidden = expanded ? 0 : Math.max(0, seats.length - VISIBLE_SEATS);
    const visible = hidden > 0 ? seats.slice(0, VISIBLE_SEATS) : seats;
    return (
        <Card
            title="Dove è attivo"
            badge={<StatusBadge variant={summary.tone} label={summary.label} />}
            subtitle={CONSEQUENCE[appearance.summary]}
            flush={appearance.seats.length > 0}
            actions={
                seats.length > VISIBLE_SEATS ? (
                    <Button variant="ghost" size="sm" onClick={() => setExpanded(value => !value)}>
                        {expanded ? "Mostra meno" : `Mostra tutte (${seats.length})`}
                    </Button>
                ) : undefined
            }
        >
            {appearance.seats.length > 0 ? (
                <div role="list" aria-label="Dove è attivo">
                    {visible.map(seat => (
                        <div role="listitem" key={seat.activityId}>
                            <ListRow
                                dense
                                muted={seat.reason !== "live"}
                                to={`/business/${businessId}/scheduling/${seat.rule.id}`}
                                title={seat.name}
                                subtitle={`regola ${seat.rule.name?.trim() || "senza nome"} · ${describeSeatReason(seat)}`}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <Text variant="body-sm" colorVariant="muted">
                    Nessuna regola di Programmazione lo porta in una sede.
                </Text>
            )}
        </Card>
    );
}
