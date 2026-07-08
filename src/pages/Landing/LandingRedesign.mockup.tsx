/**
 * LandingRedesign.mockup.tsx — MOCKUP di redesign landing (register BRAND).
 *
 * NON è l'implementazione: la landing viva (LandingPage.tsx) resta intatta.
 * Concept: "la giornata di un locale che scorre". Cliente primario = locale
 * singolo. L'eroe (~60% del peso) è la demo del prodotto che si dimostra da
 * solo: orologio, menu che cambia per fascia oraria, badge Programmata/Attiva/
 * Conclusa, QR reale. Unico movimento atmosferico: la luce che scorre con la
 * giornata (fredda al mattino → oro all'aperitivo → blu la sera).
 *
 * Gerarchia a tre cerchi: (1) motore = giornata che scorre, (2) leve del
 * motore, (3) gestisci & cresci (un pannello sobrio). Chiusura-promessa
 * multi-sede prima del prezzo.
 *
 * Dati reali riusati (read-only) da landingData.ts.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  Plus,
  BarChart3,
  MessageSquareText,
  Users,
  QrCode,
  CalendarCheck,
  CircleCheck,
  X,
  Store,
  Sparkles,
  ShieldCheck,
  CircleOff,
  EyeOff,
  Link2,
  Play,
} from "lucide-react";
import { DEMOS } from "./landingData";
import { TextInput } from "@components/ui/Input/TextInput";
import { Select } from "@components/ui/Select/Select";

/* FAQ del mockup — locale al redesign, NON condivisa con landingData.ts
   (quella resta di uso esclusivo della landing vera). */
const REDESIGN_FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Quanto costa?",
    a: "Due piani per sede: Base €39/mese, Pro €59/mese (IVA inclusa). Dal secondo locale ogni sede costa il 10% in meno. Per attivare, ci lasci i tuoi contatti e ti seguiamo noi nella configurazione. Ai primi locali inviamo anche un codice per provare il primo mese gratuitamente.",
  },
  {
    q: "Posso disdire quando voglio?",
    a: "Sì, quando vuoi, senza vincoli. Se chiudi l'account, i tuoi dati restano recuperabili per un periodo prima di essere eliminati definitivamente.",
  },
  {
    q: "Funziona anche con una sola sede?",
    a: "Certo. Il menu che si aggiorna da solo, i contenuti in evidenza e la gestione delle recensioni funzionano anche con un locale singolo — non serve avere una catena.",
  },
  {
    q: "Il menu si aggiorna davvero da solo?",
    a: "Sì. Imposti una volta gli orari e le regole — menu del pranzo, aperitivo, promozioni — e la pagina cambia da sola all'ora giusta, senza che tu debba toccarla.",
  },
  {
    q: "Il menu è disponibile in altre lingue?",
    a: "Sì, e le traduzioni le fa il sistema in automatico: il menu è subito consultabile in italiano, inglese, francese, tedesco e spagnolo — con altre lingue in arrivo. Se vuoi, puoi sempre correggere una traduzione a mano.",
  },
  {
    q: "Come funziona il QR code?",
    a: "Ogni tua sede ha la sua pagina con un indirizzo unico. Il QR lo trovi pronto sulla piattaforma: lo stampi e lo metti sui tavoli. Il cliente lo inquadra e trova sempre il menu giusto per quell'ora.",
  },
  {
    q: "I miei dati sono al sicuro?",
    a: "Sì. I dati del tuo locale sono protetti e tenuti separati da quelli di ogni altro cliente. Nessuno può accedere ai tuoi contenuti al posto tuo.",
  },
  {
    q: "Come vi contatto se ho bisogno?",
    a: "Ci scrivi via email e ti rispondiamo noi. Nessun centralino automatico.",
  },
];
import { COMPANY } from "@/config/company";
import logoHorizontal from "@/assets/brand/logo-horizontal.png";
import s from "./LandingRedesign.mockup.module.scss";

/* ── Prezzi (dati locali al mockup — la landing vera usa landingData) ─── */
interface MockupPricingAddition {
  name: string;
  benefit: string;
}
interface MockupPricingPlan {
  key: "base" | "pro";
  name: string;
  priceLabel: string;
  discountNote: string;
  framing: string;
  features?: string[];
  additions?: MockupPricingAddition[];
  popular: boolean;
}
const MOCKUP_PRICING_PLANS: MockupPricingPlan[] = [
  {
    key: "base",
    name: "Base",
    priceLabel: "€39/sede/mese",
    discountNote: "dal 2° locale −10% · €35,10/sede · IVA inclusa",
    framing: "Il tuo locale online, che si aggiorna da solo.",
    features: [
      "Menu con scheduling automatico",
      "Hub pubblico (Menu · Recensioni · Promo)",
      "Contenuti in evidenza programmabili",
      "Review Guard con routing per stelle",
      "Multi-sede e aggiornamento centralizzato",
      "Stili e temi con versionamento",
    ],
    popular: false,
  },
  {
    key: "pro",
    name: "Pro",
    priceLabel: "€59/sede/mese",
    discountNote: "dal 2° locale −10% · €53,10/sede · IVA inclusa",
    framing: "Tutto il piano Base — e in più i clienti fanno da soli:",
    additions: [
      {
        name: "Ordini al tavolo via QR",
        benefit:
          "Il cliente ordina dal tavolo col telefono, senza aspettare che qualcuno passi.",
      },
      {
        name: "Prenotazioni tavolo",
        benefit:
          "Il cliente prenota online, tu gestisci la sala e i coperti da un posto solo.",
      },
    ],
    popular: true,
  },
];

/* ── Fasce del giorno (staged su "Il Molo 34", Portofino) ──────────── */
type DaypartKey = "mattino" | "pranzo" | "aperitivo" | "cena";

interface Daypart {
  key: DaypartKey;
  time: string;
  label: string;
  tabName: string;
  menu: { name: string; price: string }[];
}

const DAYPARTS: Daypart[] = [
  {
    key: "mattino",
    time: "08:00",
    label: "Colazioni",
    tabName: "Mattino",
    menu: [
      { name: "Cappuccino", price: "€1,60" },
      { name: "Cornetto integrale", price: "€1,40" },
      { name: "Spremuta d'arancia", price: "€3,50" },
      { name: "Focaccia e latte", price: "€2,80" },
    ],
  },
  {
    key: "pranzo",
    time: "13:00",
    label: "Pranzo",
    tabName: "Pranzo",
    menu: [
      { name: "Trofie al pesto", price: "€12" },
      { name: "Insalata di mare", price: "€16" },
      { name: "Focaccia al formaggio", price: "€9" },
      { name: "Acqua naturale 0,75L", price: "€3" },
    ],
  },
  {
    key: "aperitivo",
    time: "18:30",
    label: "Aperitivo",
    tabName: "Aperitivo",
    menu: [
      { name: "Spritz della casa", price: "€8" },
      { name: "Tagliere misto", price: "€14" },
      { name: "Focaccia farcita", price: "€7" },
      { name: "Olive e taralli", price: "€5" },
    ],
  },
  {
    key: "cena",
    time: "21:00",
    label: "Cena",
    tabName: "Cena",
    menu: [
      { name: "Branzino al sale", price: "€22" },
      { name: "Risotto ai frutti di mare", price: "€20" },
      { name: "Tagliere di formaggi", price: "€12" },
      { name: "Calice di vino rosso", price: "€6" },
    ],
  },
];

const SCENE_CLASS: Record<DaypartKey, string> = {
  mattino: s.sceneMattino,
  pranzo: s.scenePranzo,
  aperitivo: s.sceneAperitivo,
  cena: s.sceneCena,
};

const AUTO_MS = 2800;
/* Nome/URL dell'hero sono illustrativi, non il tenant reale (quello resta
   solo nella sezione demo sotto). */
const HERO_PLACEHOLDER_NAME = "Il tuo locale";
const HERO_PLACEHOLDER_SLUG = "il-tuo-locale";

/* ── Ruolo del badge in base alla posizione nella giornata ─────────── */
function ruleFor(
  index: number,
  active: number,
): { label: string; cls: string } {
  if (index === active) return { label: "Attiva ora", cls: s.ruleActive };
  if (index < active) return { label: "Conclusa", cls: s.ruleDone };
  return { label: "Programmata", cls: s.ruleScheduled };
}

/* ── Reveal — micro-motion condiviso: fade-up on-scroll, once, reduced-motion safe.
   Rende un solo <motion.div className>: sostituisce un <div> esistente senza
   alterare albero/CSS (:last-child, grid, gap restano validi). */
function Reveal({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "p" | "li";
}) {
  const reduce = useReducedMotion();
  const M = as === "p" ? motion.p : as === "li" ? motion.li : motion.div;
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </M>
  );
}

/* ── Sezione demo — "Provalo dal vivo": device + selettore sedi, fondo serale.
   Riusa DEMOS (screenshot reali) + QRCodeSVG. Variante B su banda serale.
   NB: i menu demo esistono solo in produzione → l'URL punta SEMPRE al dominio
   di produzione (come la landing viva), mai a window.origin (in locale = 404). */
function demoHref(slug: string) {
  return `${COMPANY.web.homepage}/${slug}`;
}

function DemoSection() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const demo = DEMOS[active];
  const url = demoHref(demo.slug);

  const qrBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!showQr) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowQr(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showQr]);

  // Focus management: sposta il focus nel modal all'apertura, lo restituisce alla chiusura.
  useEffect(() => {
    if (showQr) {
      wasOpen.current = true;
      closeBtnRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      qrBtnRef.current?.focus();
    }
  }, [showQr]);

  return (
    <section className={s.demo} id="prova" aria-labelledby="demo-h2">
      <div className={s.container}>
        <Reveal className={s.demoLead}>
          <h2 className={s.demoH2} id="demo-h2">
            Guarda cosa può diventare il tuo locale.
          </h2>
          <p className={s.demoSub}>
            Demo reali con stili diversi — tocca un locale e guarda la sua
            pagina dal vivo. La tua la disegni come vuoi.
          </p>
        </Reveal>

        <div className={s.demoGrid}>
          <div className={s.demoStage}>
            <a
              className={s.demoDevice}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Apri il menu di ${demo.name}`}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.img
                  key={demo.slug}
                  src={demo.screenshot}
                  alt={`Menu di ${demo.name}`}
                  className={s.demoShot}
                  loading="lazy"
                  initial={{ opacity: 0, scale: reduce ? 1 : 1.03 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: reduce ? 1 : 0.99 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                />
              </AnimatePresence>
            </a>
          </div>

          <div className={s.demoPanel}>
            <div className={s.demoList} role="group" aria-label="Sedi demo">
              {DEMOS.map((d, i) => (
                <div
                  key={d.slug}
                  className={`${s.demoItem} ${i === active ? s.demoItemOn : ""}`}
                >
                  <button
                    type="button"
                    aria-pressed={i === active}
                    className={s.demoItemMain}
                    onClick={() => setActive(i)}
                  >
                    <span
                      className={s.demoThumb}
                      style={{ backgroundImage: `url(${d.screenshot})` }}
                      aria-hidden="true"
                    />
                    <span className={s.demoItemText}>
                      <span className={s.demoItemName}>{d.name}</span>
                      <span className={s.demoItemAddr}>{d.address}</span>
                    </span>
                  </button>
                  <a
                    className={s.demoGo}
                    href={demoHref(d.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={i === active ? 0 : -1}
                    aria-hidden={i !== active}
                  >
                    Vedi il menu <ArrowRight size={15} strokeWidth={2.2} />
                  </a>
                </div>
              ))}
            </div>

            <button
              ref={qrBtnRef}
              type="button"
              className={s.demoQr}
              onClick={() => setShowQr(true)}
              aria-label={`Ingrandisci il QR di ${demo.name}`}
            >
              <span className={s.demoQrFrame}>
                <QRCodeSVG value={url} size={88} level="M" aria-hidden="true" />
              </span>
              <span className={s.demoQrText}>
                <span className={s.demoQrName}>{demo.name}</span>
                <span className={s.demoQrSub}>
                  Ingrandisci il QR e apri il menu del ristorante
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showQr && (
          <motion.div
            className={s.qrOverlay}
            role="dialog"
            aria-modal="true"
            aria-label={`QR del menu di ${demo.name}`}
            onClick={() => setShowQr(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className={s.qrModal}
              onClick={(e) => e.stopPropagation()}
              initial={{
                opacity: 0,
                scale: reduce ? 1 : 0.94,
                y: reduce ? 0 : 10,
              }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                ref={closeBtnRef}
                type="button"
                className={s.qrClose}
                onClick={() => setShowQr(false)}
                aria-label="Chiudi"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
              <span className={s.qrModalFrame}>
                <QRCodeSVG
                  value={url}
                  size={216}
                  level="M"
                  aria-hidden="true"
                />
              </span>
              <p className={s.qrModalName}>{demo.name}</p>
              <p className={s.qrModalSub}>Inquadra il QR per aprire il menu</p>
              <a
                className={s.qrModalLink}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Oppure apri il menu <ArrowRight size={16} strokeWidth={2.2} />
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ── Sezione multi-sede — voce + pannello catena. Dimostra: una sola insegna
   ("Il tuo ristorante" — placeholder dichiarato), tante sedi, ognuna configurata
   diversa, governate da un posto solo. La ripetizione dell'insegna per zona
   (Duomo/Navigli/…) è la chiave: è una CATENA, non locali scollegati. */
const CHAIN_SEDI: {
  zona: string;
  menu: string;
  orario: string;
  evidenza: string | null;
  stile: "Chiaro" | "Sera" | "Caldo";
}[] = [
  {
    zona: "Duomo",
    menu: "Turistico",
    orario: "12–22",
    evidenza: "Menu fisso pranzo",
    stile: "Chiaro",
  },
  {
    zona: "Navigli",
    menu: "Aperitivo",
    orario: "18–23",
    evidenza: "Aperitivo del venerdì",
    stile: "Sera",
  },
  {
    zona: "Stazione",
    menu: "Veloce",
    orario: "7–21",
    evidenza: null,
    stile: "Chiaro",
  },
  {
    zona: "Bergamo",
    menu: "Cena",
    orario: "19–24",
    evidenza: "Menu degustazione",
    stile: "Caldo",
  },
];

const AI_IMPORT_ITEMS: { name: string; category: string; price: string }[] = [
  { name: "Insalata di mare", category: "Antipasti", price: "€16" },
  { name: "Trofie al pesto", category: "Primi", price: "€12" },
  { name: "Branzino al sale", category: "Secondi", price: "€22" },
  { name: "Tiramisù", category: "Dolci", price: "€6" },
  { name: "Acqua naturale 0,75L", category: "Bevande", price: "€3" },
];

/* ── Sezione import menù con AI — ultimo spintarello prima del prezzo.
   Visual dimostrativo (statico): riproduce lo step 3 "Revisione" del wizard
   reale, il risultato già estratto — più convincente del caricamento vuoto.
   NB: non è funzionante, nessun upload reale. */
function AiImportSection() {
  return (
    <section
      className={`${s.section} ${s.sectionAlt}`}
      id="import-ai"
      aria-labelledby="ai-h2"
    >
      <div className={s.container}>
        <div className={s.aiGrid}>
          <Reveal className={s.aiVoice}>
            <p className={s.sectionKicker}>Iniziare è facile</p>
            <h2 className={s.aiH2} id="ai-h2">
              Il tuo menu è già pronto. <em>Devi solo fotografarlo.</em>
            </h2>
            <p className={s.aiSub}>
              Carichi le foto o il PDF del menu che hai già. L&apos;AI legge
              tutto — piatti, prezzi, categorie — e costruisce il menu
              digitale al posto tuo. Tu dai un&apos;occhiata e confermi.
            </p>

            <ol className={s.aiSteps}>
              <li className={s.aiStep}>
                <span className={s.aiStepNum}>1</span>
                <span className={s.aiStepText}>
                  <span className={s.aiStepTitle}>
                    Carichi il menu che hai
                  </span>
                  <span className={s.aiStepBody}>
                    Foto o PDF, anche più file insieme. Quello che già usi in
                    sala, così com&apos;è.
                  </span>
                </span>
              </li>
              <li className={s.aiStep}>
                <span className={s.aiStepNum}>2</span>
                <span className={s.aiStepText}>
                  <span className={s.aiStepTitle}>
                    L&apos;AI lo legge e lo organizza
                  </span>
                  <span className={s.aiStepBody}>
                    Riconosce piatti, prezzi, descrizioni e li sistema in
                    categorie, da solo.
                  </span>
                </span>
              </li>
              <li className={s.aiStep}>
                <span className={s.aiStepNum}>3</span>
                <span className={s.aiStepText}>
                  <span className={s.aiStepTitle}>Rivedi e confermi</span>
                  <span className={s.aiStepBody}>
                    Controlli che sia tutto giusto, aggiusti se serve, e il
                    menu è online.
                  </span>
                </span>
              </li>
            </ol>

            <div className={s.aiReassure}>
              <span className={s.aiReassureIcon} aria-hidden="true">
                <ShieldCheck size={16} strokeWidth={2.2} />
              </span>
              <p className={s.aiReassureText}>
                L&apos;ultima parola è sempre tua: niente va online prima che
                tu l&apos;abbia rivisto. E puoi aggiungere altri piatti con
                l&apos;AI anche dopo.
              </p>
            </div>
          </Reveal>

          <Reveal className={s.aiVisual}>
            <div
              className={s.aiWizard}
              role="img"
              aria-label="Anteprima del wizard di importazione menù con AI, step Revisione: piatti estratti automaticamente, ciascuno con categoria e prezzo"
            >
              <div className={s.aiWizardBar}>
                <Sparkles size={16} strokeWidth={2.2} aria-hidden="true" />
                Importa menù con AI
              </div>

              <div className={s.aiWizardSteps} aria-hidden="true">
                <span className={`${s.aiWizardStep} ${s.aiWizardStepDone}`}>
                  <CircleCheck size={13} strokeWidth={2.4} />
                  Caricamento
                </span>
                <span className={s.aiWizardStepLine} />
                <span className={`${s.aiWizardStep} ${s.aiWizardStepDone}`}>
                  <CircleCheck size={13} strokeWidth={2.4} />
                  Analisi
                </span>
                <span className={s.aiWizardStepLine} />
                <span className={`${s.aiWizardStep} ${s.aiWizardStepActive}`}>
                  Revisione
                </span>
              </div>

              <ul className={s.aiWizardList}>
                {AI_IMPORT_ITEMS.map((item) => (
                  <li className={s.aiWizardItem} key={item.name}>
                    <span className={s.aiWizardCheckbox} aria-hidden="true">
                      <Check className={s.aiWizardCheckIcon} />
                    </span>
                    <span className={s.aiWizardItemName}>{item.name}</span>
                    <span className={s.aiWizardItemCat}>{item.category}</span>
                    <span className={s.aiWizardItemPrice}>{item.price}</span>
                  </li>
                ))}
              </ul>

              <p className={s.aiWizardCaption}>Anteprima</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

type AvailState = "normal" | "esaurito" | "nascosto";
const AVAIL_ITEMS: { name: string; price: string; state: AvailState }[] = [
  { name: "Spaghetti al pomodoro", price: "€10", state: "normal" },
  { name: "Branzino al sale", price: "€22", state: "esaurito" },
  { name: "Tagliere misto", price: "€14", state: "normal" },
  { name: "Tiramisù", price: "€6", state: "nascosto" },
];

/* ── Sezione "Disponibilità in tempo reale" — complemento compatto delle 3
   leve: quelle dicono "succede da solo", questa dice "il controllo resta a
   te". Visual dimostrativo (statico) lato GESTIONE: stessa card mostra i tre
   stati insieme (normale/esaurito/nascosto) per far vedere la differenza.
   NB: non è funzionante, nessun toggle reale. */
function AvailabilitySection() {
  return (
    <section
      className={`${s.section} ${s.sectionCompact}`}
      id="disponibilita"
      aria-labelledby="avail-h2"
    >
      <div className={s.container}>
        <div className={s.availGrid}>
          <Reveal className={s.availVoice}>
            <p className={s.sectionKicker}>Il controllo resta a te</p>
            <h2 className={s.availH2} id="avail-h2">
              Finito un piatto? <em>Lo togli in un attimo.</em>
            </h2>
            <p className={s.availSub}>
              Dal telefono, mentre sei in sala. Nascondi un prodotto dal menu,
              o lascialo visibile segnandolo esaurito. Il cliente vede sempre
              la verità, senza che tu debba ristampare niente.
            </p>

            <div className={s.availModes}>
              <div className={s.availMode}>
                <span
                  className={`${s.availModeIcon} ${s.availModeIconWarn}`}
                  aria-hidden="true"
                >
                  <CircleOff size={16} strokeWidth={2.2} />
                </span>
                <span className={s.availModeText}>
                  <span className={s.availModeName}>Segnalo esaurito</span>
                  <span className={s.availModeDesc}>
                    resta nel menu, ma il cliente sa che oggi non c&apos;è.
                  </span>
                </span>
              </div>
              <div className={s.availMode}>
                <span
                  className={`${s.availModeIcon} ${s.availModeIconNeutral}`}
                  aria-hidden="true"
                >
                  <EyeOff size={16} strokeWidth={2.2} />
                </span>
                <span className={s.availModeText}>
                  <span className={s.availModeName}>Nascondilo</span>
                  <span className={s.availModeDesc}>
                    sparisce dal menu, lo rimetti quando vuoi.
                  </span>
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal className={s.availVisual}>
            <div
              className={s.availCard}
              role="img"
              aria-label="Anteprima della gestione del menu: quattro prodotti, uno segnato esaurito e uno nascosto, gli altri normali"
            >
              <div className={s.availCardHead}>
                <span className={s.availCardBrand}>Menu · Il tuo locale</span>
                <span className={s.availCardStatus}>
                  <span className={s.availCardStatusDot} aria-hidden="true" />
                  Aggiornato ora
                </span>
              </div>

              <ul className={s.availRows} aria-hidden="true">
                {AVAIL_ITEMS.map((item) => (
                  <li
                    className={`${s.availRow} ${
                      item.state === "nascosto" ? s.availRowFaded : ""
                    }`}
                    key={item.name}
                  >
                    <span
                      className={`${s.availToggle} ${
                        item.state !== "nascosto" ? s.availToggleOn : ""
                      }`}
                    >
                      <span className={s.availToggleKnob} />
                    </span>
                    <span className={s.availRowText}>
                      <span className={s.availRowName}>{item.name}</span>
                      {item.state === "esaurito" && (
                        <span
                          className={`${s.availBadge} ${s.availBadgeWarn}`}
                        >
                          Esaurito
                        </span>
                      )}
                      {item.state === "nascosto" && (
                        <span
                          className={`${s.availBadge} ${s.availBadgeNeutral}`}
                        >
                          Nascosto
                        </span>
                      )}
                    </span>
                    <span className={s.availRowPrice}>{item.price}</span>
                  </li>
                ))}
              </ul>

              <p className={s.availCaption}>
                Anteprima · nascondi o segna esaurito con un tocco
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Card "dal piatto alla storia" — un solo elemento a footprint fisso che
   anima in loop lento tra due stati: scheda piatto (neutra, con rimando
   caldo) → pagina storia collegata (calda). Stessa disciplina dell'hero:
   loop automatico, primo click/tap ferma tutto sullo stato piatto,
   reduced-motion → solo lo stato piatto, statico. Dimostrativa, non
   funzionante: nessun link reale. */
function StoryFlipCard() {
  const reduce = useReducedMotion();
  const [state, setState] = useState<"piatto" | "storia">("piatto");

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setState((prev) => (prev === "piatto" ? "storia" : "piatto"));
    }, 4000);
    return () => window.clearInterval(id);
  }, [reduce]);

  const dishContent = (
    <>
      <p className={s.storyDishHeader}>Dettaglio piatto</p>
      <div className={s.storyDishTop}>
        <span className={s.storyDishName}>Trofie al pesto</span>
        <span className={s.storyDishPrice}>€12</span>
      </div>
      <p className={s.storyDishDesc}>
        Pasta fresca con pesto di basilico, pinoli e pecorino.
      </p>
      <div className={s.storyDishLink}>
        <span className={s.storyDishLinkTag}>Dietro le quinte</span>
        <span className={s.storyDishLinkRow}>
          <span className={s.storyDishLinkTitle}>
            La storia di questo piatto
          </span>
          <span className={s.storyDishLinkArrow}>›</span>
        </span>
      </div>
    </>
  );

  const storyContent = (
    <>
      <div className={s.storyStoryTop}>
        <span className={s.storyStoryTag}>
          Dietro le quinte · Trofie al pesto
        </span>
        <span className={s.storyStoryEyebrow}>Il tuo locale</span>
      </div>
      <p className={s.storyStoryTitle}>Dove tutto comincia</p>
      <p className={s.storyStoryDesc}>
        La mattina in cui la cucina si accende, molto prima di aprire. Il
        pesto si fa a mano, come una volta.
      </p>
      <div className={s.storyStoryMedia}>
        <span className={s.storyStoryPlay}>
          <Play size={14} strokeWidth={0} fill="currentColor" />
        </span>
        <span className={s.storyStoryDuration}>0:48</span>
      </div>
    </>
  );

  return (
    <div
      className={s.storyCard}
      role="img"
      aria-label="Anteprima animata: la scheda del piatto Trofie al pesto con un rimando «La storia di questo piatto», che si trasforma nella pagina storia collegata «Dove tutto comincia», il dietro le quinte di quel piatto"
    >
      <div className={s.storyStateWrap}>
        {reduce ? (
          <div className={s.storyStateDish} aria-hidden="true">
            {dishContent}
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {state === "piatto" ? (
              <motion.div
                key="piatto"
                className={s.storyStateDish}
                aria-hidden="true"
                initial={{ opacity: 0, y: 6, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.99 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {dishContent}
              </motion.div>
            ) : (
              <motion.div
                key="storia"
                className={s.storyStateStory}
                aria-hidden="true"
                initial={{ opacity: 0, y: 6, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.99 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {storyContent}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
      <p className={s.storyCaption}>Anteprima · il rimando porta alla storia</p>
    </div>
  );
}

/* ── Sezione "Storie" — zona esperienza cliente, tra la demo e il capitolo
   gestione. L'icona del callout resta indigo di sistema; la card a destra
   usa toni caldi/editoriali (--sk-* già usati per lo skin "Caldo" della leva
   stile) solo nel rimando e nello stato storia — tono del CONTENUTO, non un
   nuovo accento di brand. Generico, nessun tenant reale. */
function StoriesSection() {
  return (
    <section className={s.section} id="storie" aria-labelledby="storie-h2">
      <div className={s.container}>
        <div className={s.storiesGrid}>
          <Reveal className={s.storiesVoice}>
            <p className={s.sectionKicker}>Non solo un menu</p>
            <h2 className={s.storiesH2} id="storie-h2">
              Il tuo locale ha una storia. <em>Falla leggere.</em>
            </h2>
            <p className={s.storiesSub}>
              Racconta chi sei — con foto, testi e video. E colleghi i
              racconti ai piatti: il cliente scopre il &quot;dietro le
              quinte&quot; proprio mentre guarda cosa ordinare.
            </p>

            <div className={s.storiesHook}>
              <span className={s.storiesHookIcon} aria-hidden="true">
                <Link2 size={16} strokeWidth={2.2} />
              </span>
              <span className={s.storiesHookText}>
                <span className={s.storiesHookTitle}>
                  Una pagina che racconta il locale
                </span>
                <span className={s.storiesHookBody}>
                  Oltre ai singoli piatti, una sezione dedicata dove il
                  cliente scopre storia, territorio e persone.
                </span>
              </span>
            </div>
          </Reveal>

          <Reveal className={s.storiesVisual}>
            <StoryFlipCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function styleClass(stile: "Chiaro" | "Sera" | "Caldo") {
  if (stile === "Sera") return s.chainStyleEve;
  if (stile === "Caldo") return s.chainStyleWarm;
  return s.chainStyleLight;
}

function ChainSection() {
  return (
    <section className={s.chain} aria-labelledby="chain-h2">
      <div className={s.container}>
        <div className={s.chainGrid}>
          <Reveal className={s.chainVoice}>
            <h2 className={s.chainH2} id="chain-h2">
              Un locale o cento. <em>Li gestisci da qui.</em>
            </h2>
            <p className={s.chainSub}>
              Ogni tua sede con il suo menu, i suoi contenuti in evidenza, il
              suo stile. Li decidi tu — da un posto solo, senza aprire venti
              pannelli diversi.
            </p>
            <p className={s.chainSubNote}>
              Il Duomo con il menu turistico, i Navigli con l'aperitivo. Sedi
              diverse, gestione unica.
            </p>
          </Reveal>

          <Reveal className={s.chainPanel}>
            <div className={s.chainHead}>
              <span className={s.chainMonogram} aria-hidden="true">
                <Store size={18} strokeWidth={2} />
              </span>
              <span className={s.chainBrand}>
                <span className={s.chainBrandName}>Le tue sedi</span>
                <span className={s.chainBrandMeta}>
                  9 attive · un solo posto per gestirle
                </span>
              </span>
            </div>

            <div className={s.chainTable} role="table" aria-label="Le tue sedi">
              <div className={`${s.chainRow} ${s.chainRowHead}`} role="row">
                <span className={s.chainColSede} role="columnheader">
                  Sede
                </span>
                <span role="columnheader">Menu attivo</span>
                <span role="columnheader">In evidenza</span>
                <span role="columnheader">Stile</span>
              </div>

              {CHAIN_SEDI.map((r) => (
                <div className={s.chainRow} role="row" key={r.zona}>
                  <span className={s.chainSede} role="cell">
                    <span className={s.chainSedeZona}>{r.zona}</span>
                  </span>
                  <span className={s.chainCell} role="cell">
                    <span className={s.cellLabel}>Menu attivo</span>
                    <span className={s.chainCellMain}>
                      {r.menu}
                      <span className={s.chainCellSub}>{r.orario}</span>
                    </span>
                  </span>
                  <span className={s.chainCell} role="cell">
                    <span className={s.cellLabel}>In evidenza</span>
                    <span
                      className={r.evidenza ? s.chainCellMain : s.chainEmpty}
                    >
                      {r.evidenza ?? "—"}
                    </span>
                  </span>
                  <span className={s.chainCell} role="cell">
                    <span className={s.cellLabel}>Stile</span>
                    <span className={`${s.chainStyle} ${styleClass(r.stile)}`}>
                      <span className={s.chainStyleDot} aria-hidden="true" />
                      {r.stile}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <p className={s.chainMore}>
              e altre 5 sedi — tutte governate da qui.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Header sticky — logo (→ top) + Accedi (login reale) + Richiedi accesso.
   Trasparente in cima; scrollando diventa frost bianco + blur (testo scuro,
   leggibile su ogni sezione). In cima adatta testo/logo alla fascia dell'hero
   (chiaro su "cena" scura). Niente link centrali, niente switch tema. */
function RedesignHeader({ daypart }: { daypart: DaypartKey }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = (e: React.MouseEvent) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header
      className={s.appbar}
      data-scrolled={scrolled ? "true" : "false"}
      data-daypart={daypart}
    >
      <div className={s.appbarInner}>
        <a
          href="#top"
          className={s.appbarLogo}
          onClick={toTop}
          aria-label="CataloGlobe — torna in cima"
        >
          <img
            src={logoHorizontal}
            alt="CataloGlobe"
            className={s.appbarLogoImg}
          />
        </a>
        <nav className={s.appbarActions} aria-label="Accesso">
          <a href="/login" className={s.appbarLogin}>
            Accedi
          </a>
          <a href="#waitlist" className={s.appbarCta}>
            Richiedi accesso
          </a>
        </nav>
      </div>
    </header>
  );
}

/* =================================================================== */

export default function LandingRedesign() {
  const reduce = useReducedMotion();
  // Reduced-motion → nessun loop, fascia statica di default (Pranzo).
  // Altrimenti si parte da Mattino e si scorre in loop da soli.
  const [active, setActive] = useState<number>(() => (reduce ? 1 : 0));
  const [autoPlay, setAutoPlay] = useState(true);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // La giornata avanza da sola in loop finché l'utente non tocca un tab:
  // al primo click/tap il controllo passa a lui, per sempre.
  useEffect(() => {
    if (reduce || !autoPlay) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % DAYPARTS.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [reduce, autoPlay]);

  // Scroll fluido sugli anchor interni. Applicato sull'elemento che scrolla
  // davvero (la root <html>), solo mentre il redesign è montato (revert
  // all'unmount → la landing viva e le altre route non sono toccate).
  // Reduced-motion → nessuno smooth (salto istantaneo).
  useEffect(() => {
    if (reduce) return;
    const root = document.documentElement;
    const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "smooth";
    return () => {
      root.style.scrollBehavior = prev;
    };
  }, [reduce]);

  const dp = DAYPARTS[active];
  const rule = ruleFor(active, active); // active row is always "Attiva ora"

  const onTabKey = useCallback((e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next =
        e.key === "ArrowRight"
          ? (i + 1) % DAYPARTS.length
          : (i - 1 + DAYPARTS.length) % DAYPARTS.length;
      setAutoPlay(false);
      setActive(next);
      tabsRef.current[next]?.focus();
    }
  }, []);

  return (
    <div className={s.page}>
      <RedesignHeader daypart={dp.key} />

      {/* ============ HERO — la giornata che scorre ============ */}
      <header className={s.hero} data-daypart={dp.key}>
        {/* Sfondo "giornata": cielo che vira (crossfade) + sole che arca +
                    orizzonte di Portofino costante con lucine serali */}
        <div className={s.scene} aria-hidden="true">
          {DAYPARTS.map((d, i) => (
            <motion.div
              key={d.key}
              className={`${s.sceneLayer} ${SCENE_CLASS[d.key]}`}
              initial={false}
              animate={{ opacity: i === active ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 1.1, ease: "easeInOut" }}
            />
          ))}
          <div className={s.aurora} aria-hidden="true">
            <span className={s.blob1} />
            <span className={s.blob2} />
            <span className={s.blob3} />
          </div>
          <div className={s.ambient} />
          <div className={s.grain} />
        </div>

        <div className={s.container}>
          <div className={s.heroInner}>
            {/* Voce umana (serif) */}
            <div className={s.voice}>
              <h1 className={s.heroH1}>
                E se il menu si aggiornasse <em>da solo</em>?
              </h1>
              <p className={s.heroSub}>
                Non solo il menu: prezzi, promozioni e lingue si aggiornano
                quando serve — mentre tu pensi al locale.
              </p>
              <div className={s.heroCtas}>
                <a className={s.ctaPrimary} href="#waitlist">
                  Richiedi accesso <ArrowRight size={17} strokeWidth={2.2} />
                </a>
                <a className={s.ctaGhost} href="#prova">
                  Guarda com'è fatto
                </a>
              </div>
            </div>

            {/* Demo prodotto — superficie bianca costante, sempre leggibile */}
            <div className={s.stage}>
              <div
                className={s.device}
                role="img"
                aria-label={`Anteprima del menu di ${HERO_PLACEHOLDER_NAME}`}
              >
                <div className={s.deviceChrome}>
                  <span className={s.dots}>
                    <i className={s.dot} />
                    <i className={s.dot} />
                    <i className={s.dot} />
                  </span>
                  <span className={s.deviceUrl}>
                    cataloglobe.com/<b>{HERO_PLACEHOLDER_SLUG}</b>
                  </span>
                </div>

                <div className={s.clockRow}>
                  <span className={s.clock}>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={dp.time}
                        className={s.clockTime}
                        initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: reduce ? 0 : -6 }}
                        transition={{ duration: 0.28 }}
                      >
                        {dp.time}
                      </motion.span>
                    </AnimatePresence>
                    <span className={s.clockLabel}>{dp.label}</span>
                  </span>
                  <span className={`${s.ruleBadge} ${rule.cls}`}>
                    <span className={s.ruleDot} />
                    {rule.label}
                  </span>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.ul
                    key={dp.key}
                    className={s.menu}
                    initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduce ? 0 : -8 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    {dp.menu.map((item) => (
                      <li className={s.menuRow} key={item.name}>
                        <span className={s.menuName}>{item.name}</span>
                        <span className={s.menuDots} aria-hidden="true" />
                        <span className={s.menuPrice}>{item.price}</span>
                      </li>
                    ))}
                  </motion.ul>
                </AnimatePresence>
              </div>

              {/* Tablist fasce del giorno */}
              <div
                className={s.dayparts}
                role="tablist"
                aria-label="Fasce della giornata"
              >
                {DAYPARTS.map((d, i) => (
                  <button
                    key={d.key}
                    ref={(el) => {
                      tabsRef.current[i] = el;
                    }}
                    role="tab"
                    aria-selected={i === active}
                    tabIndex={i === active ? 0 : -1}
                    className={`${s.daypartTab} ${
                      i === active ? s.daypartActive : ""
                    }`}
                    onClick={() => {
                      setAutoPlay(false);
                      setActive(i);
                    }}
                    onKeyDown={(e) => onTabKey(e, i)}
                  >
                    {/* Sfondo del tab attivo — layoutId condiviso: invece
                                            di comparire/sparire di colpo, scivola da un tab
                                            all'altro (stesso pattern dei segmented control). */}
                    {i === active && (
                      <motion.span
                        layoutId="daypartHighlight"
                        className={s.daypartHighlight}
                        transition={{
                          duration: reduce ? 0 : undefined,
                          type: reduce ? "tween" : "spring",
                          stiffness: 380,
                          damping: 32,
                        }}
                      />
                    )}

                    {/* Avanzamento della fascia corrente — riempie il
                                            pill attivo stesso, dietro al testo. */}
                    {i === active && !reduce && autoPlay && (
                      <span className={s.daypartFill} aria-hidden="true">
                        <span
                          key={active}
                          className={s.daypartFillWash}
                          style={{ animationDuration: `${AUTO_MS}ms` }}
                        />
                      </span>
                    )}

                    <span className={s.daypartName}>{d.tabName}</span>
                    <span className={s.daypartTime}>{d.time}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ============ SECONDO CERCHIO — le leve del motore ============ */}
        <section className={s.section} id="giornata" aria-labelledby="leve-h2">
          <div className={s.container}>
            <Reveal className={s.sectionLead}>
              <h2 className={s.sectionH2} id="leve-h2">
                Ogni cosa al momento giusto.
              </h2>
              <p className={s.sectionH2Sub}>
                La promo giusta all'ora giusta, lo stile che veste il locale, il
                menu nella lingua di chi legge — succede senza che tu ci pensi.
              </p>
            </Reveal>

            <div className={s.levers}>
              {/* Leva 1 — programmazione / in evidenza (selettore giorni) */}
              <Reveal className={s.lever}>
                <div className={s.leverText}>
                  <h3 className={s.leverH3}>
                    Programmi la settimana, poi non ci pensi più.
                  </h3>
                  <p className={s.leverBody}>
                    Programmi le promozioni una volta — l'aperitivo del venerdì,
                    la musica del sabato — e ognuna appare nel suo giorno,
                    quando serve. Tocca un giorno e guarda cosa cambia.
                  </p>
                </div>
                <div className={s.leverDemo}>
                  <div className={s.chip}>
                    <div className={s.chipHead}>
                      Anteprima home · tocca un giorno
                    </div>
                    <div className={s.chipBody}>
                      <ScheduleDemo />
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Leva 2 — cambio stile (skin cliccabile) */}
              <Reveal className={`${s.lever} ${s.leverAlt}`}>
                <div className={s.leverText}>
                  <h3 className={s.leverH3}>
                    Cambi veste al locale in un gesto.
                  </h3>
                  <p className={s.leverBody}>
                    Tocca uno stile e la pagina cambia colori, tono, atmosfera.
                    I piatti e i prezzi restano identici — cambia l'aspetto, non
                    il contenuto. Questi sono solo esempi: il tuo stile lo
                    componi tu — colori, caratteri, forme, ogni dettaglio.
                  </p>
                </div>
                <div className={s.leverDemo}>
                  <div className={s.chip}>
                    <div className={s.chipHead}>
                      Tre esempi di stile · tocca per provare
                    </div>
                    <div className={s.chipBody}>
                      <StyleDemo reduce={!!reduce} />
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Leva 3 — traduzione realtime (toggle lingua) */}
              <Reveal className={s.lever}>
                <div className={s.leverText}>
                  <h3 className={s.leverH3}>
                    Il turista legge il menu nella sua lingua.
                  </h3>
                  <p className={s.leverBody}>
                    Cambia lingua qui a fianco: le descrizioni si traducono da
                    sole, i prezzi restano. Il nome del piatto resta in italiano
                    — l'autenticità che il turista cerca — ma la descrizione la
                    legge nella sua lingua, così sa sempre cosa ordina.
                  </p>
                </div>
                <div className={s.leverDemo}>
                  <div className={s.chip}>
                    <div className={s.chipHead}>
                      Lingua del visitatore · tocca una lingua
                    </div>
                    <div className={s.chipBody}>
                      <TranslateDemo />
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ PROVALO DAL VIVO — demo reali (device + selettore, serale) ============ */}
        <DemoSection />

        {/* ============ STORIE — zona esperienza cliente ============ */}
        <StoriesSection />

        {/* ============ TERZO CERCHIO — gestisci e cresci ============ */}
        <section
          className={`${s.section} ${s.sectionAlt}`}
          aria-labelledby="cresci-h2"
        >
          <div className={s.container}>
            <Reveal className={s.sectionLead}>
              <h2 className={s.sectionH2} id="cresci-h2">
                E quando vuoi <em>capire e crescere</em>.
              </h2>
              <p className={s.sectionH2Sub}>
                Gli strumenti per gestire il locale, non una vetrina di
                funzioni. Ci sono quando ti servono.
              </p>
            </Reveal>

            <div className={s.growPanel}>
              <Reveal className={s.growRow}>
                <span className={s.growName}>
                  <span className={s.growIcon}>
                    <BarChart3 size={18} strokeWidth={2} />
                  </span>
                  Analitiche
                </span>
                <p className={s.growDesc}>
                  Capisci cosa vende davvero, e a che ora — decidi sui numeri,
                  non a sensazione.
                </p>
              </Reveal>
              <Reveal className={s.growRow}>
                <span className={s.growName}>
                  <span className={s.growIcon}>
                    <MessageSquareText size={18} strokeWidth={2} />
                  </span>
                  Recensioni interne
                </span>
                <p className={s.growDesc}>
                  Raccogli il feedback dei clienti prima che finisca su Google.
                </p>
              </Reveal>
              <Reveal className={s.growRow}>
                <span className={s.growName}>
                  <span className={s.growIcon}>
                    <Users size={18} strokeWidth={2} />
                  </span>
                  Team
                </span>
                <p className={s.growDesc}>
                  Deleghi al personale con permessi per sede, senza dare le
                  chiavi di tutto.
                </p>
              </Reveal>
              <Reveal className={s.growRow}>
                <span className={s.growName}>
                  <span className={s.growIcon}>
                    <QrCode size={18} strokeWidth={2} />
                  </span>
                  Ordine al tavolo
                  <span className={s.proTag}>PRO</span>
                </span>
                <p className={s.growDesc}>
                  Il cliente ordina dal QR al tavolo, senza chiamare nessuno.
                </p>
              </Reveal>
              <Reveal className={s.growRow}>
                <span className={s.growName}>
                  <span className={s.growIcon}>
                    <CalendarCheck size={18} strokeWidth={2} />
                  </span>
                  Prenotazioni
                  <span className={s.proTag}>PRO</span>
                </span>
                <p className={s.growDesc}>
                  Il cliente prenota un tavolo online, tu gestisci la sala da un
                  posto solo.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ MULTI-SEDE — voce + cruscotto catena (mostra, non dice) ============ */}
        <ChainSection />

        {/* ============ IMPORT MENÙ CON AI — spintarello prima del prezzo ============ */}
        <AiImportSection />

        {/* ============ DISPONIBILITÀ — complemento: crei col AI, poi lo tieni aggiornato ============ */}
        <AvailabilitySection />

        {/* ============ PREZZI (dati reali) ============ */}
        <section
          className={`${s.section} ${s.sectionAlt}`}
          id="prezzi"
          aria-labelledby="prezzi-h2"
        >
          <div className={s.container}>
            <Reveal className={s.sectionLead}>
              <h2 className={s.sectionH2} id="prezzi-h2">
                Un prezzo per sede. <em>Chiaro.</em>
              </h2>
              <p className={s.sectionH2Sub}>
                IVA inclusa. Dal secondo locale ogni sede costa il 10% in meno.
              </p>
            </Reveal>

            <div className={s.plans}>
              {MOCKUP_PRICING_PLANS.map((plan) => {
                const isPro = plan.key === "pro";
                return (
                  <Reveal
                    key={plan.key}
                    className={`${s.plan} ${plan.popular ? s.planPopular : ""}`}
                  >
                    {plan.popular && (
                      <span className={s.planBadge}>Consigliato</span>
                    )}
                    <span className={s.planName}>{plan.name}</span>
                    <span className={s.planPrice}>{plan.priceLabel}</span>
                    <span className={s.planDiscount}>{plan.discountNote}</span>
                    <p className={s.planFraming}>{plan.framing}</p>
                    <div className={s.planDivider} />
                    {isPro ? (
                      <ul className={`${s.planList} ${s.planAdditions}`}>
                        {plan.additions!.map((add) => (
                          <li className={s.addition} key={add.name}>
                            <span className={s.additionHead}>
                              <Check className={s.checkIcon} />
                              <span className={s.additionName}>{add.name}</span>
                            </span>
                            <span className={s.additionBenefit}>
                              {add.benefit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className={s.planList}>
                        {plan.features!.map((f) => (
                          <li className={s.planItem} key={f}>
                            <Check className={s.checkIcon} />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    <a
                      href="#waitlist"
                      className={`${s.planCta} ${
                        plan.popular ? s.planCtaPrimary : s.planCtaGhost
                      }`}
                    >
                      Richiedi accesso
                    </a>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ FAQ (dati reali) ============ */}
        <section
          className={s.section}
          id="faq"
          aria-labelledby="faq-h2"
        >
          <div className={s.container}>
            <Reveal className={s.sectionLead}>
              <h2 className={s.sectionH2} id="faq-h2">
                Domande, in breve.
              </h2>
            </Reveal>
            <FaqList />
          </div>
        </section>
      </main>

      {/* ============ CHIUSURA (serale) — messaggio + form in UN blocco ============ */}
      <section className={s.close} id="waitlist" aria-labelledby="close-h2">
        <div className={s.closeInner}>
          <div className={s.closeLead}>
            <h2 className={s.closeTitle} id="close-h2">
              Il tuo menu, sempre al passo. <em>Partiamo?</em>
            </h2>
            <p className={s.closeOffer}>
              Il primo mese è gratuito, provi con calma e decidi.
            </p>
            <p className={s.closeSub}>
              Lasciaci i tuoi dati: ti ricontattiamo noi e seguiamo insieme
              l'attivazione.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* ============ FOOTER (riuso struttura landing viva) ============ */}
      <RedesignFooter />
    </div>
  );
}

/* ── Form contatto — riusa ESATTAMENTE la logica del WaitlistForm vivo ─────
   Stessi campi (email, nome, tipo attività opzionale), stesso endpoint
   Edge Function `join-waitlist`, stesso payload. Cambia solo veste + copy. */
type ContactStatus = "idle" | "submitting" | "success" | "error";

const CONTACT_ACTIVITY_TYPES = [
  { value: "ristorante", label: "Ristorante" },
  { value: "bar", label: "Bar" },
  { value: "hotel", label: "Hotel" },
  { value: "retail", label: "Retail" },
  { value: "altro", label: "Altro" },
] as const;

function isValidContactEmail(email: string): boolean {
  const i = email.indexOf("@");
  return i > 0 && email.slice(i + 1).includes(".");
}

function ContactForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [activityType, setActivityType] = useState("");
  const [status, setStatus] = useState<ContactStatus>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidContactEmail(email.trim())) {
      setEmailError("Controlla l'indirizzo email");
      return;
    }
    setEmailError(null);

    setStatus("submitting");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-waitlist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            name: name.trim() || undefined,
            activity_type: activityType || undefined,
          }),
        },
      );
      const data = await res.json();
      setStatus(data.success ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className={s.contactSuccess}>
        <CircleCheck size={24} strokeWidth={2} />
        <span>Perfetto! Ti contattiamo a breve.</span>
      </div>
    );
  }

  return (
    <form className={s.contactForm} onSubmit={handleSubmit} noValidate>
      <TextInput
        inputClassName={s.contactFieldControl}
        type="email"
        name="email"
        placeholder="La tua email"
        aria-label="La tua email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (emailError) setEmailError(null);
        }}
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? "contact-email-error" : undefined}
        required
      />
      {emailError && (
        <p className={s.contactError} id="contact-email-error">
          {emailError}
        </p>
      )}
      <TextInput
        inputClassName={s.contactFieldControl}
        type="text"
        name="name"
        placeholder="Il tuo nome"
        aria-label="Il tuo nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Select
        selectClassName={`${s.contactFieldControl} ${
          activityType === "" ? s.contactSelectEmpty : ""
        }`}
        name="activity_type"
        aria-label="Tipo di attività (opzionale)"
        value={activityType}
        onChange={(e) => setActivityType(e.target.value)}
        options={[
          { value: "", label: "Tipo di attività (opzionale)" },
          ...CONTACT_ACTIVITY_TYPES,
        ]}
      />
      <button
        className={s.contactSubmit}
        type="submit"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Invio in corso…" : "Richiedi accesso"}
      </button>
      {status === "error" && (
        <p className={s.contactError}>Si è verificato un errore. Riprova.</p>
      )}
    </form>
  );
}

/* ── Footer — riuso struttura del footer vivo (Prodotto / Legale / Contatti) ── */
interface RedesignFooterLink {
  label: string;
  href: string;
}
interface RedesignFooterCol {
  title: string;
  links: RedesignFooterLink[];
}

function RedesignFooter() {
  const cols: RedesignFooterCol[] = [
    {
      title: "Prodotto",
      links: [
        { label: "Funzionalità", href: "#giornata" },
        { label: "Prezzi", href: "#prezzi" },
        { label: "FAQ", href: "#faq" },
      ],
    },
    {
      title: "Legale",
      links: [
        { label: "Privacy Policy", href: "/legal/privacy" },
        { label: "Termini di Servizio", href: "/legal/termini" },
      ],
    },
    {
      title: "Contatti",
      links: [
        { label: "Scrivici", href: `mailto:${COMPANY.contact.info}` },
        { label: "Supporto", href: `mailto:${COMPANY.contact.support}` },
      ],
    },
  ];

  return (
    <footer className={s.footer}>
      <div className={s.footerTop}>
        <div className={s.footerBrand}>
          <img
            src={logoHorizontal}
            alt="CataloGlobe"
            className={s.footerLogoImg}
          />
          <p className={s.footerDesc}>
            Menu digitali dinamici per ristoranti, bar, hotel e locali.
          </p>
        </div>
        <div className={s.footerCols}>
          {cols.map((col) => (
            <div key={col.title} className={s.footerCol}>
              <p className={s.footerColTitle}>{col.title}</p>
              {col.links.map((link) => (
                <a key={link.label} href={link.href} className={s.footerLink}>
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={s.footerBottom}>
        <p className={s.footerCopyright}>
          © {new Date().getFullYear()} {COMPANY.businessName} ·{" "}
          {COMPANY.legalAddress.city} ({COMPANY.legalAddress.province})
        </p>
      </div>
    </footer>
  );
}

/* ── Check icon (SVG inline, coerente con set Lucide) ───────────────── */
function Check({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ── Leva 1: programmazione / in evidenza — selettore giorni ────────
   Il protagonista è lo SLOT "in evidenza" che compare e sparisce DENTRO la
   mini-home (l'anteprima della pagina pubblica), non un badge isolato.
   Palinsesto vario (non solo Ven) per dimostrare che ogni giorno ha la sua
   promo, o nessuna — distinto dallo scrubber dell'ora dell'hero. */
type DayKey = "lun" | "mar" | "mer" | "gio" | "ven" | "sab" | "dom";
type PromoKind = "aperitivo" | "degustazione" | "cena" | "musica";
type DayPromo = { title: string; time: string; meta: string; kind: PromoKind };

const SCHED_DAYS: { key: DayKey; label: string; full: string }[] = [
  { key: "lun", label: "Lun", full: "Lunedì" },
  { key: "mar", label: "Mar", full: "Martedì" },
  { key: "mer", label: "Mer", full: "Mercoledì" },
  { key: "gio", label: "Gio", full: "Giovedì" },
  { key: "ven", label: "Ven", full: "Venerdì" },
  { key: "sab", label: "Sab", full: "Sabato" },
  { key: "dom", label: "Dom", full: "Domenica" },
];

const SCHED_PROMOS: Record<DayKey, DayPromo | null> = {
  lun: null,
  mar: {
    title: "Serata degustazione",
    time: "20:00",
    meta: "dalle 20:00",
    kind: "degustazione",
  },
  mer: null,
  gio: {
    title: "Cena a tema",
    time: "20:00",
    meta: "dalle 20:00",
    kind: "cena",
  },
  ven: {
    title: "Aperitivo del venerdì",
    time: "18:30",
    meta: "18:30–21:00 · in terrazza",
    kind: "aperitivo",
  },
  sab: {
    title: "Musica dal vivo",
    time: "21:00",
    meta: "dalle 21:00 · ingresso libero",
    kind: "musica",
  },
  dom: null,
};

function promoKindClass(kind: PromoKind) {
  if (kind === "musica") return s.miniFeaturedMusica;
  if (kind === "degustazione") return s.miniFeaturedDegustazione;
  if (kind === "cena") return s.miniFeaturedCena;
  return s.miniFeaturedAperitivo;
}

function ScheduleDemo() {
  const [day, setDay] = useState<DayKey>("ven");
  const dayInfo = SCHED_DAYS.find((d) => d.key === day)!;
  const promo = SCHED_PROMOS[day];

  return (
    <div className={s.schedDemo}>
      <div
        className={s.dayPicker}
        role="group"
        aria-label="Giorno della settimana"
      >
        {SCHED_DAYS.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`${s.dayBtn} ${day === d.key ? s.dayBtnActive : ""}`}
            aria-pressed={day === d.key}
            onClick={() => setDay(d.key)}
          >
            {d.label}
            <span
              className={`${s.dayDot} ${SCHED_PROMOS[d.key] ? s.dayDotOn : ""}`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      {/* la "vetrina": mini-home della pagina pubblica */}
      <div className={s.miniHome}>
        <div className={s.miniHomeBar}>
          <span className={s.miniHomeName}>Il tuo locale</span>
          <span className={s.miniHomeNav}>
            {dayInfo.full}
            {promo ? ` · ${promo.time}` : ""}
          </span>
        </div>

        <div className={s.miniSlot}>
          {promo ? (
            <div className={`${s.miniFeatured} ${promoKindClass(promo.kind)}`}>
              <div className={s.miniFeaturedInner}>
                <span className={s.miniFeaturedTag}>In evidenza</span>
                <span className={s.miniFeaturedTitle}>{promo.title}</span>
                <span className={s.miniFeaturedMeta}>{promo.meta}</span>
              </div>
            </div>
          ) : (
            <p className={s.miniEmpty}>
              Nessuna promo oggi — la home mostra solo il menu.
            </p>
          )}
        </div>

        <div className={s.miniSection}>Menu della sera</div>
        <div className={s.miniRow}>
          <span>Spritz della casa</span>
          <span>€8</span>
        </div>
        <div className={s.miniRow}>
          <span>Tagliere misto</span>
          <span>€14</span>
        </div>
      </div>
    </div>
  );
}

/* ── Leva 2: cambio stile — 3 preset veri (colore + font + forma).
   Stessi piatti, stessi prezzi in ogni veste. NON è lo Style Editor:
   sono 3 preset credibili che fanno intuire la profondità del prodotto. */
type SkinKey = "warm" | "cool" | "night";
function StyleDemo({ reduce }: { reduce: boolean }) {
  const skins: { key: SkinKey; label: string }[] = [
    { key: "warm", label: "Caldo" },
    { key: "cool", label: "Chiaro" },
    { key: "night", label: "Sera" },
  ];
  const [skin, setSkin] = useState<SkinKey>("cool");
  const dishes = [
    { name: "Trofie al pesto", price: "€12" },
    { name: "Insalata di mare", price: "€16" },
    { name: "Focaccia di Recco", price: "€7" },
  ];
  const previewCls =
    skin === "warm"
      ? s.previewWarm
      : skin === "cool"
        ? s.previewCool
        : s.previewNight;
  return (
    <div className={s.styleDemo}>
      <div
        className={s.styleSwatches}
        role="group"
        aria-label="Stile della pagina"
      >
        {skins.map((st) => {
          const cls =
            st.key === "warm"
              ? s.swatchWarm
              : st.key === "cool"
                ? s.swatchCool
                : s.swatchNight;
          return (
            <button
              key={st.key}
              className={`${s.swatch} ${cls} ${skin === st.key ? s.swatchActive : ""}`}
              aria-pressed={skin === st.key}
              onClick={() => setSkin(st.key)}
            >
              {st.label}
            </button>
          );
        })}
      </div>
      <div
        className={`${s.stylePreview} ${previewCls}`}
        data-reduce={reduce ? "1" : undefined}
      >
        <div className={s.spNav}>
          <span className={s.spName}>Il tuo locale</span>
          <span className={s.spTag}>Menu</span>
        </div>
        <div className={s.spMenu}>
          {dishes.map((d) => (
            <div className={s.spRow} key={d.name}>
              <span className={s.spRowName}>{d.name}</span>
              <span className={s.spRowPrice}>{d.price}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Leva 3: traduzione realtime — i nomi virano, i prezzi restano ───── */
type LangKey = "IT" | "EN" | "FR" | "DE" | "ES";
const TRANS_LANGS: LangKey[] = ["IT", "EN", "FR", "DE", "ES"];

type TransDish = { name: string; price: string; desc: Record<LangKey, string> };
const TRANS_DISHES: TransDish[] = [
  {
    name: "Spaghetti al pomodoro",
    price: "€10",
    desc: {
      IT: "Pasta con pomodoro fresco e basilico",
      EN: "Pasta with fresh tomato and basil",
      FR: "Pâtes à la tomate fraîche et basilic",
      DE: "Pasta mit frischen Tomaten und Basilikum",
      ES: "Pasta con tomate fresco y albahaca",
    },
  },
  {
    name: "Bruschetta",
    price: "€6",
    desc: {
      IT: "Pane tostato con pomodoro e aglio",
      EN: "Toasted bread with tomato and garlic",
      FR: "Pain grillé à la tomate et à l'ail",
      DE: "Geröstetes Brot mit Tomate und Knoblauch",
      ES: "Pan tostado con tomate y ajo",
    },
  },
  {
    name: "Tiramisù",
    price: "€6",
    desc: {
      IT: "Dolce al caffè con mascarpone",
      EN: "Coffee dessert with mascarpone",
      FR: "Dessert au café avec mascarpone",
      DE: "Kaffee-Dessert mit Mascarpone",
      ES: "Postre de café con mascarpone",
    },
  },
];

/* Nome piatto e prezzo restano fissi in ogni lingua (scelta di prodotto:
   autenticità del nome originale); cambia solo la descrizione tradotta. */
function TranslateDemo() {
  const [lang, setLang] = useState<LangKey>("IT");
  return (
    <div className={s.transDemo}>
      <span
        className={s.langToggle}
        role="group"
        aria-label="Lingua del visitatore"
      >
        {TRANS_LANGS.map((l) => (
          <button
            key={l}
            className={`${s.langOpt} ${lang === l ? s.langOptActive : ""}`}
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
          >
            {l}
          </button>
        ))}
      </span>
      <div className={s.transRows}>
        {TRANS_DISHES.map((d) => (
          <div className={s.transRow} key={d.name}>
            <div className={s.transTop}>
              <span className={s.transName}>{d.name}</span>
              <span className={s.transPrice}>{d.price}</span>
            </div>
            <p className={s.transDesc}>{d.desc[lang]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── FAQ accordion (dati reali, accessibile) ────────────────────────── */
function FaqList() {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  return (
    <div className={s.faqList}>
      {REDESIGN_FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div className={s.faqItem} key={item.q}>
            <button
              className={s.faqQ}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              {item.q}
              <Plus
                size={20}
                strokeWidth={2}
                className={`${s.faqIcon} ${isOpen ? s.faqIconOpen : ""}`}
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  className={s.faqA}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.28, ease: "easeOut" }}
                >
                  <p className={s.faqAInner}>{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
