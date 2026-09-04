/**
 * Testo dell'informativa privacy prenotazioni, parametrico, nelle cinque lingue
 * della pagina pubblica.
 *
 * ⚠️ Il testo italiano è la versione autoritativa: viene da
 * `informativa-privacy-prenotazioni.md` (documento di lavoro, versione 2,
 * settembre 2026) e va riportato alla lettera. Le altre quattro lingue sono
 * traduzioni fedeli di quello, non riformulazioni: un'informativa che in tedesco
 * promette qualcosa di diverso da quella italiana è due informative diverse.
 * Chi modifica una sezione le modifica tutte e cinque nello stesso commit.
 *
 * Perché vive qui e non nei `public.json` sotto `src/i18n/locales`: quei bundle sono
 * importati staticamente da `src/i18n/index.ts` e finiscono nel chunk di
 * hydration del catalogo, che è il percorso LCP-critico pagato da ogni scansione
 * di QR. Questo documento è lungo, lo apre una minoranza di clienti, e sta
 * dentro il chunk lazy della sola pagina che lo usa.
 *
 * Il markup ammesso nelle stringhe è la sola enfasi ristretta `**grassetto**`
 * gestita da `parseInlineEmphasis` (nodi TS, mai HTML → nessun vettore XSS).
 */

import type { PublicLang } from "./types";

/**
 * Data dell'ultima revisione del testo, non della singola build: compare come
 * "Ultimo aggiornamento" e serve a sapere quale versione era in vigore. Da
 * aggiornare a mano quando il testo cambia in modo sostanziale.
 */
export const NOTICE_VERSION = "2026-09-04";

/** Segnaposto compilati con i dati della sede. */
export interface NoticeParams {
    venueName: string;
    legalName: string;
    /** Indirizzo su una riga, composto lato edge. */
    address: string | null;
    contactEmail: string;
    /** Presente solo se la sede ha `phone_public = true`. */
    phone: string | null;
    /** Ragione sociale del responsabile ex art. 28 — da `COMPANY.legalName`. */
    processorLegalName: string;
    /** Data versione già formattata nella lingua corrente. */
    versionDate: string;
}

export type NoticeBlock =
    | { kind: "p"; text: string }
    | { kind: "ul"; items: string[] }
    | { kind: "table"; head: [string, string]; rows: Array<[string, string]> };

export interface NoticeSection {
    /** Numero mostrato nel titolo e usato come ancora (`#s1`). */
    num: number;
    title: string;
    blocks: NoticeBlock[];
}

export interface NoticeCopy {
    /** Titolo del documento. */
    docTitle: string;
    /** Sottotitolo: "Prenotazioni presso {venueName}". */
    docSubtitle: string;
    /** Riga di riferimento normativo. */
    docReference: string;
    lastUpdatedLabel: string;
    /** Etichetta del sommario a inizio pagina. */
    tocLabel: string;
    backLabel: string;
    sections: NoticeSection[];
    /** Schermata quando l'informativa non può essere generata. */
    unavailable: {
        title: string;
        body: string;
    };
    /** Schermata quando lo slug non esiste o la rete cade. */
    error: {
        title: string;
        body: string;
    };
    loading: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// IT — versione autoritativa
// ─────────────────────────────────────────────────────────────────────────────

const it: NoticeCopy = {
    docTitle: "Informativa sul trattamento dei dati personali",
    docSubtitle: "Prenotazioni presso {venueName}",
    docReference: "Ai sensi dell'art. 13 del Regolamento (UE) 2016/679 — GDPR",
    lastUpdatedLabel: "Ultimo aggiornamento: {versionDate}",
    tocLabel: "Contenuti",
    backLabel: "Indietro",
    loading: "Caricamento dell'informativa…",
    unavailable: {
        title: "Informativa non disponibile",
        body: "Questo locale non ha ancora completato i dati necessari a pubblicare la propria informativa privacy. Per sapere come vengono trattati i tuoi dati puoi contattare direttamente il locale."
    },
    error: {
        title: "Informativa non raggiungibile",
        body: "Non è stato possibile caricare l'informativa. Riprova più tardi o contatta direttamente il locale."
    },
    sections: [
        {
            num: 1,
            title: "Chi tratta i tuoi dati",
            blocks: [
                { kind: "p", text: "Il titolare del trattamento è **{legalName}**, con sede in {address}." },
                { kind: "p", text: "Per qualsiasi richiesta relativa ai tuoi dati personali puoi scrivere a {contactEmail}{phoneClause}." },
                { kind: "p", text: "Il titolare non ha nominato un Responsabile della protezione dei dati (DPO), non ricorrendone i presupposti di legge." }
            ]
        },
        {
            num: 2,
            title: "Quali dati raccogliamo",
            blocks: [
                { kind: "p", text: "**Quando prenoti un tavolo:**" },
                {
                    kind: "ul",
                    items: [
                        "**nome**, **numero di telefono** e **indirizzo email**",
                        "**data, ora e numero di persone** della prenotazione",
                        "**eventuali note** che scegli di aggiungere",
                        "la **lingua** in cui hai compilato il modulo"
                    ]
                },
                { kind: "p", text: "Se prenoti telefonicamente o di persona, il personale inserisce gli stessi dati per tuo conto." },
                { kind: "p", text: "**Una scheda cliente che resta nel tempo.** Le tue prenotazioni presso questo locale vengono raccolte in una scheda associata al tuo numero di telefono, che contiene i tuoi contatti, lo storico delle visite — comprese quelle a cui non ti sei presentato — ed eventuali annotazioni del personale utili al servizio, come una preferenza sul tavolo. Questa scheda **resta anche dopo che la singola prenotazione è passata**, per il periodo indicato al punto 7." },
                { kind: "p", text: "**Dati tecnici.** Registriamo in forma cifrata un identificativo derivato dal tuo indirizzo IP, per impedire l'uso automatizzato o abusivo del modulo di prenotazione. Non conserviamo l'indirizzo in chiaro e non lo usiamo per identificarti." }
            ]
        },
        {
            num: 3,
            title: "Perché li usiamo e su quale base",
            blocks: [
                {
                    kind: "table",
                    head: ["Finalità", "Base giuridica"],
                    rows: [
                        ["Gestire la tua prenotazione: registrarla, confermarla o rifiutarla, contattarti in caso di problemi", "Esecuzione di misure precontrattuali e del contratto (art. 6.1.b)"],
                        ["Inviarti l'email di conferma, il promemoria il giorno prima e il link per annullare autonomamente", "Esecuzione del contratto (art. 6.1.b)"],
                        ["Conservare lo storico delle tue prenotazioni e le annotazioni di servizio, per riconoscerti come cliente e servirti meglio", "Legittimo interesse del titolare a gestire la relazione con la propria clientela (art. 6.1.f)"],
                        ["Proteggere il modulo di prenotazione da usi automatizzati o abusivi", "Legittimo interesse del titolare alla sicurezza del servizio (art. 6.1.f)"]
                    ]
                },
                { kind: "p", text: "**Non usiamo i tuoi dati per inviarti comunicazioni promozionali.** Se in futuro lo faremo, te lo chiederemo separatamente e potrai rifiutare senza alcuna conseguenza sulla prenotazione." },
                { kind: "p", text: "**Non prendiamo decisioni automatizzate** che producano effetti giuridici nei tuoi confronti. La disponibilità dei tavoli è calcolata automaticamente, ma l'accettazione della prenotazione resta una decisione del locale." }
            ]
        },
        {
            num: 4,
            title: "Se ci fornisci informazioni sulla salute",
            blocks: [
                { kind: "p", text: "Il campo delle note è libero: **non ti chiediamo informazioni sulla tua salute**. Se scegli spontaneamente di segnalarci un'allergia o un'intolleranza per permetterci di servirti in sicurezza, tratteremo quell'informazione solo a quel fine, sulla base del consenso che manifesti fornendocela, e non la useremo per altro." },
                { kind: "p", text: "Puoi chiederci in qualsiasi momento di cancellarla." }
            ]
        },
        {
            num: 5,
            title: "Conferire i dati è obbligatorio?",
            blocks: [
                { kind: "p", text: "Nome, telefono ed email sono **necessari** per prenotare: senza, non possiamo registrare la prenotazione né contattarti. Le note sono **facoltative**." }
            ]
        },
        {
            num: 6,
            title: "Chi altro vede i tuoi dati",
            blocks: [
                { kind: "p", text: "I tuoi dati sono accessibili al personale del locale autorizzato a gestire le prenotazioni." },
                { kind: "p", text: "Per erogare il servizio ci avvaliamo di fornitori che trattano i dati **per nostro conto**, come responsabili del trattamento ai sensi dell'art. 28 GDPR:" },
                {
                    kind: "ul",
                    items: [
                        "**{processorLegalName}** — piattaforma di gestione delle prenotazioni",
                        "**Supabase Inc.** — infrastruttura di database e servizi applicativi",
                        "**Resend** — invio delle email transazionali"
                    ]
                },
                { kind: "p", text: "**Non vendiamo e non cediamo i tuoi dati a terzi per finalità loro.**" },
                { kind: "p", text: "Alcuni di questi fornitori hanno sede negli Stati Uniti. Gli eventuali trasferimenti avvengono sulla base delle garanzie previste dal GDPR (decisione di adeguatezza EU–US Data Privacy Framework o clausole contrattuali standard approvate dalla Commissione Europea)." }
            ]
        },
        {
            num: 7,
            title: "Per quanto tempo li conserviamo",
            blocks: [
                { kind: "p", text: "**36 mesi** dalla data dell'ultima prenotazione. Trascorso tale periodo la scheda cliente e le prenotazioni collegate sono cancellate, salvo diverso obbligo di legge." }
            ]
        },
        {
            num: 8,
            title: "I tuoi diritti",
            blocks: [
                { kind: "p", text: "Puoi in qualsiasi momento chiedere di:" },
                {
                    kind: "ul",
                    items: [
                        "**accedere** ai tuoi dati e ottenerne copia",
                        "**rettificare** dati inesatti o incompleti",
                        "**cancellare** i tuoi dati",
                        "**limitare** il trattamento",
                        "**opporti** al trattamento fondato sul legittimo interesse",
                        "ricevere i tuoi dati in formato leggibile da dispositivo automatico (**portabilità**)"
                    ]
                },
                { kind: "p", text: "Per esercitarli scrivi a {contactEmail}. Ti risponderemo entro un mese." },
                { kind: "p", text: "Hai inoltre il diritto di proporre **reclamo al Garante per la protezione dei dati personali** (www.garanteprivacy.it) se ritieni che il trattamento violi il Regolamento." }
            ]
        }
    ]
};

// ─────────────────────────────────────────────────────────────────────────────
// EN
// ─────────────────────────────────────────────────────────────────────────────

const en: NoticeCopy = {
    docTitle: "Privacy notice on the processing of personal data",
    docSubtitle: "Reservations at {venueName}",
    docReference: "Pursuant to Art. 13 of Regulation (EU) 2016/679 — GDPR",
    lastUpdatedLabel: "Last updated: {versionDate}",
    tocLabel: "Contents",
    backLabel: "Back",
    loading: "Loading the privacy notice…",
    unavailable: {
        title: "Privacy notice not available",
        body: "This venue has not yet completed the details required to publish its privacy notice. To find out how your data is processed, you can contact the venue directly."
    },
    error: {
        title: "Privacy notice unavailable",
        body: "The privacy notice could not be loaded. Please try again later or contact the venue directly."
    },
    sections: [
        {
            num: 1,
            title: "Who processes your data",
            blocks: [
                { kind: "p", text: "The data controller is **{legalName}**, with registered office at {address}." },
                { kind: "p", text: "For any request concerning your personal data you can write to {contactEmail}{phoneClause}." },
                { kind: "p", text: "The controller has not appointed a Data Protection Officer (DPO), as the legal requirements for doing so do not apply." }
            ]
        },
        {
            num: 2,
            title: "What data we collect",
            blocks: [
                { kind: "p", text: "**When you book a table:**" },
                {
                    kind: "ul",
                    items: [
                        "**name**, **phone number** and **email address**",
                        "**date, time and number of people** of the reservation",
                        "**any notes** you choose to add",
                        "the **language** in which you filled in the form"
                    ]
                },
                { kind: "p", text: "If you book by phone or in person, staff enter the same data on your behalf." },
                { kind: "p", text: "**A customer record that persists over time.** Your reservations at this venue are collected in a record linked to your phone number, containing your contact details, your visit history — including visits you did not show up for — and any staff notes useful to the service, such as a table preference. This record **remains even after the individual reservation has passed**, for the period indicated in section 7." },
                { kind: "p", text: "**Technical data.** We store, in encrypted form, an identifier derived from your IP address, in order to prevent automated or abusive use of the reservation form. We do not keep the address in clear text and we do not use it to identify you." }
            ]
        },
        {
            num: 3,
            title: "Why we use it and on what basis",
            blocks: [
                {
                    kind: "table",
                    head: ["Purpose", "Legal basis"],
                    rows: [
                        ["Managing your reservation: recording it, confirming or declining it, contacting you in case of problems", "Performance of pre-contractual measures and of the contract (Art. 6.1.b)"],
                        ["Sending you the confirmation email, the reminder the day before and the link to cancel on your own", "Performance of the contract (Art. 6.1.b)"],
                        ["Keeping the history of your reservations and the service notes, in order to recognise you as a customer and serve you better", "Legitimate interest of the controller in managing the relationship with its customers (Art. 6.1.f)"],
                        ["Protecting the reservation form from automated or abusive use", "Legitimate interest of the controller in the security of the service (Art. 6.1.f)"]
                    ]
                },
                { kind: "p", text: "**We do not use your data to send you promotional communications.** Should we do so in future, we will ask you separately and you will be able to refuse with no consequences for your reservation." },
                { kind: "p", text: "**We do not take automated decisions** producing legal effects concerning you. Table availability is calculated automatically, but accepting the reservation remains a decision of the venue." }
            ]
        },
        {
            num: 4,
            title: "If you give us health information",
            blocks: [
                { kind: "p", text: "The notes field is free text: **we do not ask you for information about your health**. If you spontaneously choose to tell us about an allergy or an intolerance so that we can serve you safely, we will process that information solely for that purpose, on the basis of the consent you express by providing it, and we will not use it for anything else." },
                { kind: "p", text: "You can ask us to delete it at any time." }
            ]
        },
        {
            num: 5,
            title: "Is providing the data mandatory?",
            blocks: [
                { kind: "p", text: "Name, phone number and email are **necessary** in order to book: without them we cannot record the reservation or contact you. Notes are **optional**." }
            ]
        },
        {
            num: 6,
            title: "Who else sees your data",
            blocks: [
                { kind: "p", text: "Your data is accessible to venue staff authorised to manage reservations." },
                { kind: "p", text: "To provide the service we rely on suppliers who process the data **on our behalf**, as processors pursuant to Art. 28 GDPR:" },
                {
                    kind: "ul",
                    items: [
                        "**{processorLegalName}** — reservation management platform",
                        "**Supabase Inc.** — database infrastructure and application services",
                        "**Resend** — transactional email delivery"
                    ]
                },
                { kind: "p", text: "**We do not sell or transfer your data to third parties for their own purposes.**" },
                { kind: "p", text: "Some of these suppliers are based in the United States. Any transfers take place on the basis of the safeguards provided for by the GDPR (EU–US Data Privacy Framework adequacy decision or standard contractual clauses approved by the European Commission)." }
            ]
        },
        {
            num: 7,
            title: "How long we keep it",
            blocks: [
                { kind: "p", text: "**36 months** from the date of the last reservation. After that period the customer record and the linked reservations are deleted, unless a different legal obligation applies." }
            ]
        },
        {
            num: 8,
            title: "Your rights",
            blocks: [
                { kind: "p", text: "At any time you can ask to:" },
                {
                    kind: "ul",
                    items: [
                        "**access** your data and obtain a copy of it",
                        "**rectify** inaccurate or incomplete data",
                        "**erase** your data",
                        "**restrict** the processing",
                        "**object** to processing based on legitimate interest",
                        "receive your data in a machine-readable format (**portability**)"
                    ]
                },
                { kind: "p", text: "To exercise them, write to {contactEmail}. We will reply within one month." },
                { kind: "p", text: "You also have the right to lodge a **complaint with the Italian Data Protection Authority, the Garante per la protezione dei dati personali** (www.garanteprivacy.it) if you believe the processing infringes the Regulation." }
            ]
        }
    ]
};

// ─────────────────────────────────────────────────────────────────────────────
// FR
// ─────────────────────────────────────────────────────────────────────────────

const fr: NoticeCopy = {
    docTitle: "Information sur le traitement des données à caractère personnel",
    docSubtitle: "Réservations chez {venueName}",
    docReference: "Conformément à l'art. 13 du Règlement (UE) 2016/679 — RGPD",
    lastUpdatedLabel: "Dernière mise à jour : {versionDate}",
    tocLabel: "Sommaire",
    backLabel: "Retour",
    loading: "Chargement de l'information…",
    unavailable: {
        title: "Information non disponible",
        body: "Cet établissement n'a pas encore renseigné les données nécessaires à la publication de son information sur la protection des données. Pour savoir comment vos données sont traitées, vous pouvez contacter directement l'établissement."
    },
    error: {
        title: "Information inaccessible",
        body: "L'information n'a pas pu être chargée. Réessayez plus tard ou contactez directement l'établissement."
    },
    sections: [
        {
            num: 1,
            title: "Qui traite vos données",
            blocks: [
                { kind: "p", text: "Le responsable du traitement est **{legalName}**, dont le siège est situé {address}." },
                { kind: "p", text: "Pour toute demande relative à vos données à caractère personnel, vous pouvez écrire à {contactEmail}{phoneClause}." },
                { kind: "p", text: "Le responsable du traitement n'a pas désigné de délégué à la protection des données (DPO), les conditions légales n'étant pas réunies." }
            ]
        },
        {
            num: 2,
            title: "Quelles données nous recueillons",
            blocks: [
                { kind: "p", text: "**Lorsque vous réservez une table :**" },
                {
                    kind: "ul",
                    items: [
                        "**nom**, **numéro de téléphone** et **adresse e-mail**",
                        "**date, heure et nombre de personnes** de la réservation",
                        "**les éventuelles notes** que vous choisissez d'ajouter",
                        "la **langue** dans laquelle vous avez rempli le formulaire"
                    ]
                },
                { kind: "p", text: "Si vous réservez par téléphone ou sur place, le personnel saisit les mêmes données pour vous." },
                { kind: "p", text: "**Une fiche client qui reste dans le temps.** Vos réservations dans cet établissement sont regroupées dans une fiche associée à votre numéro de téléphone, contenant vos coordonnées, l'historique de vos visites — y compris celles auxquelles vous ne vous êtes pas présenté — et les éventuelles annotations du personnel utiles au service, comme une préférence de table. Cette fiche **subsiste même après que la réservation est passée**, pendant la durée indiquée au point 7." },
                { kind: "p", text: "**Données techniques.** Nous enregistrons sous forme chiffrée un identifiant dérivé de votre adresse IP, afin d'empêcher l'usage automatisé ou abusif du formulaire de réservation. Nous ne conservons pas l'adresse en clair et ne l'utilisons pas pour vous identifier." }
            ]
        },
        {
            num: 3,
            title: "Pourquoi nous les utilisons et sur quelle base",
            blocks: [
                {
                    kind: "table",
                    head: ["Finalité", "Base juridique"],
                    rows: [
                        ["Gérer votre réservation : l'enregistrer, la confirmer ou la refuser, vous contacter en cas de problème", "Exécution de mesures précontractuelles et du contrat (art. 6.1.b)"],
                        ["Vous envoyer l'e-mail de confirmation, le rappel la veille et le lien pour annuler vous-même", "Exécution du contrat (art. 6.1.b)"],
                        ["Conserver l'historique de vos réservations et les annotations de service, afin de vous reconnaître comme client et de mieux vous servir", "Intérêt légitime du responsable du traitement à gérer la relation avec sa clientèle (art. 6.1.f)"],
                        ["Protéger le formulaire de réservation contre les usages automatisés ou abusifs", "Intérêt légitime du responsable du traitement à la sécurité du service (art. 6.1.f)"]
                    ]
                },
                { kind: "p", text: "**Nous n'utilisons pas vos données pour vous envoyer des communications promotionnelles.** Si nous le faisions à l'avenir, nous vous le demanderions séparément et vous pourriez refuser sans aucune conséquence sur la réservation." },
                { kind: "p", text: "**Nous ne prenons pas de décisions automatisées** produisant des effets juridiques à votre égard. La disponibilité des tables est calculée automatiquement, mais l'acceptation de la réservation reste une décision de l'établissement." }
            ]
        },
        {
            num: 4,
            title: "Si vous nous fournissez des informations sur votre santé",
            blocks: [
                { kind: "p", text: "Le champ des notes est libre : **nous ne vous demandons pas d'informations sur votre santé**. Si vous choisissez spontanément de nous signaler une allergie ou une intolérance afin que nous puissions vous servir en toute sécurité, nous traiterons cette information uniquement à cette fin, sur la base du consentement que vous exprimez en nous la communiquant, et nous ne l'utiliserons pour rien d'autre." },
                { kind: "p", text: "Vous pouvez à tout moment nous demander de la supprimer." }
            ]
        },
        {
            num: 5,
            title: "La fourniture des données est-elle obligatoire ?",
            blocks: [
                { kind: "p", text: "Le nom, le téléphone et l'e-mail sont **nécessaires** pour réserver : sans eux, nous ne pouvons ni enregistrer la réservation ni vous contacter. Les notes sont **facultatives**." }
            ]
        },
        {
            num: 6,
            title: "Qui d'autre voit vos données",
            blocks: [
                { kind: "p", text: "Vos données sont accessibles au personnel de l'établissement autorisé à gérer les réservations." },
                { kind: "p", text: "Pour fournir le service, nous faisons appel à des prestataires qui traitent les données **pour notre compte**, en qualité de sous-traitants au sens de l'art. 28 du RGPD :" },
                {
                    kind: "ul",
                    items: [
                        "**{processorLegalName}** — plateforme de gestion des réservations",
                        "**Supabase Inc.** — infrastructure de base de données et services applicatifs",
                        "**Resend** — envoi des e-mails transactionnels"
                    ]
                },
                { kind: "p", text: "**Nous ne vendons ni ne cédons vos données à des tiers pour leurs propres finalités.**" },
                { kind: "p", text: "Certains de ces prestataires sont établis aux États-Unis. Les éventuels transferts ont lieu sur la base des garanties prévues par le RGPD (décision d'adéquation EU–US Data Privacy Framework ou clauses contractuelles types approuvées par la Commission européenne)." }
            ]
        },
        {
            num: 7,
            title: "Combien de temps nous les conservons",
            blocks: [
                { kind: "p", text: "**36 mois** à compter de la date de la dernière réservation. Passé ce délai, la fiche client et les réservations liées sont supprimées, sauf obligation légale contraire." }
            ]
        },
        {
            num: 8,
            title: "Vos droits",
            blocks: [
                { kind: "p", text: "Vous pouvez à tout moment demander à :" },
                {
                    kind: "ul",
                    items: [
                        "**accéder** à vos données et en obtenir une copie",
                        "**rectifier** des données inexactes ou incomplètes",
                        "**effacer** vos données",
                        "**limiter** le traitement",
                        "**vous opposer** au traitement fondé sur l'intérêt légitime",
                        "recevoir vos données dans un format lisible par machine (**portabilité**)"
                    ]
                },
                { kind: "p", text: "Pour les exercer, écrivez à {contactEmail}. Nous vous répondrons dans un délai d'un mois." },
                { kind: "p", text: "Vous avez en outre le droit d'introduire une **réclamation auprès de l'autorité italienne de protection des données, le Garante per la protezione dei dati personali** (www.garanteprivacy.it) si vous estimez que le traitement viole le Règlement." }
            ]
        }
    ]
};

// ─────────────────────────────────────────────────────────────────────────────
// DE
// ─────────────────────────────────────────────────────────────────────────────

const de: NoticeCopy = {
    docTitle: "Information zur Verarbeitung personenbezogener Daten",
    docSubtitle: "Reservierungen bei {venueName}",
    docReference: "Gemäß Art. 13 der Verordnung (EU) 2016/679 — DSGVO",
    lastUpdatedLabel: "Letzte Aktualisierung: {versionDate}",
    tocLabel: "Inhalt",
    backLabel: "Zurück",
    loading: "Information wird geladen…",
    unavailable: {
        title: "Information nicht verfügbar",
        body: "Dieser Betrieb hat die für die Veröffentlichung seiner Datenschutzinformation erforderlichen Angaben noch nicht vervollständigt. Um zu erfahren, wie Ihre Daten verarbeitet werden, können Sie sich direkt an den Betrieb wenden."
    },
    error: {
        title: "Information nicht erreichbar",
        body: "Die Information konnte nicht geladen werden. Versuchen Sie es später erneut oder wenden Sie sich direkt an den Betrieb."
    },
    sections: [
        {
            num: 1,
            title: "Wer Ihre Daten verarbeitet",
            blocks: [
                { kind: "p", text: "Verantwortlicher für die Verarbeitung ist **{legalName}**, mit Sitz in {address}." },
                { kind: "p", text: "Für jede Anfrage zu Ihren personenbezogenen Daten können Sie an {contactEmail} schreiben{phoneClause}." },
                { kind: "p", text: "Der Verantwortliche hat keinen Datenschutzbeauftragten (DSB) benannt, da die gesetzlichen Voraussetzungen dafür nicht vorliegen." }
            ]
        },
        {
            num: 2,
            title: "Welche Daten wir erheben",
            blocks: [
                { kind: "p", text: "**Wenn Sie einen Tisch reservieren:**" },
                {
                    kind: "ul",
                    items: [
                        "**Name**, **Telefonnummer** und **E-Mail-Adresse**",
                        "**Datum, Uhrzeit und Personenzahl** der Reservierung",
                        "**etwaige Anmerkungen**, die Sie hinzufügen möchten",
                        "die **Sprache**, in der Sie das Formular ausgefüllt haben"
                    ]
                },
                { kind: "p", text: "Wenn Sie telefonisch oder persönlich reservieren, gibt das Personal dieselben Daten für Sie ein." },
                { kind: "p", text: "**Ein Kundenprofil, das über die Zeit bestehen bleibt.** Ihre Reservierungen in diesem Betrieb werden in einem Profil zusammengeführt, das Ihrer Telefonnummer zugeordnet ist und Ihre Kontaktdaten, den Verlauf Ihrer Besuche — einschließlich derer, zu denen Sie nicht erschienen sind — sowie etwaige für den Service nützliche Anmerkungen des Personals enthält, etwa eine Tischpräferenz. Dieses Profil **bleibt auch nach Ablauf der einzelnen Reservierung bestehen**, für den unter Punkt 7 angegebenen Zeitraum." },
                { kind: "p", text: "**Technische Daten.** Wir speichern in verschlüsselter Form eine aus Ihrer IP-Adresse abgeleitete Kennung, um die automatisierte oder missbräuchliche Nutzung des Reservierungsformulars zu verhindern. Wir bewahren die Adresse nicht im Klartext auf und verwenden sie nicht, um Sie zu identifizieren." }
            ]
        },
        {
            num: 3,
            title: "Warum wir sie nutzen und auf welcher Grundlage",
            blocks: [
                {
                    kind: "table",
                    head: ["Zweck", "Rechtsgrundlage"],
                    rows: [
                        ["Verwaltung Ihrer Reservierung: Erfassung, Bestätigung oder Ablehnung, Kontaktaufnahme bei Problemen", "Erfüllung vorvertraglicher Maßnahmen und des Vertrags (Art. 6.1.b)"],
                        ["Zusendung der Bestätigungs-E-Mail, der Erinnerung am Vortag und des Links zur eigenständigen Absage", "Erfüllung des Vertrags (Art. 6.1.b)"],
                        ["Aufbewahrung des Verlaufs Ihrer Reservierungen und der Serviceanmerkungen, um Sie als Gast wiederzuerkennen und besser zu bedienen", "Berechtigtes Interesse des Verantwortlichen an der Pflege der Beziehung zu seinen Gästen (Art. 6.1.f)"],
                        ["Schutz des Reservierungsformulars vor automatisierter oder missbräuchlicher Nutzung", "Berechtigtes Interesse des Verantwortlichen an der Sicherheit des Dienstes (Art. 6.1.f)"]
                    ]
                },
                { kind: "p", text: "**Wir nutzen Ihre Daten nicht, um Ihnen Werbung zu senden.** Sollten wir das künftig tun, fragen wir Sie gesondert, und Sie können ohne jede Folge für die Reservierung ablehnen." },
                { kind: "p", text: "**Wir treffen keine automatisierten Entscheidungen**, die Ihnen gegenüber rechtliche Wirkung entfalten. Die Tischverfügbarkeit wird automatisch berechnet, die Annahme der Reservierung bleibt jedoch eine Entscheidung des Betriebs." }
            ]
        },
        {
            num: 4,
            title: "Wenn Sie uns Gesundheitsangaben mitteilen",
            blocks: [
                { kind: "p", text: "Das Anmerkungsfeld ist ein Freitextfeld: **wir fragen Sie nicht nach Angaben zu Ihrer Gesundheit**. Wenn Sie uns von sich aus eine Allergie oder eine Unverträglichkeit mitteilen, damit wir Sie sicher bedienen können, verarbeiten wir diese Angabe ausschließlich zu diesem Zweck, auf der Grundlage der Einwilligung, die Sie mit der Mitteilung erklären, und verwenden sie für nichts anderes." },
                { kind: "p", text: "Sie können uns jederzeit bitten, sie zu löschen." }
            ]
        },
        {
            num: 5,
            title: "Ist die Angabe der Daten verpflichtend?",
            blocks: [
                { kind: "p", text: "Name, Telefonnummer und E-Mail-Adresse sind zum Reservieren **erforderlich**: ohne sie können wir die Reservierung nicht erfassen und Sie nicht kontaktieren. Anmerkungen sind **freiwillig**." }
            ]
        },
        {
            num: 6,
            title: "Wer Ihre Daten außerdem sieht",
            blocks: [
                { kind: "p", text: "Ihre Daten sind für das zur Verwaltung der Reservierungen befugte Personal des Betriebs zugänglich." },
                { kind: "p", text: "Zur Erbringung des Dienstes greifen wir auf Dienstleister zurück, die die Daten **in unserem Auftrag** als Auftragsverarbeiter im Sinne von Art. 28 DSGVO verarbeiten:" },
                {
                    kind: "ul",
                    items: [
                        "**{processorLegalName}** — Plattform zur Verwaltung von Reservierungen",
                        "**Supabase Inc.** — Datenbankinfrastruktur und Anwendungsdienste",
                        "**Resend** — Versand transaktionaler E-Mails"
                    ]
                },
                { kind: "p", text: "**Wir verkaufen und übermitteln Ihre Daten nicht an Dritte für dessen eigene Zwecke.**" },
                { kind: "p", text: "Einige dieser Dienstleister haben ihren Sitz in den Vereinigten Staaten. Etwaige Übermittlungen erfolgen auf der Grundlage der von der DSGVO vorgesehenen Garantien (Angemessenheitsbeschluss EU–US Data Privacy Framework oder von der Europäischen Kommission genehmigte Standardvertragsklauseln)." }
            ]
        },
        {
            num: 7,
            title: "Wie lange wir sie aufbewahren",
            blocks: [
                { kind: "p", text: "**36 Monate** ab dem Datum der letzten Reservierung. Nach Ablauf dieses Zeitraums werden das Kundenprofil und die damit verbundenen Reservierungen gelöscht, sofern keine anderslautende gesetzliche Pflicht besteht." }
            ]
        },
        {
            num: 8,
            title: "Ihre Rechte",
            blocks: [
                { kind: "p", text: "Sie können jederzeit verlangen:" },
                {
                    kind: "ul",
                    items: [
                        "**Auskunft** über Ihre Daten und eine Kopie davon",
                        "**Berichtigung** unrichtiger oder unvollständiger Daten",
                        "**Löschung** Ihrer Daten",
                        "**Einschränkung** der Verarbeitung",
                        "**Widerspruch** gegen die auf dem berechtigten Interesse beruhende Verarbeitung",
                        "Erhalt Ihrer Daten in einem maschinenlesbaren Format (**Datenübertragbarkeit**)"
                    ]
                },
                { kind: "p", text: "Zur Ausübung schreiben Sie an {contactEmail}. Wir antworten Ihnen innerhalb eines Monats." },
                { kind: "p", text: "Sie haben außerdem das Recht, **Beschwerde bei der italienischen Datenschutzbehörde, dem Garante per la protezione dei dati personali** (www.garanteprivacy.it), einzulegen, wenn Sie der Ansicht sind, dass die Verarbeitung gegen die Verordnung verstößt." }
            ]
        }
    ]
};

// ─────────────────────────────────────────────────────────────────────────────
// ES
// ─────────────────────────────────────────────────────────────────────────────

const es: NoticeCopy = {
    docTitle: "Información sobre el tratamiento de los datos personales",
    docSubtitle: "Reservas en {venueName}",
    docReference: "Conforme al art. 13 del Reglamento (UE) 2016/679 — RGPD",
    lastUpdatedLabel: "Última actualización: {versionDate}",
    tocLabel: "Contenidos",
    backLabel: "Atrás",
    loading: "Cargando la información…",
    unavailable: {
        title: "Información no disponible",
        body: "Este local todavía no ha completado los datos necesarios para publicar su información sobre protección de datos. Para saber cómo se tratan tus datos puedes ponerte en contacto directamente con el local."
    },
    error: {
        title: "Información no accesible",
        body: "No se ha podido cargar la información. Vuelve a intentarlo más tarde o ponte en contacto directamente con el local."
    },
    sections: [
        {
            num: 1,
            title: "Quién trata tus datos",
            blocks: [
                { kind: "p", text: "El responsable del tratamiento es **{legalName}**, con domicilio en {address}." },
                { kind: "p", text: "Para cualquier solicitud relativa a tus datos personales puedes escribir a {contactEmail}{phoneClause}." },
                { kind: "p", text: "El responsable no ha nombrado un Delegado de Protección de Datos (DPD), al no concurrir los presupuestos legales." }
            ]
        },
        {
            num: 2,
            title: "Qué datos recogemos",
            blocks: [
                { kind: "p", text: "**Cuando reservas una mesa:**" },
                {
                    kind: "ul",
                    items: [
                        "**nombre**, **número de teléfono** y **dirección de correo electrónico**",
                        "**fecha, hora y número de personas** de la reserva",
                        "**las notas** que decidas añadir",
                        "el **idioma** en el que has rellenado el formulario"
                    ]
                },
                { kind: "p", text: "Si reservas por teléfono o en persona, el personal introduce los mismos datos por ti." },
                { kind: "p", text: "**Una ficha de cliente que permanece en el tiempo.** Tus reservas en este local se recogen en una ficha asociada a tu número de teléfono, que contiene tus datos de contacto, el historial de visitas — incluidas aquellas a las que no te presentaste — y las posibles anotaciones del personal útiles para el servicio, como una preferencia de mesa. Esta ficha **permanece incluso después de que la reserva concreta haya pasado**, durante el periodo indicado en el punto 7." },
                { kind: "p", text: "**Datos técnicos.** Registramos de forma cifrada un identificador derivado de tu dirección IP, para impedir el uso automatizado o abusivo del formulario de reserva. No conservamos la dirección en claro y no la utilizamos para identificarte." }
            ]
        },
        {
            num: 3,
            title: "Por qué los usamos y sobre qué base",
            blocks: [
                {
                    kind: "table",
                    head: ["Finalidad", "Base jurídica"],
                    rows: [
                        ["Gestionar tu reserva: registrarla, confirmarla o rechazarla, contactarte en caso de problemas", "Ejecución de medidas precontractuales y del contrato (art. 6.1.b)"],
                        ["Enviarte el correo de confirmación, el recordatorio del día anterior y el enlace para anular por tu cuenta", "Ejecución del contrato (art. 6.1.b)"],
                        ["Conservar el historial de tus reservas y las anotaciones de servicio, para reconocerte como cliente y atenderte mejor", "Interés legítimo del responsable en gestionar la relación con su clientela (art. 6.1.f)"],
                        ["Proteger el formulario de reserva frente a usos automatizados o abusivos", "Interés legítimo del responsable en la seguridad del servicio (art. 6.1.f)"]
                    ]
                },
                { kind: "p", text: "**No usamos tus datos para enviarte comunicaciones promocionales.** Si lo hiciéramos en el futuro, te lo pediríamos por separado y podrías negarte sin ninguna consecuencia sobre la reserva." },
                { kind: "p", text: "**No tomamos decisiones automatizadas** que produzcan efectos jurídicos sobre ti. La disponibilidad de las mesas se calcula automáticamente, pero la aceptación de la reserva sigue siendo una decisión del local." }
            ]
        },
        {
            num: 4,
            title: "Si nos facilitas información sobre tu salud",
            blocks: [
                { kind: "p", text: "El campo de notas es libre: **no te pedimos información sobre tu salud**. Si decides espontáneamente indicarnos una alergia o una intolerancia para permitirnos atenderte con seguridad, trataremos esa información solo con ese fin, sobre la base del consentimiento que manifiestas al facilitárnosla, y no la usaremos para nada más." },
                { kind: "p", text: "Puedes pedirnos en cualquier momento que la eliminemos." }
            ]
        },
        {
            num: 5,
            title: "¿Es obligatorio facilitar los datos?",
            blocks: [
                { kind: "p", text: "El nombre, el teléfono y el correo electrónico son **necesarios** para reservar: sin ellos no podemos registrar la reserva ni contactarte. Las notas son **facultativas**." }
            ]
        },
        {
            num: 6,
            title: "Quién más ve tus datos",
            blocks: [
                { kind: "p", text: "Tus datos son accesibles al personal del local autorizado a gestionar las reservas." },
                { kind: "p", text: "Para prestar el servicio nos apoyamos en proveedores que tratan los datos **por nuestra cuenta**, como encargados del tratamiento conforme al art. 28 del RGPD:" },
                {
                    kind: "ul",
                    items: [
                        "**{processorLegalName}** — plataforma de gestión de reservas",
                        "**Supabase Inc.** — infraestructura de base de datos y servicios aplicativos",
                        "**Resend** — envío de los correos transaccionales"
                    ]
                },
                { kind: "p", text: "**No vendemos ni cedemos tus datos a terceros para sus propias finalidades.**" },
                { kind: "p", text: "Algunos de estos proveedores tienen su sede en Estados Unidos. Las eventuales transferencias se producen sobre la base de las garantías previstas por el RGPD (decisión de adecuación EU–US Data Privacy Framework o cláusulas contractuales tipo aprobadas por la Comisión Europea)." }
            ]
        },
        {
            num: 7,
            title: "Cuánto tiempo los conservamos",
            blocks: [
                { kind: "p", text: "**36 meses** desde la fecha de la última reserva. Transcurrido ese periodo, la ficha de cliente y las reservas vinculadas se eliminan, salvo obligación legal distinta." }
            ]
        },
        {
            num: 8,
            title: "Tus derechos",
            blocks: [
                { kind: "p", text: "Puedes en cualquier momento solicitar:" },
                {
                    kind: "ul",
                    items: [
                        "**acceder** a tus datos y obtener una copia",
                        "**rectificar** datos inexactos o incompletos",
                        "**suprimir** tus datos",
                        "**limitar** el tratamiento",
                        "**oponerte** al tratamiento basado en el interés legítimo",
                        "recibir tus datos en un formato legible por máquina (**portabilidad**)"
                    ]
                },
                { kind: "p", text: "Para ejercerlos escribe a {contactEmail}. Te responderemos en el plazo de un mes." },
                { kind: "p", text: "Tienes además derecho a presentar una **reclamación ante la autoridad italiana de protección de datos, el Garante per la protezione dei dati personali** (www.garanteprivacy.it) si consideras que el tratamiento infringe el Reglamento." }
            ]
        }
    ]
};

export const NOTICE_COPY: Record<PublicLang, NoticeCopy> = { it, en, fr, de, es };

/**
 * Frase che aggancia il telefono alla riga di contatto del §1. Vive qui e non
 * dentro `sections` perché è condizionale: senza `phone_public = true` la riga
 * finisce dopo l'email, senza spazi o congiunzioni orfane.
 */
const PHONE_CLAUSE: Record<PublicLang, string> = {
    it: " o telefonare al {phone}",
    en: " or call {phone}",
    fr: " ou téléphoner au {phone}",
    de: " oder telefonisch unter {phone}",
    es: " o llamar al {phone}"
};

/**
 * Segnaposto mancante = stringa vuota, MAI la stringa "undefined" dentro
 * un'informativa. `address` è l'unico che può realisticamente essere nullo
 * (sede senza indirizzo completo): in quel caso la frase resta grammaticale
 * perché il segmento "con sede in ..." perde solo il valore, non la struttura.
 */
export function fillNoticeText(raw: string, params: NoticeParams, lang: PublicLang): string {
    const phoneClause = params.phone
        ? PHONE_CLAUSE[lang].replace("{phone}", params.phone)
        : "";

    return raw
        .replace(/\{venueName\}/g, params.venueName)
        .replace(/\{legalName\}/g, params.legalName)
        .replace(/\{address\}/g, params.address ?? "")
        .replace(/\{contactEmail\}/g, params.contactEmail)
        .replace(/\{processorLegalName\}/g, params.processorLegalName)
        .replace(/\{versionDate\}/g, params.versionDate)
        .replace(/\{phoneClause\}/g, phoneClause);
}
