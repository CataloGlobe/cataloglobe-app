import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import imgCarta from "@/assets/printer-guide/01-carta.png";
import imgInterruttore from "@/assets/printer-guide/02-interruttore.png";
import imgRetro from "@/assets/printer-guide/03-retro.png";
import imgTasto from "@/assets/printer-guide/04-tasto.png";
import imgReportIp from "@/assets/printer-guide/05-report-ip.png";
import imgLogin from "@/assets/printer-guide/06-login.png";
import imgWifiPagina from "@/assets/printer-guide/07-wifi-pagina.png";
import imgWifiDialogo from "@/assets/printer-guide/08-wifi-dialogo.png";
import imgWifiStato from "@/assets/printer-guide/09-wifi-stato.png";
import imgReportSeriale from "@/assets/printer-guide/10-report-seriale.png";
import imgCardOnline from "@/assets/printer-guide/11-card-online.png";
import styles from "./PrinterGuideModal.module.scss";

/**
 * Guida passo passo per collegare una stampante Sunmi, dentro il pannello.
 * Modale centrata (eccezione consapevole alle modali per CRUD): è contenuto
 * guidato, non un'operazione — niente stato da salvare, niente form.
 *
 * Criterio dei confini: un passo = un posto in cui l'utente sta guardando
 * (stampante, foglio, pannello Sunmi, CataloGlobe). Ogni passo mostra tutto
 * quello che il suo testo nomina, quindi può avere più di un'immagine.
 * Copy e ordine seguono `claude/guida-stampante-flusso.md` (10 passi): non vanno
 * riscritti senza un nuovo giro di revisione testi.
 */

type GuideImage = { src: string; alt: string };

type GuideStep = {
    title: string;
    /** Testo che precede le immagini. */
    body: ReactNode;
    images?: GuideImage[];
    /** Testo o callout che segue le immagini (es. avviso 2.4 GHz). */
    after?: ReactNode;
};

/** Premessa: fuori dal conteggio della barra di avanzamento. */
const INTRO: GuideStep = {
    title: "Prima di iniziare",
    body: (
        <>
            <p>
                La configurazione va fatta una volta sola e richiede una decina di
                minuti. Da quel momento ogni ordine inviato dai tavoli viene stampato
                in automatico.
            </p>
            <p>Tieni a portata di mano un cavo di rete e la password del Wi-Fi del locale.</p>
            <p>Sono dieci passi. Puoi fermarti e riprendere: nulla va perso.</p>
        </>
    )
};

const STEPS: GuideStep[] = [
    {
        title: "Carica la carta",
        body: (
            <p>
                Premi il tasto sul frontale per aprire il coperchio. Inserisci il
                rotolo lasciando uscire un lembo di carta dal davanti, poi richiudi
                premendo.
            </p>
        ),
        images: [
            { src: imgCarta, alt: "Fronte della stampante con il vano aperto e il rotolo inserito nel verso giusto" }
        ]
    },
    {
        title: "Accendi la stampante",
        body: (
            <p>
                L&apos;interruttore è in basso sul fianco sinistro, guardando la
                stampante di fronte: premi il lato con la linea verticale. Si accende
                la spia verde.
            </p>
        ),
        images: [
            { src: imgInterruttore, alt: "Fianco sinistro della stampante con l'interruttore di accensione indicato" }
        ]
    },
    {
        title: "Collega il cavo di rete",
        body: (
            <p>
                Attacca un cavo ethernet dal router alla porta di rete sul retro.
                Serve solo per la configurazione: alla fine potrai toglierlo. Quando
                è collegato si accende la spia blu.
            </p>
        ),
        images: [
            { src: imgRetro, alt: "Retro della stampante con la porta di rete indicata" }
        ]
    },
    {
        title: "Stampa il foglio dei dati di rete",
        body: (
            <>
                <p>
                    Premi <strong>due volte di seguito</strong> il tasto di
                    configurazione sul retro: la stampante stampa un foglio con i dati
                    di rete. Non tenerlo premuto: oltre tre secondi la stampante entra
                    in modalità abbinamento, che qui non serve.
                </p>
                <p>
                    Ti serve una riga sola: <code>IP</code>, sotto la voce{" "}
                    <code>[LAN]</code> — una serie di numeri tipo{" "}
                    <code>192.168.1.214</code>. Tieni da parte il foglio: più avanti
                    servirà anche il <code>Serial num</code>.
                </p>
            </>
        ),
        images: [
            { src: imgTasto, alt: "Retro della stampante con il tasto di configurazione indicato" },
            { src: imgReportIp, alt: "Foglio dei dati di rete con la riga IP sotto [LAN] evidenziata" }
        ]
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
                    Lascia la password vuota e premi <strong>Log in</strong>.
                </p>
            </>
        ),
        images: [
            { src: imgLogin, alt: "Schermata Administrator Log in del pannello stampante, con il campo password vuoto" }
        ]
    },
    {
        title: "Apri la configurazione Wi-Fi",
        body: (
            <p>
                Nel menu a sinistra scegli <strong>Wi-Fi</strong>, poi premi{" "}
                <strong>Configure SSID</strong> in fondo alla pagina.
            </p>
        ),
        images: [
            { src: imgWifiPagina, alt: "Pagina Wi-Fi del pannello stampante con il pulsante Configure SSID evidenziato" }
        ]
    },
    {
        title: "Scrivi rete e password",
        body: (
            <p>
                Scrivi il nome della rete e la password, premi <strong>OK</strong>, poi{" "}
                <strong>Save</strong>. Nell&apos;esempio la rete si chiama{" "}
                <code>WiFi-Ristorante</code>.
            </p>
        ),
        images: [
            { src: imgWifiDialogo, alt: "Finestra Configure Wi-Fi compilata con la rete WiFi-Ristorante" }
        ],
        after: (
            <>
                <div className={`${styles.callout} ${styles.calloutAmber}`}>
                    <strong>È il punto dove si sbaglia più spesso.</strong> La stampante
                    funziona solo sulle reti a 2.4 GHz. Se il router ne ha due, scegli
                    quella <em>senza</em> «5G» nel nome: sulla rete sbagliata il
                    salvataggio riesce lo stesso, ma la stampante non si collega e non
                    ti avvisa.
                </div>
                <p>
                    Il nome va scritto a mano, esattamente come appare sul telefono:
                    maiuscole, spazi e punti compresi.
                </p>
            </>
        )
    },
    {
        title: "Verifica e togli il cavo",
        body: (
            <p>
                Ricarica la pagina. Alla voce <strong>IP Address (DHCP)</strong> deve
                comparire un indirizzo, e sotto <strong>SSID</strong> il nome della tua
                rete.
            </p>
        ),
        images: [
            { src: imgWifiStato, alt: "Pagina Wi-Fi con IP Address (DHCP) e SSID valorizzati dopo il collegamento" }
        ],
        after: (
            <>
                <p>
                    Se sono vuoti, la rete scelta non va bene: torna a «Scrivi rete e
                    password» e prova con l&apos;altra.
                </p>
                <p>
                    Quando li vedi, stacca il cavo di rete. La spia blu si spegne per
                    qualche secondo, poi si riaccende da sola: è normale, la stampante
                    si sta collegando al Wi-Fi.
                </p>
            </>
        )
    },
    {
        title: "Collega la stampante a CataloGlobe",
        body: (
            <p>
                Sul foglio di prima trovi <code>Serial num</code>, un codice tipo{" "}
                <code>N4XXXXXXXXXXX</code>. Lo trovi anche sull&apos;etichetta sotto la
                stampante.
            </p>
        ),
        images: [
            { src: imgReportSeriale, alt: "Foglio dei dati di rete con la riga Serial num evidenziata" }
        ],
        after: (
            <p>
                Torna qui, nelle impostazioni della sede, premi{" "}
                <strong>Collega stampante</strong> e inserisci quel codice dando un nome
                alla stampante — per esempio «Cucina».
            </p>
        )
    },
    {
        title: "Controlla che sia collegata",
        body: (
            <p>
                Dopo qualche secondo la stampante compare qui sotto con lo stato{" "}
                <strong>Online</strong>. Da questo momento le comande partono da sole.
            </p>
        ),
        images: [
            { src: imgCardOnline, alt: "Card Stampanti di CataloGlobe con la stampante Cucina in stato Online" }
        ],
        after: (
            <div className={`${styles.callout} ${styles.calloutBlue}`}>
                Il pannello della stampante è raggiungibile da chiunque sia sulla tua
                rete. Se hai un Wi-Fi per i clienti, vale la pena impostare una password
                dal pulsante <strong>Change Password</strong> in alto a destra.
            </div>
        )
    }
];

type TroubleshootItem = {
    title: string;
    body: ReactNode;
};

/**
 * Sezione "Se qualcosa non funziona", visibile solo nella vista "Vedi tutti
 * i passaggi": chi sta installando non ha ancora questi problemi, non va
 * mescolata ai passi guidati. Ordinata per fase: prima l'installazione,
 * poi i cambi di rete, poi l'uso quotidiano.
 */
const TROUBLESHOOT_ITEMS: TroubleshootItem[] = [
    {
        title: "Non riesco ad aprire il pannello della stampante",
        body: (
            <p>
                Verifica di essere collegato alla stessa rete della stampante. Se
                l&apos;indirizzo non risponde, ristampa il foglio premendo due volte di
                seguito il tasto di configurazione: potrebbe essere cambiato.
            </p>
        )
    },
    {
        title: "Ho cambiato router o password del Wi-Fi",
        body: (
            <p>
                Ripeti la procedura da «Stampa il foglio dei dati di rete». Il
                collegamento a CataloGlobe resta valido, non serve reinserire il
                codice.
            </p>
        )
    },
    {
        title: "La stampante era spenta o senza rete",
        body: (
            <p>
                Le comande non si perdono: restano in attesa e vengono stampate quando
                la stampante torna online. Se ne arrivano diverse tutte insieme, sono
                gli ordini ricevuti mentre era offline.
            </p>
        )
    },
    {
        title: "Non esce nessuna comanda",
        body: (
            <p>
                Controlla che ci sia carta e che la spia blu sia accesa. Se un ordine
                non è stato stampato, nella pagina Ordini compare un avviso sulla
                comanda: avvisa la cucina a voce.
            </p>
        )
    },
    {
        title: "Si è accesa la spia bianca",
        body: (
            <p>
                Il rotolo sta per finire. Cambialo appena puoi: quando la carta è
                esaurita le comande restano in attesa finché non ne inserisci uno
                nuovo.
            </p>
        )
    },
    {
        title: "La stampante stampa fogli bianchi",
        body: <p>Il rotolo è inserito al contrario. Aprilo e giralo.</p>
    }
];

const TOTAL_STEPS = STEPS.length;

function StepImages({ images, lazy }: { images?: GuideImage[]; lazy: boolean }) {
    if (!images || images.length === 0) return null;
    return (
        <>
            {images.map(image => (
                <figure key={image.src} className={styles.imageFigure}>
                    <img src={image.src} alt={image.alt} loading={lazy ? "lazy" : "eager"} />
                </figure>
            ))}
        </>
    );
}

/**
 * `lazy` solo nella vista "Vedi tutti i passaggi" (11 immagini impilate, la
 * maggior parte fuori schermo). Nella vista passo passo l'immagine del passo
 * corrente si carica subito: è l'unica cosa sotto il testo e un pop-in
 * ritardato sembra un passo senza foto.
 */
function StepContent({ step, lazy }: { step: GuideStep; lazy: boolean }) {
    return (
        <>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <div className={styles.stepBody}>
                {step.body}
                <StepImages images={step.images} lazy={lazy} />
                {step.after}
            </div>
        </>
    );
}

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

export function PrinterGuideModal({ isOpen, onClose }: Props) {
    // 0 = premessa (fuori dal conteggio), 1..TOTAL_STEPS = passi numerati.
    const [pageIndex, setPageIndex] = useState(0);
    const [showAll, setShowAll] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        setPageIndex(0);
        setShowAll(false);
    }, [isOpen]);

    // Il viewport ha altezza fissa e scroll interno: passando da un passo lungo
    // a uno corto resterebbe scrollato a metà del nuovo contenuto.
    useEffect(() => {
        viewportRef.current?.scrollTo({ top: 0 });
    }, [pageIndex, showAll]);

    const isIntro = pageIndex === 0;
    const isLast = pageIndex === TOTAL_STEPS;
    const current = isIntro ? INTRO : STEPS[pageIndex - 1];

    // Prefetch delle immagini del passo successivo: premendo "Avanti" sono già
    // in cache e il passo compare completo, senza pop-in.
    useEffect(() => {
        if (!isOpen || showAll || isLast) return;
        for (const image of STEPS[pageIndex].images ?? []) {
            new Image().src = image.src;
        }
    }, [isOpen, showAll, isLast, pageIndex]);

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
                {!showAll && !isIntro && (
                    <div className={styles.progressBlock}>
                        <div className={styles.progress}>
                            {STEPS.map((step, idx) => (
                                <div
                                    key={step.title}
                                    className={styles.seg}
                                    data-state={
                                        idx + 1 < pageIndex ? "done" : idx + 1 === pageIndex ? "current" : undefined
                                    }
                                />
                            ))}
                        </div>
                        <p className={styles.stepMeta}>
                            Passo {pageIndex} di {TOTAL_STEPS}
                        </p>
                    </div>
                )}

                <div ref={viewportRef} className={styles.viewport}>
                    {showAll ? (
                        <div className={styles.allSteps}>
                            <section className={styles.allStep}>
                                <StepContent step={INTRO} lazy />
                            </section>
                            {STEPS.map((step, idx) => (
                                <section key={step.title} className={styles.allStep}>
                                    <p className={styles.allStepNumber}>Passo {idx + 1}</p>
                                    <StepContent step={step} lazy />
                                </section>
                            ))}
                            <section className={styles.allStep}>
                                <h3 className={styles.stepTitle}>Se qualcosa non funziona</h3>
                                <div className={styles.troubleshootList}>
                                    {TROUBLESHOOT_ITEMS.map(item => (
                                        <div key={item.title} className={styles.troubleshootItem}>
                                            <p className={styles.troubleshootItemTitle}>{item.title}</p>
                                            <div className={styles.stepBody}>{item.body}</div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className={styles.body}>
                            <StepContent step={current} lazy={false} />
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
                                onClick={() => setPageIndex(i => Math.max(0, i - 1))}
                                className={isIntro ? styles.hidden : undefined}
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
                                        setPageIndex(i => Math.min(TOTAL_STEPS, i + 1));
                                    }}
                                >
                                    {isIntro ? "Inizia" : isLast ? "Ho finito" : "Avanti"}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
