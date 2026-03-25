import SiteLayout from "@layouts/SiteLayout/SiteLayout";
import styles from "./Home.module.scss";

export default function Home() {
    return (
        <SiteLayout>

            {/* ─── HERO ─────────────────────────────────────────────── */}
            <section className={styles.hero} aria-labelledby="hero-title">
                <div className={styles.heroGrid} aria-hidden="true" />
                <div className={styles.heroOrb} aria-hidden="true" />

                <div className={styles.heroInner}>
                    <div className={styles.heroBadge}>
                        <span className={styles.badgeDot} />
                        Per ristoranti e retail con più sedi
                    </div>

                    <h1 id="hero-title" className={styles.heroHeadline}>
                        Scrivi le regole una volta.<br />
                        <em>Il sistema distribuisce tutto.</em>
                    </h1>

                    <p className={styles.heroSub}>
                        Crei i cataloghi, imposti orari e sedi. CataloGlobe li distribuisce
                        su ogni sede, al momento giusto — senza interventi.
                    </p>

                    <div className={styles.heroCtas}>
                        <a href="/sign-up" className={styles.ctaPrimary}>
                            Inizia gratis
                        </a>
                        <a href="#come-funziona" className={styles.ctaGhost}>
                            Guarda come funziona
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </a>
                    </div>

                    <div className={styles.heroStats}>
                        <div className={styles.stat}>
                            <span className={styles.statNum}>+200</span>
                            <span className={styles.statLabel}>sedi attive</span>
                        </div>
                        <div className={styles.statSep} aria-hidden="true" />
                        <div className={styles.stat}>
                            <span className={styles.statNum}>0</span>
                            <span className={styles.statLabel}>interventi manuali dopo il setup</span>
                        </div>
                        <div className={styles.statSep} aria-hidden="true" />
                        <div className={styles.stat}>
                            <span className={styles.statNum}>&lt;1 giorno</span>
                            <span className={styles.statLabel}>per andare live</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── IL PROBLEMA ──────────────────────────────────────── */}
            <section className={styles.problem} aria-labelledby="problem-title">
                <div className={styles.container}>
                    <div className={styles.problemLayout}>
                        <div className={styles.problemLeft}>
                            <span className={styles.label}>Il problema</span>
                            <h2 id="problem-title" className={styles.sectionH2}>
                                Più sedi hai, più errori fai.
                            </h2>
                            <p className={styles.problemIntro}>
                                Con 3 sedi perdi già il controllo sui prezzi.
                                Con 10 sedi non sai neanche quali cataloghi sono attivi e dove.
                            </p>
                        </div>

                        <div className={styles.problemRight}>
                            <div className={styles.painList}>
                                <div className={styles.painItem}>
                                    <span className={styles.painNum}>01</span>
                                    <div>
                                        <strong>La margherita costa 9€ al centro e 8€ in periferia.</strong>
                                        <p>Hai aggiornato una sede. Le altre tre hanno il prezzo vecchio. Nessuno se n'è accorto — tranne il cliente.</p>
                                    </div>
                                </div>
                                <div className={styles.painItem}>
                                    <span className={styles.painNum}>02</span>
                                    <div>
                                        <strong>Happy Hour alle 18:00 — ma solo in 2 sedi su 5.</strong>
                                        <p>Le altre hanno ancora il listino pieno. I clienti se ne accorgono. Tu no, fino a lunedì.</p>
                                    </div>
                                </div>
                                <div className={styles.painItem}>
                                    <span className={styles.painNum}>03</span>
                                    <div>
                                        <strong>Il tiramisù è finito da tre giorni. Il menu dice che c'è.</strong>
                                        <p>Il cliente lo ordina al tavolo. Il cameriere si scusa. Recensione negativa.</p>
                                    </div>
                                </div>
                            </div>

                            <p className={styles.problemPunch}>
                                Il problema non è il contenuto. È il sistema che non esiste.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── IL CAMBIO DI PARADIGMA ───────────────────────────── */}
            <section className={styles.paradigm} aria-labelledby="paradigm-title">
                <div className={styles.container}>
                    <span className={styles.label}>Il concetto</span>

                    <h2 id="paradigm-title" className={styles.paradigmHeadline}>
                        Smetti di gestire contenuti.<br />
                        <em>Costruisci le regole. Il sistema fa il resto.</em>
                    </h2>

                    <div className={styles.paradigmSplit}>
                        <div className={styles.paradigmCol}>
                            <span className={styles.paradigmColLabel}>Prima</span>
                            <ul className={styles.paradigmList}>
                                <li>Cambi un prezzo → aggiorni 6 sedi a mano</li>
                                <li>Lanci una promo → mandi 6 WhatsApp diversi</li>
                                <li>Arriva Natale → prepari 6 PDF separati</li>
                                <li>Un errore → lo scopri dal cliente</li>
                            </ul>
                        </div>
                        <div className={styles.paradigmDivider} aria-hidden="true" />
                        <div className={styles.paradigmCol}>
                            <span className={styles.paradigmColLabelAccent}>Con CataloGlobe</span>
                            <ul className={styles.paradigmListAccent}>
                                <li>Cambi un prezzo → aggiornato ovunque in 1 secondo</li>
                                <li>Lanci una promo → un clic, tutte le sedi</li>
                                <li>Arriva Natale → il catalogo speciale parte da solo</li>
                                <li>Un errore → non esiste, è il sistema che decide</li>
                            </ul>
                        </div>
                    </div>

                    <blockquote className={styles.paradigmQuote}>
                        "Scrivi le regole una volta. Il sistema le esegue per sempre."
                    </blockquote>
                </div>
            </section>

            {/* ─── COME FUNZIONA ────────────────────────────────────── */}
            <section className={styles.howItWorks} id="come-funziona" aria-labelledby="how-title">
                <div className={styles.container}>
                    <span className={styles.label}>Come funziona</span>
                    <h2 id="how-title" className={styles.sectionH2}>
                        Quattro passaggi. Poi non ci pensi più.
                    </h2>

                    <div className={styles.steps}>
                        <div className={styles.step}>
                            <span className={styles.stepNum}>01</span>
                            <h3 className={styles.stepTitle}>Inserisci i prodotti</h3>
                            <p className={styles.stepDesc}>Nome, prezzo, foto. Una volta sola.</p>
                        </div>
                        <div className={styles.stepLine} aria-hidden="true" />
                        <div className={styles.step}>
                            <span className={styles.stepNum}>02</span>
                            <h3 className={styles.stepTitle}>Crea i cataloghi</h3>
                            <p className={styles.stepDesc}>Pranzo, cena, weekend — raggruppali come vuoi.</p>
                        </div>
                        <div className={styles.stepLine} aria-hidden="true" />
                        <div className={styles.step}>
                            <span className={styles.stepNum}>03</span>
                            <h3 className={styles.stepTitle}>Imposta le regole</h3>
                            <p className={styles.stepDesc}>Quali sedi, quali orari, quali giorni.</p>
                        </div>
                        <div className={styles.stepLine} aria-hidden="true" />
                        <div className={styles.step}>
                            <span className={styles.stepNum}>04</span>
                            <h3 className={styles.stepTitle}>Fine</h3>
                            <p className={styles.stepDesc}>Da adesso il sistema aggiorna tutto da solo.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── IL DIFFERENZIATORE ───────────────────────────────── */}
            <section className={styles.differentiator} aria-labelledby="diff-title">
                <div className={styles.container}>
                    <div className={styles.diffLayout}>
                        <div className={styles.diffLeft}>
                            <span className={styles.label}>La differenza</span>
                            <h2 id="diff-title" className={styles.sectionH2}>
                                Un editor aggiorna un file.<br />
                                CataloGlobe aggiorna tutte le sedi, ogni giorno, da solo.
                            </h2>
                            <p className={styles.diffBody}>
                                Con un editor fai una modifica e la ricarichi. Con CataloGlobe
                                scrivi una regola — e il sistema la applica su 5, 10, 50 sedi.
                                Ogni giorno. Senza che nessuno faccia nulla.
                            </p>
                            <p className={styles.diffBody}>
                                Non stai comprando un software. Stai eliminando un lavoro.
                            </p>
                        </div>

                        <div className={styles.diffRight}>
                            <div className={styles.scheduleCard}>
                                <header className={styles.scheduleHeader}>
                                    <span className={styles.scheduleDot} />
                                    <span>Regole attive oggi</span>
                                </header>
                                <div className={styles.scheduleRow}>
                                    <time className={styles.scheduleTime}>12:00</time>
                                    <span className={styles.scheduleAction}>Menù pranzo → live su 12 sedi</span>
                                </div>
                                <div className={styles.scheduleRow}>
                                    <time className={styles.scheduleTime}>15:00</time>
                                    <span className={styles.scheduleAction}>Menù pranzo → chiuso</span>
                                </div>
                                <div className={styles.scheduleRow}>
                                    <time className={styles.scheduleTime}>18:30</time>
                                    <span className={styles.scheduleAction}>Happy Hour → prezzi aggiornati</span>
                                </div>
                                <div className={styles.scheduleRow}>
                                    <time className={styles.scheduleTime}>Ven – Sab</time>
                                    <span className={styles.scheduleAction}>Carta serale speciale</span>
                                </div>
                                <div className={styles.scheduleRow}>
                                    <time className={styles.scheduleTime}>25 dic</time>
                                    <span className={styles.scheduleAction}>Menù Natale → tutte le sedi</span>
                                </div>
                                <footer className={styles.scheduleFooter}>
                                    Nessuno ci ha pensato oggi.
                                </footer>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── BENEFICI ─────────────────────────────────────────── */}
            <section className={styles.benefits} id="benefici" aria-labelledby="benefits-title">
                <div className={styles.container}>
                    <div className={styles.benefitsHeader}>
                        <span className={styles.label}>Il risultato</span>
                        <h2 id="benefits-title" className={styles.sectionH2}>
                            Cinque cose che smetti di fare.
                        </h2>
                    </div>

                    <div className={styles.benefitsList}>
                        <div className={styles.benefitRow}>
                            <span className={styles.benefitAccent}>Aggiornamenti</span>
                            <div className={styles.benefitBody}>
                                <h3>Non aggiorni più i cataloghi a mano</h3>
                                <p>Il sistema li aggiorna in base alle regole. Ogni giorno, su ogni sede, senza interventi.</p>
                            </div>
                        </div>
                        <div className={styles.benefitRow}>
                            <span className={styles.benefitAccent}>Errori</span>
                            <div className={styles.benefitBody}>
                                <h3>Non scopri più prezzi sbagliati dai clienti</h3>
                                <p>Un prezzo si cambia al centro. Il sistema lo propaga ovunque. Nessuna sede resta indietro.</p>
                            </div>
                        </div>
                        <div className={styles.benefitRow}>
                            <span className={styles.benefitAccent}>Lanci</span>
                            <div className={styles.benefitBody}>
                                <h3>Non perdi più mezza giornata per una promo</h3>
                                <p>La crei, la attivi, va live su tutte le sedi. Anche se sono 20.</p>
                            </div>
                        </div>
                        <div className={styles.benefitRow}>
                            <span className={styles.benefitAccent}>Controllo</span>
                            <div className={styles.benefitBody}>
                                <h3>Non controlli più sede per sede</h3>
                                <p>Vedi tutto da un punto. Sai cosa è attivo, dove, fino a quando.</p>
                            </div>
                        </div>
                        <div className={styles.benefitRow}>
                            <span className={styles.benefitAccent}>Eccezioni</span>
                            <div className={styles.benefitBody}>
                                <h3>Non fai più copia-incolla per le sedi diverse</h3>
                                <p>Ogni sede può avere le sue regole. Il centro ha la promo. La periferia no.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── CASI D'USO ───────────────────────────────────────── */}
            <section className={styles.useCases} aria-labelledby="cases-title">
                <div className={styles.container}>
                    <span className={styles.label}>Casi d'uso reali</span>
                    <h2 id="cases-title" className={styles.sectionH2}>
                        Tre scenari reali. Zero lavoro manuale.
                    </h2>

                    <div className={styles.casesGrid}>
                        <article className={styles.caseCard}>
                            <div className={styles.caseTag}>Ristorazione</div>
                            <h3 className={styles.caseTitle}>
                                Colazione, pranzo, cena. Su 12 sedi. Senza toccare nulla.
                            </h3>
                            <p className={styles.caseDesc}>
                                Alle 10:30 la colazione si chiude. Alle 11:00 parte il pranzo.
                                Ogni giorno, in automatico, da 14 mesi.
                            </p>
                        </article>
                        <article className={styles.caseCard}>
                            <div className={styles.caseTag}>Hospitality</div>
                            <h3 className={styles.caseTitle}>
                                Happy Hour ogni venerdì. Configurato una volta, 11 mesi fa.
                            </h3>
                            <p className={styles.caseDesc}>
                                Alle 18:00 partono i prezzi ridotti. Alle 21:00 tornano normali.
                                Nessuno lo gestisce più.
                            </p>
                        </article>
                        <article className={styles.caseCard}>
                            <div className={styles.caseTag}>Retail</div>
                            <h3 className={styles.caseTitle}>
                                Promo solo nel flagship. Le altre 7 sedi non la vedono.
                            </h3>
                            <p className={styles.caseDesc}>
                                Sconto stagionale in centro, per 10 giorni. Attivato in un clic.
                                Scaduto da solo.
                            </p>
                        </article>
                    </div>
                </div>
            </section>

            {/* ─── SOCIAL PROOF ─────────────────────────────────────── */}
            <section className={styles.proof} aria-labelledby="proof-title">
                <div className={styles.container}>
                    <span className={styles.label}>Chi lo usa</span>
                    <h2 id="proof-title" className={styles.sectionH2}>
                        Chi ha smesso di aggiornare contenuti a mano.
                    </h2>

                    <div className={styles.testimonialsGrid}>
                        <blockquote className={styles.testimonial}>
                            <p className={styles.testimonialText}>
                                "Ogni lunedì perdevo 3 ore ad aggiornare prezzi su 8 sedi.
                                Adesso cambio un numero e va live ovunque. In un secondo."
                            </p>
                            <footer className={styles.testimonialAuthor}>
                                <strong>Marco R.</strong>
                                <span>Operations Manager, 8 sedi</span>
                            </footer>
                        </blockquote>
                        <blockquote className={styles.testimonial}>
                            <p className={styles.testimonialText}>
                                "Abbiamo lanciato una promozione estiva su 20 punti vendita in 20 minuti.
                                Prima avremmo impiegato due giorni pieni."
                            </p>
                            <footer className={styles.testimonialAuthor}>
                                <strong>Giulia T.</strong>
                                <span>Marketing Director, catena retail</span>
                            </footer>
                        </blockquote>
                        <blockquote className={styles.testimonial}>
                            <p className={styles.testimonialText}>
                                "Abbiamo 4 hotel con menu diversi per ristorante, bar e room service.
                                Prima era un incubo. Adesso ogni menu segue le sue regole. Non ci pensiamo più."
                            </p>
                            <footer className={styles.testimonialAuthor}>
                                <strong>Luca M.</strong>
                                <span>Direttore F&amp;B, 4 hotel boutique</span>
                            </footer>
                        </blockquote>
                    </div>
                </div>
            </section>

            {/* ─── CTA FINALE ───────────────────────────────────────── */}
            <section className={styles.finalCta} aria-labelledby="cta-title">
                <div className={styles.finalCtaGlow} aria-hidden="true" />
                <div className={styles.container}>
                    <h2 id="cta-title" className={styles.finalCtaTitle}>
                        Ogni lunedì aggiorni cataloghi a mano.<br />
                        <em>Questo lunedì può essere l'ultimo.</em>
                    </h2>
                    <p className={styles.finalCtaSub}>
                        Il sistema distribuisce i contenuti. Tu fai crescere il business.
                    </p>
                    <div className={styles.finalCtaCtas}>
                        <a href="/sign-up" className={styles.ctaPrimary}>
                            Inizia gratis — nessuna carta di credito
                        </a>
                        <a href="#" className={styles.ctaGhost}>
                            Parla con il team
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </a>
                    </div>
                    <p className={styles.finalCtaNote}>
                        Setup in meno di un giorno. Nessun contratto.
                    </p>
                </div>
            </section>

        </SiteLayout>
    );
}
