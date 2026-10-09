import { useMemo } from "react";
import { Card } from "@/components/ui/Card/Card";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { PaymentMethodsSection } from "../tabs/hours-services/PaymentMethodsSection";
import { ServicesSection } from "../tabs/hours-services/ServicesSection";
import { FeesSection } from "../tabs/hours-services/FeesSection";
import { feesToState, buildFeesPayload, type FeesState } from "../tabs/hours-services/feesState";
import { useActivityDetail } from "../ActivityDetailContext";
import ActivityOrdiniPrenotazioniRoute from "./ActivityOrdiniPrenotazioniRoute";
import styles from "./ActivityComeLavorateRoute.module.scss";

type FlagField = "payment_methods_public" | "services_public" | "fees_public";

/**
 * Come lavorate (Officina 3, prototipo s3): a sinistra cosa offrite e le
 * prenotazioni, a destra al conto e gli ordini al tavolo. Pagamenti, servizi
 * e tariffe stanno nel draft di pagina (§31.4); prenotazioni e ordini sono le
 * sezioni di prima, ognuna col suo pannello Pro se il piano non le ha.
 */
export default function ActivityComeLavorateRoute() {
    const { canManage, draft } = useActivityDetail();
    const d = draft.draft;

    const visibilitySwitch = (field: FlagField) => (
        <Switch
            size="sm"
            label="Visibile ai clienti"
            checked={Boolean(d[field])}
            onChange={value => draft.set(field, value)}
            disabled={!canManage}
        />
    );

    // Le tariffe sono un array di {key, value}: si editano come stato di
    // stringhe e si riportano nel draft già nella forma salvata.
    const fees: FeesState = useMemo(() => feesToState(d.fees), [d.fees]);
    const setFees = (next: FeesState) => draft.set("fees", buildFeesPayload(next));

    return (
        <div className={styles.grid}>
            <div className={styles.column}>
                <section id="offrite" aria-label="Cosa offrite" className={styles.section}>
                    <Card title="Cosa offrite">
                        <div className={styles.groups}>
                            <div className={styles.group}>
                                <div className={styles.groupHead}>
                                    <Text variant="body-sm" weight={600}>
                                        Pagamenti
                                    </Text>
                                    {visibilitySwitch("payment_methods_public")}
                                </div>
                                <PaymentMethodsSection
                                    value={d.payment_methods ?? []}
                                    onChange={next => draft.set("payment_methods", next)}
                                    disabled={!canManage}
                                />
                            </div>
                            <div className={styles.group}>
                                <div className={styles.groupHead}>
                                    <Text variant="body-sm" weight={600}>
                                        Servizi
                                    </Text>
                                    {visibilitySwitch("services_public")}
                                </div>
                                <ServicesSection
                                    value={d.services ?? []}
                                    onChange={next => draft.set("services", next)}
                                    disabled={!canManage}
                                />
                            </div>
                        </div>
                    </Card>
                </section>
                <ActivityOrdiniPrenotazioniRoute part="prenotazioni" />
            </div>

            <div className={styles.column}>
                <section id="conto" aria-label="Al conto" className={styles.section}>
                    <Card title="Al conto" subtitle="Le vuote non compaiono." actions={visibilitySwitch("fees_public")}>
                        <FeesSection value={fees} onChange={setFees} disabled={!canManage} />
                    </Card>
                </section>
                <ActivityOrdiniPrenotazioniRoute part="ordini" />
            </div>
        </div>
    );
}
