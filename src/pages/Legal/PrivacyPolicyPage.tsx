import LegalLayout from './LegalLayout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { COMPANY, getFullAddress } from '@/config/company';
import { CURRENT_CONSENT_VERSIONS } from '@/config/consentVersions';
import styles from './PrivacyPolicyPage.module.scss';

const LAST_UPDATED = CURRENT_CONSENT_VERSIONS.privacy;

function formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('it-IT', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

export default function PrivacyPolicyPage() {
    usePageTitle('Privacy');
    return (
        <LegalLayout otherLegalLink={{ href: '/legal/termini', label: 'Termini e Condizioni' }}>
            <div className={styles.content}>
                <h1>Informativa sulla Privacy</h1>
                <span className={styles.lastUpdated}>
                    Ultimo aggiornamento: {formatDate(LAST_UPDATED)}
                </span>

                <p className={styles.intro}>
                    La presente informativa descrive come <strong>CataloGlobe</strong> raccoglie,
                    utilizza e protegge i dati personali degli utenti, in conformità con il
                    Regolamento (UE) 2016/679 (GDPR) e la normativa italiana vigente in materia
                    di protezione dei dati personali.
                </p>

                {/* 1. Titolare del trattamento */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>01</span>
                        Titolare del trattamento
                    </h2>
                    <p>
                        Il Titolare del trattamento dei dati personali è:
                    </p>
                    <div className={styles.infoBox}>
                        <p>
                            <strong>{COMPANY.legalName}</strong><br />
                            Sede legale: {getFullAddress()}<br />
                            Partita IVA: {COMPANY.vatNumber}<br />
                            Codice REA: {COMPANY.reaCode}<br />
                            Email privacy: <a href={`mailto:${COMPANY.contact.privacy}`}>{COMPANY.contact.privacy}</a><br />
                            PEC: <a href={`mailto:${COMPANY.contact.pec}`}>{COMPANY.contact.pec}</a>
                        </p>
                    </div>
                    <p>
                        Per qualsiasi questione relativa al trattamento dei tuoi dati personali,
                        puoi contattarci all'indirizzo email indicato sopra.
                    </p>
                </div>

                {/* 2. Tipologie di dati raccolti */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>02</span>
                        Tipologie di dati raccolti
                    </h2>
                    <p>
                        CataloGlobe raccoglie le seguenti categorie di dati personali:
                    </p>
                    <p><strong>Dati forniti volontariamente dall'utente:</strong></p>
                    <ul>
                        <li>Indirizzo email e password (per la registrazione e l'accesso all'area gestionale)</li>
                        <li>Nome e cognome o denominazione dell'attività</li>
                        <li>Dati dell'attività commerciale (nome, indirizzo, recapiti pubblici)</li>
                        <li>Informazioni sui prodotti e cataloghi caricati nella piattaforma</li>
                    </ul>
                    <p><strong>Dati raccolti automaticamente:</strong></p>
                    <ul>
                        <li>Dati di navigazione tecnici (indirizzo IP, tipo di browser, sistema operativo)</li>
                        <li>Cookie tecnici necessari al funzionamento del servizio</li>
                        <li>Log di accesso e utilizzo della piattaforma (a fini di sicurezza e diagnostica)</li>
                    </ul>

                    <p><strong>Dati di interazione con la pagina pubblica del menu:</strong></p>
                    <p>
                        Quando un utente visita una pagina pubblica del menu (es. <em>/nome-locale</em>),
                        raccogliamo eventi di interazione anonimi e aggregati per migliorare il servizio:
                        visualizzazioni di prodotti, ricerche effettuate, prodotti aggiunti alla selezione,
                        click su contenuti in evidenza, sezioni visitate, tipologia di dispositivo
                        (mobile/tablet/desktop) e larghezza schermo.
                    </p>
                    <p>
                        Per ciascuna sessione viene generato un identificatore casuale temporaneo che non
                        persiste tra ricaricamenti della pagina e non è collegato ad alcun account utente.
                        Non raccogliamo indirizzo IP, user-agent, geolocalizzazione precisa né dati
                        identificativi del visitatore.
                    </p>
                    <ul>
                        <li>
                            <strong>Base giuridica:</strong> legittimo interesse del Titolare al
                            miglioramento del servizio (art. 6, par. 1, lett. f GDPR).
                        </li>
                        <li>
                            <strong>Conservazione:</strong> i dati di interazione sono conservati per
                            24 mesi e successivamente cancellati o ulteriormente anonimizzati.
                        </li>
                    </ul>

                    <p><strong>Recensioni anonime:</strong></p>
                    <p>
                        Quando un visitatore lascia una recensione tramite la pagina pubblica,
                        raccogliamo: voto numerico (1–5), categoria opzionale del feedback, testo libero
                        opzionale (massimo 2000 caratteri) e l'indirizzo IP del recensore.
                    </p>
                    <ul>
                        <li>
                            <strong>Finalità dell'IP:</strong> l'indirizzo IP è utilizzato esclusivamente
                            per prevenire abusi (rate limiting anti-spam) ed è conservato per 6 mesi.
                        </li>
                        <li>
                            <strong>Base giuridica:</strong> legittimo interesse del Titolare alla
                            prevenzione di abusi (art. 6, par. 1, lett. f GDPR).
                        </li>
                    </ul>
                </div>

                {/* 3. Finalità e modalità del trattamento */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>03</span>
                        Finalità e modalità del trattamento
                    </h2>
                    <p>I dati personali raccolti vengono trattati per le seguenti finalità:</p>
                    <ul>
                        <li>
                            <strong>Fornitura del servizio:</strong> creazione e gestione dell'account,
                            erogazione delle funzionalità della piattaforma CataloGlobe.
                        </li>
                        <li>
                            <strong>Sicurezza e prevenzione delle frodi:</strong> protezione dell'account utente,
                            verifica dell'identità tramite OTP, rilevamento di accessi non autorizzati.
                        </li>
                        <li>
                            <strong>Comunicazioni di servizio:</strong> invio di notifiche tecniche, aggiornamenti
                            relativi al servizio, comunicazioni relative all'account.
                        </li>
                        <li>
                            <strong>Adempimenti legali:</strong> adempimento degli obblighi previsti dalla legge,
                            dai regolamenti o dalla normativa comunitaria.
                        </li>
                        <li>
                            <strong>Miglioramento del servizio:</strong> analisi aggregate e anonime sull'utilizzo
                            della piattaforma per migliorare funzionalità ed esperienza utente.
                        </li>
                        <li>
                            <strong>Analisi delle interazioni sui menu pubblici:</strong> migliorare il servizio
                            attraverso l'analisi aggregata e anonima delle interazioni dei visitatori con i
                            menu pubblici (vedi Sezione 02 — Dati di interazione).
                        </li>
                    </ul>
                    <p>
                        Il trattamento avviene con modalità prevalentemente automatizzate, nel rispetto
                        delle misure tecniche e organizzative adeguate a garantire la sicurezza dei dati.
                    </p>
                </div>

                {/* 4. Base giuridica */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>04</span>
                        Base giuridica del trattamento
                    </h2>
                    <p>Il trattamento dei tuoi dati personali si fonda sulle seguenti basi giuridiche:</p>
                    <ul>
                        <li>
                            <strong>Esecuzione di un contratto</strong> (art. 6, par. 1, lett. b GDPR): il trattamento
                            è necessario per fornire il servizio richiesto dall'utente al momento della registrazione.
                        </li>
                        <li>
                            <strong>Legittimo interesse</strong> (art. 6, par. 1, lett. f GDPR): per finalità di
                            sicurezza informatica, prevenzione delle frodi e miglioramento del servizio.
                        </li>
                        <li>
                            <strong>Adempimento di obblighi legali</strong> (art. 6, par. 1, lett. c GDPR):
                            quando il trattamento è necessario per rispettare obblighi normativi.
                        </li>
                        <li>
                            <strong>Consenso</strong> (art. 6, par. 1, lett. a GDPR): per eventuali comunicazioni
                            promozionali o analisi facoltative, previa raccolta del consenso esplicito.
                        </li>
                    </ul>
                </div>

                {/* 5. Periodo di conservazione */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>05</span>
                        Periodo di conservazione
                    </h2>
                    <p>
                        I dati personali vengono conservati per il tempo strettamente necessario a
                        perseguire le finalità per cui sono stati raccolti:
                    </p>
                    <ul>
                        <li>
                            <strong>Dati dell'account attivo:</strong> per tutta la durata del rapporto contrattuale
                            e per i 12 mesi successivi alla sua cessazione.
                        </li>
                        <li>
                            <strong>Dati di log e sicurezza:</strong> fino a 12 mesi dalla raccolta,
                            salvo diversi obblighi di legge.
                        </li>
                        <li>
                            <strong>Dati per adempimenti fiscali e legali:</strong> per il periodo previsto
                            dalla normativa applicabile (generalmente 10 anni).
                        </li>
                        <li>
                            <strong>Dati dei cataloghi pubblici:</strong> eliminati entro 30 giorni dalla
                            cancellazione dell'account o dalla richiesta dell'utente.
                        </li>
                    </ul>
                    <p>
                        Decorsi i termini di conservazione, i dati saranno cancellati o resi anonimi
                        in modo irreversibile.
                    </p>
                </div>

                {/* 6. Diritti dell'interessato */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>06</span>
                        Diritti dell'interessato (GDPR artt. 15–22)
                    </h2>
                    <p>
                        In qualità di interessato, hai il diritto di esercitare in qualsiasi momento
                        i seguenti diritti, contattando il Titolare all'indirizzo indicato nella sezione 1:
                    </p>
                    <div className={styles.rightsGrid}>
                        <div className={styles.rightItem}>
                            <strong>Accesso (art. 15)</strong>
                            <span>Ottenere conferma del trattamento e copia dei tuoi dati personali.</span>
                        </div>
                        <div className={styles.rightItem}>
                            <strong>Rettifica (art. 16)</strong>
                            <span>Richiedere la correzione di dati inesatti o incompleti.</span>
                        </div>
                        <div className={styles.rightItem}>
                            <strong>Cancellazione (art. 17)</strong>
                            <span>Richiedere la cancellazione dei tuoi dati ("diritto all'oblio").</span>
                        </div>
                        <div className={styles.rightItem}>
                            <strong>Limitazione (art. 18)</strong>
                            <span>Richiedere la sospensione temporanea del trattamento.</span>
                        </div>
                        <div className={styles.rightItem}>
                            <strong>Portabilità (art. 20)</strong>
                            <span>Ricevere i tuoi dati in formato strutturato e leggibile.</span>
                        </div>
                        <div className={styles.rightItem}>
                            <strong>Opposizione (art. 21)</strong>
                            <span>Opporti al trattamento fondato su legittimo interesse.</span>
                        </div>
                        <div className={styles.rightItem}>
                            <strong>Revoca del consenso (art. 7)</strong>
                            <span>Revocare il consenso prestato in qualsiasi momento.</span>
                        </div>
                        <div className={styles.rightItem}>
                            <strong>Reclamo (art. 77)</strong>
                            <span>
                                Proporre reclamo all'Autorità Garante per la Protezione dei Dati Personali (
                                <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">
                                    www.garanteprivacy.it
                                </a>
                                ).
                            </span>
                        </div>
                    </div>
                    <p>
                        Le richieste saranno evase entro 30 giorni dalla ricezione, salvo casi di
                        particolare complessità che richiedano fino a 90 giorni (previo avviso).
                    </p>
                </div>

                {/* 7. Cookie Policy */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>07</span>
                        Cookie Policy
                    </h2>

                    <p><strong>Cookie e tecnologie di archiviazione locale</strong></p>
                    <p>
                        Sulla pagina pubblica del menu non utilizziamo cookie HTTP scritti dal nostro
                        codice. Utilizziamo invece le seguenti tecnologie di archiviazione locale del
                        browser, tutte considerate tecniche/funzionali e non richiedenti consenso esplicito:
                    </p>

                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th scope="col">Chiave</th>
                                <th scope="col">Tipo</th>
                                <th scope="col">Scopo</th>
                                <th scope="col">Durata</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code>fab_visit_&lt;id&gt;</code></td>
                                <td>localStorage</td>
                                <td>
                                    Memorizza l'ultima visita di un utente a una sede, per gestire
                                    l'apparizione del pulsante recensioni.
                                </td>
                                <td>Persistente (logica applicativa: 4 ore)</td>
                            </tr>
                            <tr>
                                <td><code>fab_reviewed_&lt;id&gt;</code></td>
                                <td>localStorage</td>
                                <td>
                                    Memorizza l'invio di una recensione, per evitare richieste ripetute.
                                </td>
                                <td>Persistente (logica applicativa: 24 ore)</td>
                            </tr>
                            <tr>
                                <td><code>catalogobe-selection-&lt;id&gt;</code></td>
                                <td>sessionStorage</td>
                                <td>
                                    Memorizza la selezione di prodotti dell'utente durante la sessione.
                                </td>
                                <td>Solo durata sessione browser</td>
                            </tr>
                            <tr>
                                <td>Identificatore di sessione analytics</td>
                                <td>Memoria volatile (RAM)</td>
                                <td>
                                    Genera un ID casuale per aggregare gli eventi di una singola
                                    sessione di navigazione.
                                </td>
                                <td>Solo durata pagina (cancellato al ricaricamento)</td>
                            </tr>
                        </tbody>
                    </table>

                    <p><strong>Tecnologie di terze parti utilizzate sulla pagina pubblica</strong></p>
                    <ul>
                        <li>
                            <strong>Google Fonts</strong> (<em>fonts.googleapis.com</em>): per il
                            caricamento dei font web. Non installa cookie, ma genera richieste HTTP
                            che includono il vostro indirizzo IP. Per maggiori informazioni:{' '}
                            <a
                                href="https://policies.google.com/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Privacy Google
                            </a>.
                        </li>
                        <li>
                            <strong>Supabase</strong>: in qualità di responsabile del trattamento per
                            l'erogazione del servizio.
                        </li>
                    </ul>

                    <p><strong>Cookie tecnici dell'area amministrativa</strong></p>
                    <p>
                        L'accesso all'area riservata (gestione del menu da parte del cliente) utilizza
                        tecnologie di archiviazione locale del browser (<code>localStorage</code> e{' '}
                        <code>sessionStorage</code>) anziché cookie HTTP. Si tratta in ogni caso di
                        strumenti tecnici indispensabili all'erogazione del servizio che, ai sensi
                        dell'art. 122 del Codice Privacy, non richiedono il consenso dell'utente. Tali
                        voci sono accessibili solo agli utenti registrati e amministratori.
                    </p>

                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th scope="col">Chiave</th>
                                <th scope="col">Tipo</th>
                                <th scope="col">Scopo</th>
                                <th scope="col">Durata</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code>sb-&lt;id&gt;-auth-token</code></td>
                                <td>localStorage / sessionStorage</td>
                                <td>
                                    Mantiene la sessione di accesso all'area riservata (token di
                                    autenticazione e dati utente). Indispensabile per restare autenticati.
                                </td>
                                <td>
                                    localStorage: fino al logout o alla scadenza del refresh token.
                                    sessionStorage: fino alla chiusura del browser.
                                </td>
                            </tr>
                            <tr>
                                <td><code>authRememberMe</code></td>
                                <td>localStorage</td>
                                <td>
                                    Memorizza la scelta "Ricordami" che determina dove viene conservata
                                    la sessione.
                                </td>
                                <td>Fino a modifica o logout</td>
                            </tr>
                            <tr>
                                <td><code>passwordRecoveryFlow</code></td>
                                <td>sessionStorage</td>
                                <td>
                                    Indicatore temporaneo attivo durante la procedura di reimpostazione
                                    password.
                                </td>
                                <td>Fino alla chiusura del browser</td>
                            </tr>
                        </tbody>
                    </table>

                    <p>
                        I cookie e le tecnologie di archiviazione tecniche non richiedono il consenso
                        dell'utente ai sensi dell'art. 122 del Codice Privacy (D.Lgs. 196/2003) come
                        modificato dal D.Lgs. 101/2018.
                    </p>
                </div>

                {/* 8. Condivisione dei dati */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>08</span>
                        Condivisione dei dati con terze parti
                    </h2>
                    <p>
                        I dati personali non vengono venduti, ceduti o comunicati a terze parti,
                        salvo nei seguenti casi:
                    </p>
                    <ul>
                        <li>
                            <strong>Fornitori di servizi tecnologici</strong> (responsabili del trattamento):
                            Supabase Inc. (infrastruttura database e autenticazione, USA — con garanzie
                            GDPR tramite Clausole Contrattuali Standard); Stripe Inc. (gestione pagamenti);
                            Resend Inc. (invio email transazionali).
                        </li>
                        <li>
                            <strong>Obblighi di legge:</strong> quando richiesto da autorità competenti,
                            organi giudiziari o dalla normativa vigente.
                        </li>
                    </ul>
                    <p>
                        I dati dei cataloghi pubblici (nome dell'attività, prodotti, immagini, orari)
                        sono visibili a chiunque acceda all'URL o al QR code del catalogo, come
                        liberamente configurato dall'azienda titolare del catalogo stesso.
                    </p>
                    <p>
                        I dati relativi ai cataloghi pubblici delle attività (nome, prodotti, prezzi,
                        orari e informazioni pubblicamente visibili) possono essere indicizzati e resi
                        ricercabili tramite altri servizi digitali facenti capo a CataloGlobe di
                        D'Elia Alessandro, incluse eventuali piattaforme di ricerca locale sviluppate
                        in futuro. L'utente accetta tale utilizzo al momento della registrazione alla
                        piattaforma, sia in versione gratuita che a pagamento. È possibile richiedere
                        in qualsiasi momento l'esclusione da tale indicizzazione contattando il Titolare.
                    </p>
                </div>

                {/* 9. Modifiche */}
                <div className={styles.section}>
                    <h2>
                        <span className={styles.sectionNum}>09</span>
                        Modifiche alla presente informativa
                    </h2>
                    <p>
                        Il Titolare si riserva il diritto di apportare modifiche alla presente
                        informativa in qualsiasi momento. In caso di modifiche sostanziali, gli utenti
                        registrati saranno informati tramite email o tramite avviso prominente sulla
                        piattaforma. La data di "ultimo aggiornamento" in cima a questa pagina indica
                        quando la versione corrente è entrata in vigore.
                    </p>
                    <p>
                        L'utilizzo continuato del servizio dopo la notifica delle modifiche costituisce
                        accettazione della nuova versione dell'informativa.
                    </p>
                </div>
            </div>
        </LegalLayout>
    );
}
