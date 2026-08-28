import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { QrCode, type QrCodeHandle } from "@/components/ui/QrCode/QrCode";
import { Loader } from "@/components/ui/Loader/Loader";
import { buildPublicUrl } from "@/utils/publicUrl";
import styles from "./SetupPublishStep.module.scss";

/** Esito della creazione della regola, che governa il blocco esplicativo. */
export type SetupRuleStatus = "creating" | "ready" | "failed";

type SetupPublishStepProps = {
    businessId: string;
    activityName: string;
    activitySlug: string;
    catalogName: string;
    /** Il ramo import porta prodotti, quello manuale crea un menù vuoto. */
    hasProducts: boolean;
    ruleStatus: SetupRuleStatus;
};

export function SetupPublishStep({
    businessId,
    activityName,
    activitySlug,
    catalogName,
    hasProducts,
    ruleStatus
}: SetupPublishStepProps) {
    const navigate = useNavigate();
    const qrRef = useRef<QrCodeHandle>(null);
    const publicUrl = buildPublicUrl(activitySlug);

    return (
        <div className={styles.step}>
            <div className={styles.summary}>
                <div className={styles.qrColumn}>
                    <QrCode
                        ref={qrRef}
                        value={publicUrl}
                        size={150}
                        fileName={`qr-${activitySlug}`}
                        showActions
                        className={styles.qr}
                    />
                </div>

                <div className={styles.details}>
                    <div className={styles.status} data-tone={hasProducts ? "ok" : "warn"}>
                        <span className={styles.statusDot} aria-hidden />
                        <Text variant="body-sm" weight={600}>
                            {hasProducts ? "Menù visibile" : "Pagina attiva, menù vuoto"}
                        </Text>
                    </div>

                    <a
                        className={styles.publicUrl}
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {publicUrl}
                    </a>

                    {!hasProducts && (
                        <div className={styles.notice}>
                            <AlertTriangle size={16} aria-hidden />
                            <div>
                                <Text variant="body-sm" weight={600}>
                                    Il QR è già quello definitivo
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    Non cambierà più: puoi stamparlo o mandarlo al grafico fin da
                                    ora. Ma finché non aggiungi i piatti, chi lo inquadra trova una
                                    pagina vuota.
                                </Text>
                            </div>
                        </div>
                    )}

                    {ruleStatus === "creating" && (
                        <div className={styles.ruleBox}>
                            <Loader size="sm" />
                            <Text variant="caption" colorVariant="muted">
                                Sto collegando il menù alla sede…
                            </Text>
                        </div>
                    )}

                    {ruleStatus === "ready" && (
                        <div className={styles.ruleBox}>
                            <Text variant="body-sm" weight={600}>
                                Ho creato la regola &laquo;Menù principale&raquo;
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                {catalogName} è visibile su {activityName} tutti i giorni, a tutte
                                le ore, solo per questa sede. Per un menù diverso a colazione o a
                                cena, aggiungi una regola in Programmazione: avrà la precedenza
                                nella sua fascia oraria.
                            </Text>
                        </div>
                    )}

                    {ruleStatus === "failed" && (
                        <div className={styles.ruleBox} data-tone="warn" role="alert">
                            <Text variant="body-sm" weight={600}>
                                Il collegamento non è riuscito
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Sede e menù sono stati creati, ma non sono ancora collegati: la
                                pagina resterà vuota finché non aggiungi una regola in
                                Programmazione.
                            </Text>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => navigate(`/business/${businessId}/scheduling`)}
                            >
                                Vai a Programmazione
                            </Button>
                        </div>
                    )}

                    {/* Sotto il blocco della regola, non sotto il QR: lì sembrava
                        riferirsi al codice invece che al menù. */}
                    <Text variant="caption" colorVariant="muted" className={styles.styleNote}>
                        Il menù usa i colori predefiniti — puoi cambiarli quando vuoi.
                    </Text>
                </div>
            </div>

            <div className={styles.laterBlock}>
                <Text variant="body-sm" weight={600}>
                    Quando vuoi
                </Text>
                {/* Elenco di cose facoltative: i piatti non lo sono, restano
                    l'azione primaria del footer. */}
                <ul className={styles.laterLinks}>
                    <li>
                        <Link to={`/business/${businessId}/styles`}>
                            Personalizza colori e stile
                        </Link>
                    </li>
                    <li>
                        <Link to={`/business/${businessId}/locations`}>
                            Attiva l'ordinazione al tavolo
                        </Link>
                    </li>
                    <li>
                        <Link to={`/business/${businessId}/locations`}>
                            Aggiungi un altro locale
                        </Link>
                    </li>
                </ul>
            </div>
        </div>
    );
}
