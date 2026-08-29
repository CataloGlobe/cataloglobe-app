import { forwardRef, useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { CircleHelp, X } from "lucide-react";

import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import type { RuleType } from "@/services/supabase/layoutScheduling";

import styles from "./RuleTypeHelpModal.module.scss";

/**
 * Spiegazione on-demand del tipo di regola attivo nella pagina Programmazione.
 *
 * Un solo componente per tutte le tab: il contenuto vive in `HELP_CONTENT`,
 * struttura dichiarativa per `HelpRuleKey` (i quattro tipi di regola più la
 * panoramica "Tutte"). Un tipo nuovo si aggiunge con una voce qui, riusando uno
 * dei blocchi visivi esistenti (o aggiungendone uno alla union `HelpVisual`),
 * senza toccare il render.
 *
 * Nessuno stato persistito: la modale si apre solo su richiesta esplicita.
 *
 * NB colori: `ModalLayout` ha superfici hardcoded chiare e nessun override
 * `[data-theme="dark"]`. Il contenuto qui sotto usa quindi solo colori stabili
 * fra i due temi (variabili SCSS statiche via il componente `Text`, token
 * `--brand-primary` / `--color-warning-*` / `--color-green-*`), mai `var(--text)`
 * che in tema scuro diventerebbe quasi bianco su fondo chiaro.
 */

/* ------------------------------------------------------------------
 * CONTENUTO (dichiarativo, per tipo di regola)
 * ------------------------------------------------------------------ */

type HelpPoint = {
    title: string;
    description: string;
};

type HelpVisual =
    /** Righe "finestra → valore → tipo di finestra" (Layout). */
    | {
          kind: "windowRows";
          caption: string;
          rows: Array<{ window: string; value: string; meta?: string; isBase?: boolean }>;
      }
    /** Schema verticale della pagina pubblica (In evidenza). */
    | {
          kind: "pageStack";
          caption: string;
          blocks: Array<{ label: string; role: "header" | "slot" | "catalog" }>;
      }
    /** Righe "momento → prodotto → prezzo", con prezzo sostituito (Prezzi). */
    | {
          kind: "priceRows";
          caption: string;
          rows: Array<{ label: string; product: string; price: string; newPrice?: string }>;
      }
    /** Due possibilità affiancate (Disponibilità). */
    | {
          kind: "columns";
          caption: string;
          columns: Array<
              {
                  label: string;
                  caption: string;
              } & (
                  | { preview: "placeholder"; placeholderText: string }
                  | { preview: "product"; productName: string; productPrice: string; badge: string }
              )
          >;
      };

type HelpContent = {
    title: string;
    intro: ReactNode;
    visual: HelpVisual;
    points: HelpPoint[];
    note?: string;
};

/** Chiave del contenuto: i quattro tipi di regola più la panoramica "Tutte". */
export type HelpRuleKey = RuleType | "all";

const HELP_CONTENT: Record<HelpRuleKey, HelpContent> = {
    layout: {
        title: "Come funzionano le regole di layout",
        intro: (
            <>
                Una regola di layout dice <strong>quale menù</strong> e <strong>quale stile</strong>{" "}
                mostrare, <strong>in quale sede</strong> e <strong>in quale momento</strong>. Se più
                regole valgono nello stesso istante, vince quella più specifica.
            </>
        ),
        visual: {
            kind: "windowRows",
            caption: "Esempio · una sede con due regole",
            rows: [
                { window: "7:00 – 11:00", value: "Menù Colazioni", meta: "fascia oraria" },
                { window: "sempre attiva", value: "Alla carta", meta: "nessuna finestra", isBase: true }
            ]
        },
        points: [
            {
                title: "Chi ha una finestra, vince",
                description:
                    "Alle 9 del mattino i clienti vedono le Colazioni. Alle 15 quella regola non vale più, e torna Alla carta."
            },
            {
                title: "Una regola sempre attiva è la tua base",
                description:
                    "Vale in ogni momento non coperto da altre regole. Se hai usato la configurazione guidata, è la regola creata in quel momento."
            },
            {
                title: "Ogni regola vale per le sedi che scegli",
                description:
                    "Con più locali puoi dare a ciascuno menù diversi, oppure lo stesso menù a tutti."
            }
        ]
    },

    featured: {
        title: "Come funzionano i contenuti in evidenza",
        intro: (
            <>
                Una regola in evidenza decide <strong>quale contenuto mettere in risalto</strong> e{" "}
                <strong>in quale periodo</strong>. Il contenuto compare sopra o sotto il menù, nella
                posizione che scegli.
            </>
        ),
        visual: {
            kind: "pageStack",
            caption: "Dove compare nella pagina pubblica",
            blocks: [
                { label: "Intestazione del locale", role: "header" },
                { label: "Sopra il menù", role: "slot" },
                { label: "Il menù", role: "catalog" },
                { label: "Sotto il menù", role: "slot" }
            ]
        },
        points: [
            {
                title: "Due posizioni possibili",
                description:
                    "Sopra il menù per ciò che vuoi far notare subito — una promozione, un evento. Sotto per ciò che completa la visita."
            },
            {
                title: "Compare e sparisce da solo",
                description:
                    "Imposti il periodo una volta: l'aperitivo di agosto smette di comparire il primo settembre, senza che tu debba ricordartene."
            },
            {
                title: "Il contenuto lo crei prima",
                description:
                    "Promozioni, eventi e avvisi si creano in Contenuti in evidenza. Qui decidi solo quando mostrarli."
            }
        ]
    },

    price: {
        title: "Come funzionano le regole di prezzo",
        intro: (
            <>
                Una regola di prezzo <strong>sovrascrive il prezzo</strong> di uno o più prodotti,
                solo <strong>nel periodo e nelle sedi</strong> che scegli. Il prodotto resta uno:
                cambia solo quanto costa.
            </>
        ),
        visual: {
            kind: "priceRows",
            caption: "Esempio · happy hour del giovedì, 18:00 – 20:00",
            rows: [
                { label: "Prezzo normale", product: "Spritz", price: "€ 7,00" },
                {
                    label: "Durante la regola",
                    product: "Spritz",
                    price: "€ 7,00",
                    newPrice: "€ 5,00"
                },
                { label: "Dopo le 20:00", product: "Spritz", price: "€ 7,00" }
            ]
        },
        points: [
            {
                title: "Il prezzo originale non si perde",
                description:
                    "Finita la finestra, il prodotto torna al suo prezzo da solo. Non devi rimetterlo a mano."
            },
            {
                title: "Scegli tu quali prodotti",
                description:
                    "Una regola può riguardare un solo piatto o un elenco: gli altri restano al loro prezzo."
            },
            {
                title: "Utile anche per sedi diverse",
                description:
                    "Lo stesso prodotto può costare diversamente in due locali, senza doverlo duplicare."
            }
        ]
    },

    visibility: {
        title: "Come funzionano le regole di disponibilità",
        intro: (
            <>
                Una regola di disponibilità decide{" "}
                <strong>cosa fare di un prodotto</strong> quando non lo servi: puoi{" "}
                <strong>nasconderlo del tutto</strong> oppure <strong>lasciarlo visibile</strong>,
                segnalato come non disponibile.
            </>
        ),
        visual: {
            kind: "columns",
            caption: "Le due possibilità",
            columns: [
                {
                    label: "Nascosto",
                    preview: "placeholder",
                    placeholderText: "Il piatto non compare",
                    caption:
                        "Per ciò che non offri in quel periodo: un piatto fuori stagione, un menù non servito a pranzo."
                },
                {
                    label: "Non disponibile",
                    preview: "product",
                    productName: "Branzino al forno",
                    productPrice: "€ 22,00",
                    badge: "Non disponibile",
                    caption:
                        "Per ciò che di solito c'è ma oggi è finito: il cliente lo vede e sa che esiste."
                }
            ]
        },
        points: [
            {
                title: "Vale per le sedi e i momenti che scegli",
                description:
                    "Un piatto può essere disponibile in un locale e non nell'altro, o solo la sera."
            },
            {
                title: "Il prodotto non viene cancellato",
                description:
                    "Finita la finestra torna visibile da solo, con le sue foto, i suoi prezzi e i suoi allergeni."
            }
        ],
        note: "Per una cosa finita adesso non serve una regola: puoi segnare il singolo prodotto come non disponibile direttamente dalla sede, e rimetterlo appena torna."
    },

    all: {
        title: "Come funziona la panoramica",
        intro: (
            <>
                Qui vedi tutte le regole insieme, di ogni tipo. È la vista da usare quando la pagina
                pubblica non mostra ciò che ti aspetti: da qui capisci quale regola sta decidendo
                cosa.
            </>
        ),
        visual: {
            kind: "windowRows",
            caption: "I quattro tipi di regola",
            rows: [
                { window: "Layout", value: "quale menù e quale stile" },
                { window: "In evidenza", value: "cosa mettere in risalto" },
                { window: "Prezzi", value: "sconti temporanei" },
                { window: "Disponibilità", value: "cosa nascondere" }
            ]
        },
        points: [
            {
                title: "I tipi non competono fra loro",
                description:
                    "Una regola di prezzo non toglie il posto a una di layout: agiscono su cose diverse. La competizione avviene solo fra regole dello stesso tipo."
            },
            {
                title: "Il colore del pallino dice se è attiva adesso",
                description:
                    "Verde significa che sta decidendo qualcosa in questo momento. Grigio che è programmata, sospesa o scaduta."
            },
            {
                title: "Se qualcosa non torna, simula",
                description:
                    "Il simulatore mostra quale regola vince in un giorno e a un'ora che scegli tu."
            }
        ]
    }
};

/* ------------------------------------------------------------------
 * LINK "COME FUNZIONA"
 * ------------------------------------------------------------------ */

type HowItWorksLinkProps = {
    ruleType: HelpRuleKey;
    onClick: () => void;
};

/**
 * Link testuale che apre la modale. Continuazione della frase che lo precede
 * (riga descrittiva della tab o descrizione dell'empty state), quindi link e
 * non bottone bordato.
 */
export const HowItWorksLink = forwardRef<HTMLButtonElement, HowItWorksLinkProps>(function HowItWorksLink(
    { ruleType, onClick },
    ref
) {
    return (
        <button
            ref={ref}
            type="button"
            className={styles.link}
            onClick={onClick}
            aria-haspopup="dialog"
            aria-label={HELP_CONTENT[ruleType].title}
        >
            <CircleHelp size={14} strokeWidth={2} aria-hidden="true" />
            Come funziona
        </button>
    );
});

/* ------------------------------------------------------------------
 * BLOCCHI VISIVI
 * ------------------------------------------------------------------ */

function HelpVisualBlock({ visual }: { visual: HelpVisual }) {
    return (
        <figure className={styles.visual}>
            <figcaption className={styles.visualCaption}>{visual.caption}</figcaption>
            {renderVisualBody(visual)}
        </figure>
    );
}

function renderVisualBody(visual: HelpVisual): ReactNode {
    if (visual.kind === "windowRows") {
        return (
            <div className={styles.rows}>
                {visual.rows.map(row => (
                    <div
                        key={row.window}
                        className={styles.windowRow}
                        data-base={row.isBase ? "true" : undefined}
                    >
                        <span className={styles.rowWindow}>{row.window}</span>
                        <span className={styles.rowValue}>{row.value}</span>
                        {row.meta && <span className={styles.rowMeta}>{row.meta}</span>}
                    </div>
                ))}
            </div>
        );
    }

    if (visual.kind === "pageStack") {
        return (
            <div className={styles.pageStack}>
                {visual.blocks.map(block => (
                    <div
                        key={block.label}
                        className={styles.pageBlock}
                        data-role={block.role}
                    >
                        {block.label}
                    </div>
                ))}
            </div>
        );
    }

    if (visual.kind === "priceRows") {
        return (
            <div className={styles.rows}>
                {visual.rows.map(row => (
                    <div key={row.label} className={styles.priceRow}>
                        <span className={styles.rowMeta}>{row.label}</span>
                        <span className={styles.rowValue}>{row.product}</span>
                        <span className={styles.rowPrice}>
                            {row.newPrice ? (
                                <>
                                    <s className={styles.priceOld}>{row.price}</s>
                                    <span className={styles.priceNew}>{row.newPrice}</span>
                                </>
                            ) : (
                                row.price
                            )}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={styles.columns}>
            {visual.columns.map(column => (
                <div key={column.label} className={styles.column}>
                    <span className={styles.columnLabel}>{column.label}</span>

                    {column.preview === "placeholder" ? (
                        <div className={styles.hiddenPreview}>{column.placeholderText}</div>
                    ) : (
                        <div className={styles.productPreview}>
                            <span className={styles.productName}>{column.productName}</span>
                            <span className={styles.productPrice}>{column.productPrice}</span>
                            <span className={styles.productBadge}>{column.badge}</span>
                        </div>
                    )}

                    <p className={styles.columnCaption}>{column.caption}</p>
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------
 * MODALE
 * ------------------------------------------------------------------ */

type Props = {
    isOpen: boolean;
    ruleType: HelpRuleKey;
    onClose: () => void;
    /** Apre il simulatore già presente nella pagina. */
    onSimulate: () => void;
    /** Link che ha aperto la modale: ci torna il focus alla chiusura. */
    triggerRef?: RefObject<HTMLButtonElement | null>;
    /** False quando la chiusura porta altrove (es. apertura del simulatore). */
    returnFocusOnClose?: boolean;
};

export function RuleTypeHelpModal({
    isOpen,
    ruleType,
    onClose,
    onSimulate,
    triggerRef,
    returnFocusOnClose = true
}: Props) {
    const content = HELP_CONTENT[ruleType];

    /* Ritorno del focus al link. `ModalLayout` prova a farlo da sé, ma rimette
       il focus mentre il suo FocusLock è ancora montato e il lock se lo
       riprende: alla fine dell'animazione di uscita il focus resta sul body.
       Qui aspettiamo che il dialog sia effettivamente smontato e poi
       restituiamo il focus al trigger. Nessun timeout a tempo. */
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (isOpen) {
            wasOpenRef.current = true;
            return;
        }

        if (!wasOpenRef.current) return;
        wasOpenRef.current = false;

        if (!returnFocusOnClose) return;

        const trigger = triggerRef?.current;
        if (!trigger) return;

        let frame = 0;
        let cancelled = false;

        const restoreFocus = () => {
            if (cancelled) return;
            if (document.querySelector('[role="dialog"]')) {
                frame = requestAnimationFrame(restoreFocus);
                return;
            }
            trigger.focus();
        };

        frame = requestAnimationFrame(restoreFocus);

        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [isOpen, triggerRef, returnFocusOnClose]);

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="md" height="fit">
            <ModalLayoutHeader>
                <Text as="h2" variant="title-sm" weight={600}>
                    {content.title}
                </Text>
                <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Chiudi">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                </button>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                <div className={styles.body}>
                    <p className={styles.intro}>{content.intro}</p>

                    <HelpVisualBlock visual={content.visual} />

                    <ol className={styles.points}>
                        {content.points.map((point, index) => (
                            <li key={point.title} className={styles.point}>
                                <span className={styles.pointNumber} aria-hidden="true">
                                    {index + 1}
                                </span>
                                <div className={styles.pointBody}>
                                    <h3 className={styles.pointTitle}>{point.title}</h3>
                                    <p className={styles.pointText}>{point.description}</p>
                                </div>
                            </li>
                        ))}
                    </ol>

                    {content.note && <p className={styles.note}>{content.note}</p>}
                </div>
            </ModalLayoutContent>

            <ModalLayoutFooter>
                <Button variant="secondary" size="sm" onClick={onClose}>
                    Chiudi
                </Button>
                <Button variant="primary" size="sm" onClick={onSimulate}>
                    Simula regole
                </Button>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
