import { forwardRef, useEffect, useRef } from "react";
import type { ReactNode, Ref, RefObject } from "react";
import { CircleHelp, X } from "lucide-react";

import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import type { RuleType } from "@/services/supabase/layoutScheduling";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { ruleTypeLabel } from "../ruleTypeLabel";

import styles from "./RuleTypeHelpModal.module.scss";

/**
 * Spiegazione on-demand del tipo di regola attivo nella pagina Programmazione.
 *
 * Un solo componente per tutte le tab: il contenuto vive in `helpContent`,
 * struttura dichiarativa per `HelpRuleKey` (i quattro tipi di regola più la
 * panoramica "Tutte"). Un tipo nuovo si aggiunge con una voce qui, riusando uno
 * dei blocchi visivi esistenti (o aggiungendone uno alla union `HelpVisual`),
 * senza toccare il render.
 *
 * Nessuno stato persistito: la modale si apre solo su richiesta esplicita.
 * I testi usano il nome del verticale (`catalogLabel`, dizionario #12).
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

/**
 * Il contenuto, con le parole del verticale: `Label` «Menù», `menu` «menù»,
 * `product` / `products` «prodotto» / «prodotti».
 */
function helpContent(Label: string, product: string, products: string): Record<HelpRuleKey, HelpContent> {
    const menu = Label.toLowerCase();
    return {
    layout: {
        title: `Come funzionano le regole di ${menu} e stile`,
        intro: (
            <>
                Una regola di {menu} e stile dice <strong>quale {menu}</strong> e <strong>quale stile</strong>{" "}
                mostrare, <strong>in quale sede</strong> e <strong>in quale momento</strong>. Se più
                regole valgono nello stesso istante, vince quella più specifica.
            </>
        ),
        visual: {
            kind: "windowRows",
            caption: "Esempio · una sede con due regole",
            rows: [
                { window: "7:00 – 11:00", value: `${Label} Colazioni`, meta: "fascia oraria" },
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
                    `Con più locali puoi dare a ciascuno un ${menu} diverso, oppure lo stesso ${menu} a tutti.`
            }
        ]
    },

    featured: {
        title: "Come funzionano i contenuti in evidenza",
        intro: (
            <>
                Una regola in evidenza decide <strong>quale contenuto mettere in risalto</strong> e{" "}
                <strong>in quale periodo</strong>. Il contenuto compare sopra o sotto il {menu}, nella
                posizione che scegli.
            </>
        ),
        visual: {
            kind: "pageStack",
            caption: "Dove compare nella pagina pubblica",
            blocks: [
                { label: "Intestazione del locale", role: "header" },
                { label: `Sopra il ${menu}`, role: "slot" },
                { label: `Il ${menu}`, role: "catalog" },
                { label: `Sotto il ${menu}`, role: "slot" }
            ]
        },
        points: [
            {
                title: "Due posizioni possibili",
                description:
                    `Sopra il ${menu} per ciò che vuoi far notare subito — una promozione, un evento. Sotto per ciò che completa la visita.`
            },
            {
                title: "Compare e sparisce da solo",
                description:
                    "Imposti il periodo una volta: l'aperitivo di agosto smette di comparire il primo settembre, senza che tu debba ricordartene."
            },
            {
                title: "Il contenuto lo crei prima",
                description:
                    "Promozioni, eventi e avvisi si creano nella pagina In evidenza. Qui decidi solo quando mostrarli."
            }
        ]
    },

    price: {
        title: "Come funzionano le regole di prezzo",
        intro: (
            <>
                Una regola di prezzo <strong>sovrascrive il prezzo</strong> di uno o più {products},
                solo <strong>nel periodo e nelle sedi</strong> che scegli. Il {product} resta uno:
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
                    `Finita la finestra, il ${product} torna al suo prezzo da solo. Non devi rimetterlo a mano.`
            },
            {
                title: `Scegli tu quali ${products}`,
                description:
                    "Una regola può riguardare un solo piatto o un elenco: gli altri restano al loro prezzo."
            },
            {
                title: "Utile anche per sedi diverse",
                description:
                    `Lo stesso ${product} può costare diversamente in due locali, senza doverlo duplicare.`
            }
        ]
    },

    visibility: {
        title: "Come funzionano le regole di disponibilità",
        intro: (
            <>
                Una regola di disponibilità decide{" "}
                <strong>cosa fare di un {product}</strong> quando non lo servi: puoi{" "}
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
                        `Per ciò che non offri in quel periodo: un piatto fuori stagione, un ${menu} non servito a pranzo.`
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
                title: `Il ${product} non viene cancellato`,
                description:
                    "Finita la finestra torna visibile da solo, con le sue foto, i suoi prezzi e i suoi allergeni."
            }
        ],
        note: `Per una cosa finita adesso non serve una regola: puoi segnare il singolo ${product} come non disponibile direttamente dalla sede, e rimetterlo appena torna.`
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
                { window: ruleTypeLabel("layout", Label), value: `quale ${menu} e quale stile` },
                { window: "In evidenza", value: "cosa mettere in risalto" },
                { window: "Prezzi", value: "sconti temporanei" },
                { window: "Disponibilità", value: "cosa nascondere" }
            ]
        },
        points: [
            {
                title: "I tipi si sommano, in quest'ordine.",
                description: `Prima il ${menu} (quale mostrare), poi la disponibilità (cosa si nasconde), poi i prezzi, poi le modifiche fatte a mano nella sede, che vincono su tutto. Dentro un tipo, per ogni sede vince una regola sola: quella che si applica più da vicino (sede, poi gruppo, poi tutte), poi quella con la finestra più stretta.`
            },
            {
                title: "Il pallino dice cosa succede adesso",
                description:
                    "Verde: la regola sta decidendo adesso. Ambra: varrebbe adesso, ma una regola più specifica la sovrascrive. Grigio: adesso non decide niente (programmata, in bozza, spenta o scaduta). Il testo della riga dice lo stesso, senza bisogno del colore."
            },
            {
                title: "Se qualcosa non torna, simula",
                description:
                    "Il simulatore mostra quale regola vince in un giorno e a un'ora che scegli tu."
            }
        ]
    }
    };
}

/* ------------------------------------------------------------------
 * BOTTONE "COME FUNZIONA"
 * ------------------------------------------------------------------ */

type HowItWorksButtonProps = {
    ruleType: HelpRuleKey;
    onClick: () => void;
};

/**
 * «Come funziona» come `Button ghost` con l'icona (P4 del passo 2-bis): lo
 * stesso bottone accanto alla frase del tipo, nel vuoto e nella testata del
 * dettaglio. Il nome accessibile è il titolo della guida che apre.
 */
export const HowItWorksButton = forwardRef<HTMLButtonElement, HowItWorksButtonProps>(function HowItWorksButton(
    { ruleType, onClick },
    ref
) {
    const { catalogLabel, productLabel, productLabelPlural } = useVerticalConfig();
    return (
        <Button
            ref={ref as Ref<HTMLButtonElement | HTMLAnchorElement>}
            variant="ghost"
            size="sm"
            leftIcon={<CircleHelp size={16} aria-hidden="true" />}
            onClick={onClick}
            aria-haspopup="dialog"
            aria-label={helpContent(catalogLabel, productLabel.toLowerCase(), productLabelPlural.toLowerCase())[ruleType].title}
        >
            Come funziona
        </Button>
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
    /** Apre il simulatore già presente nella pagina. Assente: niente «Simula regole». */
    onSimulate?: () => void;
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
    const { catalogLabel, productLabel, productLabelPlural } = useVerticalConfig();
    const content = helpContent(catalogLabel, productLabel.toLowerCase(), productLabelPlural.toLowerCase())[ruleType];

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
                {onSimulate && (
                    <Button variant="primary" size="sm" onClick={onSimulate}>
                        Simula regole
                    </Button>
                )}
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
