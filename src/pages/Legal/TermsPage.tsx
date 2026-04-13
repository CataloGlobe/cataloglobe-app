import LegalLayout from './LegalLayout';
import styles from './TermsPage.module.scss';

const LAST_UPDATED = '2026-04-12';

function formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('it-IT', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

export default function TermsPage() {
    return (
        <LegalLayout otherLegalLink={{ href: '/legal/privacy', label: 'Privacy Policy' }}>
            <div className={styles.content}>
                <h1>Termini e Condizioni</h1>
                <span className={styles.lastUpdated}>
                    Ultimo aggiornamento: {formatDate(LAST_UPDATED)}
                </span>

                <p className={styles.intro}>
                    I presenti Termini e Condizioni regolano l'accesso e l'utilizzo della piattaforma
                    <strong> CataloGlobe</strong>. Utilizzando il servizio, l'utente accetta integralmente
                    i presenti termini. Si prega di leggerli attentamente prima di procedere alla
                    registrazione o all'utilizzo di qualsiasi funzionalità della piattaforma.
                </p>

                {/* 1. Descrizione del servizio */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>01</span>
                        Descrizione del servizio
                    </h2>
                    <p>
                        CataloGlobe è una piattaforma SaaS (Software as a Service) multi-tenant che
                        consente ad aziende, ristoranti, attività commerciali e professionisti di creare,
                        gestire e pubblicare cataloghi digitali, menu, listini prodotti e contenuti
                        multimediali accessibili tramite URL dedicato o codice QR.
                    </p>
                    <p>Il servizio comprende, tra le altre funzionalità:</p>
                    <ul>
                        <li>Creazione e gestione di cataloghi prodotti e menu digitali</li>
                        <li>Gestione di una o più sedi (locations) associate all'azienda</li>
                        <li>Pubblicazione di contenuti in evidenza (highlighted content)</li>
                        <li>Pianificazione della visibilità dei contenuti tramite regole di scheduling</li>
                        <li>Personalizzazione grafica tramite stili configurabili</li>
                        <li>Gestione del team e dei permessi di accesso alla piattaforma</li>
                        <li>Visualizzazione pubblica dei cataloghi senza necessità di autenticazione</li>
                    </ul>
                    <p>
                        CataloGlobe si riserva il diritto di aggiornare, modificare o estendere le
                        funzionalità del servizio nel tempo, con o senza preavviso, fatta salva la
                        notifica di eventuali modifiche sostanziali agli utenti registrati.
                    </p>
                </div>

                {/* 2. Accesso e utilizzo */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>02</span>
                        Accesso e condizioni d'uso
                    </h2>
                    <p>
                        L'accesso all'area gestionale della piattaforma richiede la registrazione
                        di un account con indirizzo email valido e la verifica dell'identità tramite
                        codice OTP. L'utente deve avere almeno 18 anni di età per registrarsi.
                    </p>
                    <p>Utilizzando CataloGlobe, l'utente si impegna a:</p>
                    <ul>
                        <li>
                            Fornire informazioni accurate, aggiornate e veritiere al momento
                            della registrazione e durante l'utilizzo del servizio.
                        </li>
                        <li>
                            Mantenere riservate le credenziali di accesso al proprio account e
                            non condividerle con terze parti non autorizzate.
                        </li>
                        <li>
                            Non utilizzare la piattaforma per scopi illeciti, fraudolenti o
                            lesivi dei diritti di terzi.
                        </li>
                        <li>
                            Non caricare contenuti che violino leggi vigenti, diritti d'autore,
                            marchi registrati, o che siano osceni, offensivi o diffamatori.
                        </li>
                        <li>
                            Non tentare di accedere in modo non autorizzato ai sistemi, ai dati
                            di altri utenti o alle infrastrutture della piattaforma.
                        </li>
                        <li>
                            Non utilizzare strumenti automatizzati (bot, scraper, spider) per
                            estrarre dati dalla piattaforma senza esplicita autorizzazione scritta.
                        </li>
                    </ul>
                    <p>
                        La violazione di queste condizioni potrà comportare la sospensione o la
                        cancellazione dell'account, senza diritto a rimborso per il periodo di
                        abbonamento residuo.
                    </p>
                </div>

                {/* 3. Account e responsabilità */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>03</span>
                        Account e responsabilità dell'utente
                    </h2>
                    <p>
                        Ogni account registrato dà accesso a un'area di lavoro (Workspace) personale
                        da cui è possibile creare e gestire una o più aziende (tenant). L'utente che
                        crea un'azienda ne diventa il titolare (owner) e può invitare altri membri
                        del team assegnando diversi livelli di accesso.
                    </p>
                    <p>
                        L'utente titolare è responsabile di tutte le attività compiute all'interno
                        del proprio account e delle aziende ad esso associate, incluse le azioni
                        eseguite dai membri del team invitati.
                    </p>
                    <div className={styles.infoBox}>
                        <p>
                            <strong>Importante:</strong> i contenuti caricati sui cataloghi pubblici
                            (prodotti, immagini, descrizioni, prezzi) sono di esclusiva responsabilità
                            dell'utente che li pubblica. CataloGlobe non effettua verifica preventiva
                            di tali contenuti.
                        </p>
                    </div>
                </div>

                {/* 4. Proprietà intellettuale */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>04</span>
                        Proprietà intellettuale
                    </h2>
                    <p>
                        <strong>Piattaforma:</strong> CataloGlobe e tutti i suoi componenti (codice
                        sorgente, interfacce, loghi, marchi, design, documentazione) sono di proprietà
                        esclusiva di <span className={styles.placeholder}>[NOME TITOLARE]</span> e
                        sono protetti dalla normativa italiana ed europea sul diritto d'autore e
                        sulla proprietà intellettuale.
                    </p>
                    <p>
                        <strong>Contenuti dell'utente:</strong> i contenuti caricati dall'utente
                        (immagini, descrizioni, dati prodotto) rimangono di proprietà dell'utente stesso.
                        Caricando contenuti sulla piattaforma, l'utente concede a CataloGlobe una
                        licenza non esclusiva, gratuita e limitata al solo scopo di erogare il servizio
                        (es. visualizzare il catalogo agli utenti finali).
                    </p>
                    <p>
                        L'utente garantisce di essere titolare dei diritti sui contenuti caricati o
                        di disporre delle necessarie autorizzazioni, e manleva CataloGlobe da qualsiasi
                        pretesa di terzi in relazione a tali contenuti.
                    </p>
                </div>

                {/* 5. Limitazioni di responsabilità */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>05</span>
                        Limitazioni di responsabilità
                    </h2>
                    <p>
                        Il servizio è fornito "così com'è" (<em>as is</em>) e "come disponibile"
                        (<em>as available</em>). Nei limiti massimi consentiti dalla legge applicabile,
                        CataloGlobe non fornisce garanzie di alcun tipo, esplicite o implicite, in
                        merito a:
                    </p>
                    <ul>
                        <li>La continuità, la disponibilità o l'assenza di errori del servizio.</li>
                        <li>L'idoneità del servizio per uno scopo specifico dell'utente.</li>
                        <li>L'accuratezza o la completezza dei dati visualizzati.</li>
                    </ul>
                    <p>
                        CataloGlobe non sarà responsabile per danni diretti, indiretti, incidentali,
                        speciali o consequenziali derivanti dall'uso o dall'impossibilità di utilizzo
                        del servizio, inclusi — a titolo esemplificativo — perdita di dati, perdita
                        di profitti o interruzione dell'attività.
                    </p>
                    <div className={styles.warningBox}>
                        <p>
                            <strong>Nota:</strong> Alcune giurisdizioni non consentono l'esclusione
                            di determinate garanzie o la limitazione di responsabilità per danni
                            consequenziali. Le limitazioni sopra indicate potrebbero non applicarsi
                            integralmente nel tuo caso.
                        </p>
                    </div>
                </div>

                {/* 6. Disponibilità e manutenzione */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>06</span>
                        Disponibilità del servizio
                    </h2>
                    <p>
                        CataloGlobe si impegna a garantire la massima disponibilità del servizio,
                        ma non può assicurare una disponibilità ininterrotta al 100%. Il servizio
                        potrebbe essere temporaneamente non disponibile per:
                    </p>
                    <ul>
                        <li>Interventi di manutenzione programmata (con preavviso ove possibile)</li>
                        <li>Aggiornamenti tecnici o correzioni di sicurezza urgenti</li>
                        <li>Eventi di forza maggiore o problemi tecnici di fornitori terzi</li>
                    </ul>
                    <p>
                        CataloGlobe non sarà responsabile per eventuali danni o disservizi derivanti
                        da interruzioni del servizio al di fuori del proprio ragionevole controllo.
                    </p>
                </div>

                {/* 7. Abbonamento e pagamenti */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>07</span>
                        Abbonamento e pagamenti
                    </h2>
                    <p>
                        L'utilizzo completo della piattaforma richiede un abbonamento a pagamento
                        secondo i piani tariffari disponibili al momento della sottoscrizione.
                        I dettagli sui piani, i prezzi e le condizioni specifiche sono indicati
                        nella pagina di abbonamento della piattaforma.
                    </p>
                    <ul>
                        <li>
                            I pagamenti sono gestiti tramite il provider sicuro <strong>Stripe</strong>.
                            CataloGlobe non tratta direttamente i dati delle carte di pagamento.
                        </li>
                        <li>
                            Gli abbonamenti si rinnovano automaticamente alla scadenza, salvo
                            disdetta effettuata prima del rinnovo tramite l'area di gestione account.
                        </li>
                        <li>
                            In caso di mancato pagamento, CataloGlobe si riserva il diritto di
                            sospendere l'accesso al servizio fino alla regolarizzazione.
                        </li>
                        <li>
                            I rimborsi sono valutati caso per caso; non è previsto rimborso automatico
                            per periodi di abbonamento già decorsi, salvo diversa disposizione di legge.
                        </li>
                    </ul>
                </div>

                {/* 8. Modifica dei termini */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>08</span>
                        Modifica dei termini
                    </h2>
                    <p>
                        CataloGlobe si riserva il diritto di modificare i presenti Termini e Condizioni
                        in qualsiasi momento. Le modifiche saranno pubblicate su questa pagina con
                        aggiornamento della data di "ultimo aggiornamento".
                    </p>
                    <p>
                        In caso di modifiche sostanziali, gli utenti registrati saranno informati
                        con almeno <strong>30 giorni di preavviso</strong> tramite email o avviso
                        all'interno della piattaforma. L'utilizzo continuato del servizio dopo tale
                        periodo costituisce accettazione dei nuovi termini.
                    </p>
                    <p>
                        Qualora l'utente non accetti le modifiche, potrà recedere dal contratto
                        entro il periodo di preavviso cancellando il proprio account.
                    </p>
                </div>

                {/* 9. Legge applicabile e foro competente */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>09</span>
                        Legge applicabile e foro competente
                    </h2>
                    <p>
                        I presenti Termini e Condizioni sono regolati dalla legge italiana.
                        Per qualsiasi controversia relativa all'interpretazione, all'esecuzione
                        o alla risoluzione del presente contratto, le parti concordano di tentare
                        in primo luogo una composizione amichevole.
                    </p>
                    <p>
                        In caso di mancato accordo, sarà competente in via esclusiva il Tribunale
                        di <span className={styles.placeholder}>[FORO COMPETENTE]</span>, salvo
                        diversa disposizione inderogabile di legge applicabile nei confronti
                        dei consumatori.
                    </p>
                    <div className={styles.infoBox}>
                        <p>
                            <strong>Utenti consumatori (B2C):</strong> qualora l'utente rivesta
                            la qualifica di consumatore ai sensi del D.Lgs. 206/2005 (Codice del
                            Consumo), si applicano le disposizioni inderogabili a sua tutela previste
                            dalla normativa italiana ed europea, incluse quelle relative al foro
                            competente per le controversie.
                        </p>
                    </div>
                </div>

                {/* 10. Disposizioni finali */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>10</span>
                        Disposizioni finali
                    </h2>
                    <p>
                        Qualora una o più clausole dei presenti Termini risultassero invalide o
                        inefficaci, le clausole restanti rimarranno pienamente valide ed efficaci.
                    </p>
                    <p>
                        I presenti Termini e Condizioni costituiscono l'intero accordo tra CataloGlobe
                        e l'utente in merito all'utilizzo del servizio, e sostituiscono qualsiasi
                        accordo o intesa precedente, scritta o verbale, avente il medesimo oggetto.
                    </p>
                    <p>
                        Per qualsiasi comunicazione o richiesta relativa ai presenti Termini,
                        è possibile contattarci all'indirizzo:{' '}
                        <span className={styles.placeholder}>[EMAIL PRIVACY]</span>
                    </p>
                </div>
            </div>
        </LegalLayout>
    );
}
