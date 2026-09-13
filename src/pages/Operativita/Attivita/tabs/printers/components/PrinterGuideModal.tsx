import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import imgCarta from "@/assets/printer-guide/01-carta.jpg";
import imgRetro from "@/assets/printer-guide/02-retro.jpg";
import imgReportRete from "@/assets/printer-guide/03-report-rete.jpg";
import imgConfigureWifi from "@/assets/printer-guide/04-configure-wifi.png";
import styles from "./PrinterGuideModal.module.scss";

/**
 * Guida passo passo per collegare una stampante Sunmi, dentro il pannello.
 * Modale centrata (eccezione consapevole alle modali per CRUD): è contenuto
 * guidato, non un'operazione — niente stato da salvare, niente form.
 *
 * Copy e ordine degli step riprendono il mockup fornito dal prodotto: non
 * vanno riscritti senza un nuovo giro di revisione testi.
 */

type GuideStep = {
    title: string;
    body: ReactNode;
    image?: { src: string; alt: string };
};

const STEPS: GuideStep[] = [
    {
        title: "Prima di iniziare",
        body: (
            <>
                <p>
                    La configurazione va fatta una volta sola e richiede circa dieci
                    minuti. Da quel momento ogni ordine inviato dai tavoli viene
                    stampato in automatico.
                </p>
                <div className={`${styles.callout} ${styles.calloutAmber}`}>
                    Funzionano solo le stampanti acquistate dal nostro link: vengono
                    abbinate al nostro sistema al momento della spedizione. Gli stessi
                    modelli comprati altrove non possono essere collegati.
                </div>
                <p>Tieni a portata di mano un cavo di rete e la password del Wi-Fi del locale.</p>
            </>
        )
    },
    {
        title: "Carta e accensione",
        body: (
            <>
                <p>
                    Premi il tasto sul frontale per aprire il coperchio. Inserisci il
                    rotolo lasciando uscire un lembo di carta dal davanti, poi richiudi
                    premendo.
                </p>
                <p>
                    Accendi dal tasto sul retro, lato <code>I</code>. Deve accendersi
                    la spia verde.
                </p>
            </>
        ),
        image: { src: imgCarta, alt: "Vano carta aperto con rotolo di carta inserito nel verso giusto" }
    },
    {
        title: "Collega il cavo di rete",
        body: (
            <>
                <p>
                    Attacca un cavo ethernet dal router alla porta sul retro della
                    stampante. Serve solo per questa configurazione: alla fine potrai
                    toglierlo.
                </p>
                <p>Quando è collegata si accende la spia blu.</p>
            </>
        ),
        image: { src: imgRetro, alt: "Retro della stampante con la porta di rete e il tasto di accensione indicati" }
    },
    {
        title: "Trova l'indirizzo della stampante",
        body: (
            <>
                <p>
                    Premi <strong>due volte di seguito</strong> il tastino sul retro,
                    quello piccolo vicino alle porte. La stampante stampa un foglio
                    con i dati di rete.
                </p>
                <p>
                    Ti serve una sola riga: <code>IP</code>, sotto la voce{" "}
                    <code>[LAN]</code>. È una serie di numeri tipo{" "}
                    <code>192.168.1.214</code>. Non buttare il foglio: più avanti ti
                    servirà anche il <code>Serial num</code>.
                </p>
            </>
        ),
        image: { src: imgReportRete, alt: "Report di rete stampato dalla stampante, con la riga IP evidenziata" }
    },
    {
        title: "Apri il pannello della stampante",
        body: (
            <>
                <p>
                    Da un computer o un telefono collegato alla <strong>stessa rete</strong>,
                    apri il browser e scrivi quell&apos;indirizzo nella barra in alto.
                </p>
                <p>
                    Si apre una schermata di accesso: lascia la password vuota e premi{" "}
                    <strong>Log in</strong>.
                </p>
            </>
        )
    },
    {
        title: "Imposta il Wi-Fi",
        body: (
            <>
                <p>
                    Nel menu a sinistra scegli <strong>Wi-Fi</strong>, poi{" "}
                    <strong>Configure SSID</strong>. Scrivi il nome della rete e la
                    password, premi <strong>OK</strong> e poi <strong>Save</strong>.
                </p>
                <div className={`${styles.callout} ${styles.calloutAmber}`}>
                    <strong>Attenzione, è il punto dove si sbaglia più spesso.</strong>{" "}
                    La stampante funziona solo sulle reti a 2.4 GHz. Se il router ha due
                    reti, scegli quella <em>senza</em> &quot;5G&quot; nel nome. Sulla rete
                    sbagliata il salvataggio riesce lo stesso, ma la stampante non si
                    collega e non ti avvisa.
                </div>
                <p>
                    Il nome va scritto a mano, esattamente come appare sul telefono:
                    maiuscole, spazi e punti compresi.
                </p>
            </>
        ),
        image: { src: imgConfigureWifi, alt: "Finestra Configure Wi-Fi del pannello stampante, compilata" }
    },
    {
        title: "Verifica e togli il cavo",
        body: (
            <>
                <p>
                    Ricarica la pagina. Alla voce <strong>IP Address (DHCP)</strong>{" "}
                    deve comparire un indirizzo, e sotto <strong>SSID</strong> il nome
                    della tua rete.
                </p>
                <p>Se sono ancora vuoti, la rete scelta non va bene: torna indietro e prova con l&apos;altra.</p>
                <p>Quando li vedi, stacca il cavo di rete. La stampante resta collegata da sola.</p>
            </>
        )
    },
    {
        title: "Inserisci il codice",
        body: (
            <>
                <p>
                    Sul foglio di prima trovi <code>Serial num</code>, un codice tipo{" "}
                    <code>N439264T10762</code>. Lo trovi anche sull&apos;etichetta sotto
                    la stampante.
                </p>
                <p>
                    Chiudi questa guida, premi <strong>Collega stampante</strong> e
                    inserisci quel codice dando un nome alla stampante — per esempio
                    &quot;Cucina&quot;.
                </p>
                <div className={`${styles.callout} ${styles.calloutBlue}`}>
                    Il pannello della stampante è raggiungibile da chiunque sia sulla
                    tua rete. Se hai un Wi-Fi per i clienti, vale la pena impostare una
                    password dal pulsante <strong>Change Password</strong> in alto a
                    destra.
                </div>
            </>
        )
    }
];

const TOTAL_STEPS = STEPS.length;

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

export function PrinterGuideModal({ isOpen, onClose }: Props) {
    const [stepIndex, setStepIndex] = useState(0);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setStepIndex(0);
        setShowAll(false);
    }, [isOpen]);

    const isFirst = stepIndex === 0;
    const isLast = stepIndex === TOTAL_STEPS - 1;

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="sm" height="fit">
            <ModalLayoutHeader>
                <Text as="h2" variant="title-sm" weight={600}>
                    Collega la tua stampante
                </Text>
                <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Chiudi">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                </button>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                {!showAll && (
                    <div className={styles.progressBlock}>
                        <div className={styles.progress}>
                            {STEPS.map((step, idx) => (
                                <div
                                    key={step.title}
                                    className={styles.seg}
                                    data-state={idx < stepIndex ? "done" : idx === stepIndex ? "current" : undefined}
                                />
                            ))}
                        </div>
                        <p className={styles.stepMeta}>
                            Passo {stepIndex + 1} di {TOTAL_STEPS}
                        </p>
                    </div>
                )}

                <div className={styles.viewport}>
                    {showAll ? (
                        <div className={styles.allSteps}>
                            {STEPS.map((step, idx) => (
                                <section key={step.title} className={styles.allStep}>
                                    <p className={styles.allStepNumber}>Passo {idx + 1}</p>
                                    <h3 className={styles.stepTitle}>{step.title}</h3>
                                    <div className={styles.stepBody}>{step.body}</div>
                                    {step.image && (
                                        <figure className={styles.imageFigure}>
                                            <img src={step.image.src} alt={step.image.alt} loading="lazy" />
                                        </figure>
                                    )}
                                </section>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.body}>
                            <h3 className={styles.stepTitle}>{STEPS[stepIndex].title}</h3>
                            <div className={styles.stepBody}>{STEPS[stepIndex].body}</div>
                            {STEPS[stepIndex].image && (
                                <figure className={styles.imageFigure}>
                                    <img
                                        src={STEPS[stepIndex].image!.src}
                                        alt={STEPS[stepIndex].image!.alt}
                                        loading="lazy"
                                    />
                                </figure>
                            )}
                        </div>
                    )}
                </div>
            </ModalLayoutContent>

            <ModalLayoutFooter>
                <div className={styles.footerRow}>
                    {showAll ? (
                        <>
                            <button type="button" className={styles.link} onClick={() => setShowAll(false)}>
                                Torna alla guida passo passo
                            </button>
                            <Button variant="secondary" size="sm" onClick={onClose}>
                                Chiudi
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                                className={isFirst ? styles.hidden : undefined}
                            >
                                Indietro
                            </Button>
                            <div className={styles.footerRight}>
                                <button type="button" className={styles.link} onClick={() => setShowAll(true)}>
                                    Vedi tutti i passaggi
                                </button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        if (isLast) {
                                            onClose();
                                            return;
                                        }
                                        setStepIndex(i => Math.min(TOTAL_STEPS - 1, i + 1));
                                    }}
                                >
                                    {isLast ? "Ho finito" : "Avanti"}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
