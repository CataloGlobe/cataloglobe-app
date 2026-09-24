import { useEffect, useId, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { TableMultiSelect } from "@/components/ui/TableMultiSelect/TableMultiSelect";
import type { V2Table } from "@/types/orders";
import Text from "@/components/ui/Text/Text";
import styles from "./Reservations.module.scss";

// ── Arriva gente senza prenotazione ───────────────────────────────────────
// Un walk-in NON crea una prenotazione. È la ragione per cui `seatings`
// esiste come unità propria: una prenotazione finta sporcherebbe l'agenda,
// il conteggio "Oggi · N prenotazioni" e la scheda cliente. Chi entra senza
// prenotare non ha prenotato, e il sistema deve saperlo dire.
//
// Due campi, entrambi FACOLTATIVI come la RPC `open_walkin_seating`. I
// coperti restano facoltativi anche se sembra naturale richiederli:
// all'ingresso, di fretta, l'host tocca il tavolo e va. Un campo
// obbligatorio renderebbe il gesto più lento della realtà che registra — e i
// coperti si correggono dopo, dal drawer della tavolata.

const FORM_ID = "walkin-seating-form";

interface Props {
    open: boolean;
    onClose: () => void;
    /** Tavoli della sede (senza soft-deleted). `undefined` = non ancora caricati. */
    tables?: V2Table[];
    /** table_id → chi lo occupa ADESSO (le tavolate aperte). Mostrato, non impedito. */
    occupiedBy?: ReadonlyMap<string, string>;
    /**
     * Apre la tavolata. Ritorna true se riuscita: il parent ha già ricaricato
     * e mostrato il toast; il drawer si chiude da solo.
     */
    onSubmit: (tableIds: string[], partySize: number | null) => Promise<boolean>;
}

export default function WalkinCreateDrawer({
    open,
    onClose,
    tables,
    occupiedBy,
    onSubmit
}: Props) {
    const titleId = useId();
    const [tableIds, setTableIds] = useState<string[]>([]);
    const [partySize, setPartySize] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Ogni apertura parte pulita: un walk-in non eredita niente dal precedente.
    useEffect(() => {
        if (!open) return;
        setTableIds([]);
        setPartySize("");
        setError(null);
        setSaving(false);
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;

        // Vuoto = "non lo so ancora" (NULL sulla riga), che è diverso da zero.
        // Zero e negativi li rifiuta la RPC con 22023; qui si ferma prima,
        // con una frase leggibile.
        let covers: number | null = null;
        const trimmed = partySize.trim();
        if (trimmed !== "") {
            const n = parseInt(trimmed, 10);
            if (!Number.isFinite(n) || n <= 0) {
                setError("I coperti devono essere almeno uno.");
                return;
            }
            covers = n;
        }
        setError(null);

        setSaving(true);
        const ok = await onSubmit(tableIds, covers);
        setSaving(false);
        if (ok) onClose();
    };

    const footer = (
        <div className={styles.drawerFooter}>
            <Button variant="ghost" disabled={saving} onClick={onClose}>
                Annulla
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" loading={saving}>
                Apri tavolata
            </Button>
        </div>
    );

    return (
        <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby={titleId}>
            <DrawerLayout
                title="Tavolata senza prenotazione"
                titleId={titleId}
                onClose={onClose}
                footer={footer}
            >
                <form id={FORM_ID} onSubmit={handleSubmit} className={styles.drawerBody}>
                    <section className={styles.drawerSection}>
                        <Text as="h3" variant="caption-xs" weight={600} colorVariant="muted" className={styles.drawerSectionTitle}>Tavolo</Text>
                        {tables === undefined ? (
                            <Text as="p" variant="caption" colorVariant="muted" className={styles.drawerTableHint}>Caricamento dei tavoli…</Text>
                        ) : (
                            <TableMultiSelect
                                tables={tables}
                                value={tableIds}
                                onChange={setTableIds}
                                occupiedBy={occupiedBy}
                                disabled={saving}
                            />
                        )}
                        <Text as="p" variant="caption" colorVariant="muted" className={styles.drawerTableHint}>
                            Facoltativo: si può assegnare anche dopo.
                        </Text>
                    </section>

                    <section className={styles.drawerSection}>
                        <Text as="h3" variant="caption-xs" weight={600} colorVariant="muted" className={styles.drawerSectionTitle}>Coperti</Text>
                        <NumberInput
                            label="Quanti sono"
                            min={1}
                            inputMode="numeric"
                            value={partySize}
                            onChange={e => setPartySize(e.target.value)}
                            error={error ?? undefined}
                            disabled={saving}
                        />
                        <Text as="p" variant="caption" colorVariant="muted" className={styles.drawerTableHint}>
                            Facoltativo: si correggono dopo, dalla tavolata.
                        </Text>
                    </section>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
