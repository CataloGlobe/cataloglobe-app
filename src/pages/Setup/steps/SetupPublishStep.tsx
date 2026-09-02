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
                    {/* Solo a menù pieno: senza piatti lo diceva già il riquadro
                        ambra qui sotto, e due volte era una volta di troppo. */}
                    {hasProducts && (
                        <div className={styles.status}>
                            <span className={styles.statusDot} aria-hidden />
                            <Text variant="body-sm" weight={600}>
                                Menù visibile
                            </Text>
                        </div>
                    )}

                    <a
                        className={styles.publicUrl}
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {publicUrl}
                    </a>

                    {/* L'unica cosa che resta da fare. Assorbe quel che prima era
                        diviso fra titolo del passo, indicatore di stato e questo
                        riquadro: dicevano tutti e tre la stessa cosa. Titolo
                        sull'azione, non sulla constatazione. */}
                    {!hasProducts && (
                        <div className={styles.notice}>
                            <AlertTriangle
                                size={20}
                                className={styles.noticeIcon}
                                aria-hidden
                            />
                            <div>
                                <Text variant="body-sm" weight={600}>
                                    Aggiungi i piatti prima di stamparlo
                                </Text>
                                <Text variant="caption">
                                    Il QR è definitivo e non cambierà più, ma finché la pagina è
                                    vuota chi lo inquadra non trova nulla.
                                </Text>
                            </div>
                        </div>
                    )}

                    {ruleStatus === "failed" && (
                        <div className={styles.ruleBox} role="alert">
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

                    {/* Il contorno: vero, utile, ma non è quello che si sta
                        cercando adesso. Sotto una linea, piccolo e attenuato —
                        resta leggibile e smette di competere. La spiegazione sul
                        menù diverso a colazione o a cena è caduta: informazione
                        corretta al momento sbagliato, e chi ne ha bisogno la
                        trova in Programmazione. */}
                    <div className={styles.footnotes}>
                        {ruleStatus === "creating" && (
                            <span className={styles.footnoteRow}>
                                <Loader size="sm" />
                                <Text variant="caption" colorVariant="muted">
                                    Sto collegando il menù alla sede…
                                </Text>
                            </span>
                        )}

                        {ruleStatus === "ready" && (
                            <Text variant="caption" colorVariant="muted">
                                Regola &laquo;Menù principale&raquo; creata: {catalogName} è
                                visibile su {activityName} tutti i giorni, a tutte le ore.
                            </Text>
                        )}

                        <Text variant="caption" colorVariant="muted">
                            Il menù usa i colori predefiniti — puoi cambiarli quando vuoi.
                        </Text>
                    </div>
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
