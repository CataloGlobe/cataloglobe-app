import LegalLayout from './LegalLayout';
import { usePageTitle } from '@/hooks/usePageTitle';
import styles from './PrivacyPolicyPage.module.scss';

const LAST_UPDATED = '2026-04-12';

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
                            <strong><span className={styles.placeholder}>[NOME TITOLARE]</span></strong><br />
                            Sede legale: <span className={styles.placeholder}>[INDIRIZZO SEDE]</span><br />
                            Partita IVA: <span className={styles.placeholder}>[P.IVA]</span><br />
                            Email privacy: <span className={styles.placeholder}>[EMAIL PRIVACY]</span>
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
                        <li>Dati di visualizzazione aggregati dei cataloghi pubblici (in futuro, previa informativa aggiornata)</li>
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
                            <span>Proporre reclamo all'Autorità Garante (www.garanteprivacy.it).</span>
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
                    <p>
                        CataloGlobe utilizza esclusivamente <strong>cookie tecnici</strong> necessari
                        al funzionamento della piattaforma. Non vengono utilizzati cookie di profilazione
                        o di tracciamento di terze parti senza previo consenso.
                    </p>
                    <p><strong>Cookie tecnici utilizzati:</strong></p>
                    <ul>
                        <li>
                            <strong>Cookie di sessione (autenticazione):</strong> gestione della sessione
                            autenticata dell'utente, necessari per il corretto funzionamento dell'area
                            gestionale. Durata: sessione (eliminati alla chiusura del browser) o token
                            persistente con scadenza configurata.
                        </li>
                        <li>
                            <strong>Cookie di preferenze:</strong> memorizzazione delle preferenze di
                            visualizzazione (es. tema chiaro/scuro). Durata: 12 mesi.
                        </li>
                    </ul>
                    <p>
                        I cookie tecnici non richiedono il consenso dell'utente ai sensi dell'art. 122
                        del Codice Privacy (D.Lgs. 196/2003) come modificato dal D.Lgs. 101/2018.
                    </p>
                    <div className={styles.infoBox}>
                        <p>
                            <strong>Nota:</strong> In futuro, CataloGlobe potrebbe introdurre strumenti
                            di analytics (es. dati aggregati sulle visualizzazioni dei cataloghi). Prima
                            di qualsiasi utilizzo di cookie non tecnici verrà aggiornata la presente
                            informativa e, ove necessario, verrà richiesto il tuo consenso.
                        </p>
                    </div>
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
