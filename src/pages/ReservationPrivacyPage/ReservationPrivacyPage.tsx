import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { COMPANY } from "@/config/company";
import { usePageHead } from "@/hooks/usePageHead";
import { usePublicLanguageSync } from "@/hooks/usePublicLanguageSync";
import {
    getReservationPrivacyData,
    type ReservationPrivacyData
} from "@/services/supabase/reservationPrivacy";
import { parseInlineEmphasis } from "@components/PublicCollectionView/StoryView/blocks/parseInlineEmphasis";

import {
    NOTICE_COPY,
    NOTICE_VERSION,
    fillNoticeText,
    type NoticeBlock,
    type NoticeParams
} from "./notice";
import { resolveNoticeLang, type PublicLang } from "./types";
import styles from "./ReservationPrivacyPage.module.scss";

/**
 * Informativa privacy delle prenotazioni di una sede — `/:slug/privacy-prenotazioni`.
 *
 * Il titolare del trattamento dei dati di chi prenota è il ristorante, non
 * CataloGlobe: il cliente prenota presso quel locale, ed è quel locale a
 * decidere finalità e mezzi (CataloGlobe è responsabile ex art. 28). Perciò
 * questa pagina, e non `/legal/privacy`, è quella linkata dal consenso nel form
 * di prenotazione: l'informativa unica di CataloGlobe nominerebbe il soggetto
 * sbagliato.
 *
 * Documento statico: nessuna interazione oltre il sommario e il ritorno. Il
 * testo sta in `notice.ts` nelle cinque lingue; qui c'è solo l'impaginazione e
 * la compilazione dei segnaposto con i dati della sede.
 *
 * Nessuna vestizione col tema della sede né logo CataloGlobe: il primo
 * richiederebbe un fetch del catalogo che questo documento non usa, il secondo
 * suggerirebbe che l'autore dell'informativa siamo noi.
 */

type ViewState =
    | { kind: "loading" }
    | { kind: "ready"; data: Extract<ReservationPrivacyData, { available: true }> }
    | { kind: "unavailable" }
    /** Slug inesistente, rete caduta, 5xx: un errore tecnico, non una mancanza
     *  del locale. Messaggio diverso perché il rimedio è diverso. */
    | { kind: "error" };

/** Nodi inline (`**grassetto**`) → React. Il parser emette nodi TS, mai HTML. */
function renderInline(raw: string): React.ReactNode[] {
    return parseInlineEmphasis(raw).map((node, i) => {
        if (node.type === "strong") return <strong key={i}>{node.value}</strong>;
        if (node.type === "em") return <em key={i}>{node.value}</em>;
        return <span key={i}>{node.value}</span>;
    });
}

function NoticeBlockView({
    block,
    params,
    lang
}: {
    block: NoticeBlock;
    params: NoticeParams;
    lang: PublicLang;
}) {
    if (block.kind === "p") {
        return <p className={styles.paragraph}>{renderInline(fillNoticeText(block.text, params, lang))}</p>;
    }

    if (block.kind === "ul") {
        return (
            <ul className={styles.list}>
                {block.items.map((item, i) => (
                    <li key={i}>{renderInline(fillNoticeText(item, params, lang))}</li>
                ))}
            </ul>
        );
    }

    // Tabella finalità / base giuridica. Wrapper con overflow proprio: su
    // schermo stretto scorre la tabella, non la pagina.
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">{block.head[0]}</th>
                        <th scope="col">{block.head[1]}</th>
                    </tr>
                </thead>
                <tbody>
                    {block.rows.map((row, i) => (
                        <tr key={i}>
                            <td>{renderInline(fillNoticeText(row[0], params, lang))}</td>
                            <td>{renderInline(fillNoticeText(row[1], params, lang))}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function ReservationPrivacyPage() {
    const { slug, lang: langParam } = useParams<{ slug: string; lang?: string }>();
    const { i18n } = useTranslation("public");

    // Nessun LanguageProvider in questo ramo: la lingua la comanda l'URL.
    usePublicLanguageSync(true);

    const lang = resolveNoticeLang(langParam ?? i18n.language);
    const copy = NOTICE_COPY[lang];

    const [state, setState] = useState<ViewState>({ kind: "loading" });

    const load = useCallback(async () => {
        if (!slug) {
            setState({ kind: "error" });
            return;
        }
        setState({ kind: "loading" });
        try {
            const data = await getReservationPrivacyData(slug);
            setState(data.available ? { kind: "ready", data } : { kind: "unavailable" });
        } catch {
            setState({ kind: "error" });
        }
    }, [slug]);

    useEffect(() => {
        void load();
    }, [load]);

    const venueName = state.kind === "ready" ? state.data.venueName : "";

    usePageHead({
        title: venueName ? `${copy.docTitle} — ${venueName}` : copy.docTitle,
        lang
    });

    // Documento legale di una singola sede: non ha ragione di stare in un indice
    // di ricerca, e indicizzarlo esporrebbe la ragione sociale del locale su
    // query che non la cercavano. Stesso pattern di `NotFound`.
    useEffect(() => {
        let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
        const created = !meta;
        if (!meta) {
            meta = document.createElement("meta");
            meta.name = "robots";
            document.head.appendChild(meta);
        }
        const previous = meta.content;
        meta.content = "noindex";
        return () => {
            if (created) meta?.remove();
            else if (meta) meta.content = previous;
        };
    }, []);

    const versionDate = useMemo(() => {
        const [y, m, d] = NOTICE_VERSION.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString(lang, {
            year: "numeric",
            month: "long",
            day: "numeric"
        });
    }, [lang]);

    const backHref = langParam ? `/${slug}/${langParam}` : `/${slug}`;

    const params: NoticeParams | null = useMemo(() => {
        if (state.kind !== "ready") return null;
        return {
            venueName: state.data.venueName,
            legalName: state.data.legalName,
            address: state.data.address,
            contactEmail: state.data.contactEmail,
            phone: state.data.phone,
            // §6 nomina il responsabile ex art. 28. Letta dalla config, mai
            // riscritta nel template: `src/config/company.ts` è duplicazione
            // sincronizzata con `supabase/functions/_shared/company-config.ts`.
            processorLegalName: COMPANY.legalName,
            versionDate
        };
    }, [state, versionDate]);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <Link to={backHref} className={styles.backLink}>
                    ← {copy.backLabel}
                </Link>
            </header>

            <main className={styles.main}>
                {state.kind === "loading" && (
                    <p className={styles.stateText} role="status">
                        {copy.loading}
                    </p>
                )}

                {/* Il locale non ha completato i dati. Non è un errore del
                    cliente e non va scritto come tale: l'informativa non si
                    genera senza titolare identificato, e un documento privo del
                    titolare non è incompleto, dichiara il falso per omissione.
                    Quindi qui NON si mostra il testo parziale. */}
                {state.kind === "unavailable" && (
                    <section className={styles.stateBlock}>
                        <h1 className={styles.stateTitle}>{copy.unavailable.title}</h1>
                        <p className={styles.stateBody}>{copy.unavailable.body}</p>
                    </section>
                )}

                {state.kind === "error" && (
                    <section className={styles.stateBlock}>
                        <h1 className={styles.stateTitle}>{copy.error.title}</h1>
                        <p className={styles.stateBody}>{copy.error.body}</p>
                    </section>
                )}

                {state.kind === "ready" && params && (
                    <article className={styles.doc}>
                        <h1 className={styles.docTitle}>{copy.docTitle}</h1>
                        <p className={styles.docSubtitle}>
                            {fillNoticeText(copy.docSubtitle, params, lang)}
                        </p>
                        <p className={styles.docReference}>{copy.docReference}</p>
                        <p className={styles.docVersion}>
                            {fillNoticeText(copy.lastUpdatedLabel, params, lang)}
                        </p>

                        {/* Sommario: è un documento lungo, e chi lo apre di
                            solito cerca una sezione precisa (i diritti, la
                            conservazione), non una lettura dall'inizio. */}
                        <nav className={styles.toc} aria-label={copy.tocLabel}>
                            <p className={styles.tocLabel}>{copy.tocLabel}</p>
                            <ol className={styles.tocList}>
                                {copy.sections.map(section => (
                                    <li key={section.num}>
                                        <a href={`#s${section.num}`}>{section.title}</a>
                                    </li>
                                ))}
                            </ol>
                        </nav>

                        {copy.sections.map(section => (
                            <section
                                key={section.num}
                                id={`s${section.num}`}
                                className={styles.section}
                            >
                                <h2 className={styles.sectionTitle}>
                                    <span className={styles.sectionNum}>{section.num}</span>
                                    {section.title}
                                </h2>
                                {section.blocks.map((block, i) => (
                                    <NoticeBlockView
                                        key={i}
                                        block={block}
                                        params={params}
                                        lang={lang}
                                    />
                                ))}
                            </section>
                        ))}
                    </article>
                )}
            </main>
        </div>
    );
}
