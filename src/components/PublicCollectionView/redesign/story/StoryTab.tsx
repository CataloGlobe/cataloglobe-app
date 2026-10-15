import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, ChevronDown, ChevronRight, CloudOff, UtensilsCrossed } from "lucide-react";
import type { PublicStoryCard, PublicStoryCappello, PublicStoryListResult } from "@/services/supabase/stories";
import { safeHttpHref } from "@/utils/sanitizeUrl";
import type { StorySlotContext } from "../slots";
import { setCappelloCover } from "./cappelloCover";
import {
    cachedStories,
    introParagraphs,
    loadStories,
    rememberStoryScroll,
    storyLayout,
    storyScroll
} from "./storyStore";
import StoryTabReader from "./StoryTabReader";
import styles from "./StoryTab.module.scss";

/** Lo scheletro solo se la lettura tarda; una volta a vista resta almeno un attimo (v38). */
const SKEL_WAIT_MS = 150;
const SKEL_MIN_MS = 300;
const FADE_MS = 220;

type View = "empty" | "skel" | "content" | "error";

function useStoryList(slug: string) {
    const [data, setData] = useState<PublicStoryListResult | null>(() => cachedStories(slug));
    const [view, setView] = useState<View>(() => (cachedStories(slug) ? "content" : "empty"));
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const cached = attempt === 0 ? cachedStories(slug) : null;
        if (cached) {
            setData(cached);
            setView("content");
            return;
        }
        let alive = true;
        // «Riprova» mostra subito lo scheletro; la prima lettura solo se tarda.
        let skelAt = attempt > 0 ? performance.now() : 0;
        if (attempt > 0) setView("skel");
        const skelTimer = attempt > 0
            ? 0
            : window.setTimeout(() => {
                  skelAt = performance.now();
                  setView("skel");
              }, SKEL_WAIT_MS);
        let settleTimer = 0;
        const settle = (apply: () => void) => {
            window.clearTimeout(skelTimer);
            const wait = skelAt ? Math.max(0, SKEL_MIN_MS - (performance.now() - skelAt)) : 0;
            settleTimer = window.setTimeout(() => {
                if (alive) apply();
            }, wait);
        };
        loadStories(slug, attempt > 0).then(
            result =>
                settle(() => {
                    setData(result);
                    setView("content");
                }),
            () => settle(() => setView("error"))
        );
        return () => {
            alive = false;
            window.clearTimeout(skelTimer);
            window.clearTimeout(settleTimer);
        };
    }, [slug, attempt]);

    return { data, view, retry: () => setAttempt(n => n + 1) };
}

type Layer = { id: number; view: View; leaving: boolean; enter: "none" | "fade" | "quick" };

/** Il nuovo stato sfuma sopra il vecchio, con le stesse misure: niente salti (v38). */
function useLayers(view: View): Layer[] {
    const [layers, setLayers] = useState<Layer[]>(() => [{ id: 0, view, leaving: false, enter: "none" }]);
    const shown = useRef(view);
    const nextId = useRef(1);

    useEffect(() => {
        if (shown.current === view) return;
        const fromEmpty = shown.current === "empty";
        shown.current = view;
        const id = nextId.current++;
        setLayers(prev => [
            ...prev.filter(layer => !layer.leaving && layer.view !== "empty").map(layer => ({ ...layer, leaving: true })),
            { id, view, leaving: false, enter: fromEmpty ? "quick" : "fade" }
        ]);
        const timer = window.setTimeout(() => setLayers(prev => prev.filter(layer => !layer.leaving)), FADE_MS);
        return () => window.clearTimeout(timer);
    }, [view]);

    return layers;
}

/**
 * Pagina Storia del redesign (spec §15, mockup v38): cappello del locale con il
 * testo che si apre, poi «Approfondimenti» a schede grandi (fino a tre storie) o a
 * lista (da quattro). Il lettore entra da destra sopra la pagina.
 */
export default function StoryTab({
    slug,
    activityName,
    hasVenueCover,
    selectedStoryId,
    onSelectStory,
    onOpenProduct,
    resolveProduct
}: StorySlotContext & { activityName: string; hasVenueCover: boolean }) {
    const { data, view, retry } = useStoryList(slug);
    const layers = useLayers(view);

    const cappello = data?.cappello ?? null;
    const capCover = view === "content" && hasVenueCover ? (cappello?.cover ?? null) : null;
    // La foto del cappello prende il posto della copertina solo quando il contenuto c'è.
    useEffect(() => {
        setCappelloCover(capCover);
    }, [capCover]);
    useEffect(() => () => setCappelloCover(null), []);

    // Tornando sulla Storia si riparte da dove la si era lasciata. Il cambio scheda porta
    // in cima in un effetto del genitore, che gira dopo questo: si scorre al giro dopo.
    // Letta al primo disegno: il salvataggio allo smontaggio (anche quello finto di StrictMode) la riscrive.
    const [arrivalY] = useState(() => storyScroll(slug));
    useEffect(() => {
        if (view !== "content") return;
        const y = arrivalY;
        if (y <= 0) return;
        const timer = window.setTimeout(() => window.scrollTo(0, y), 0);
        return () => window.clearTimeout(timer);
        // Solo all'arrivo: dopo, lo scorrimento è del cliente.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => () => rememberStoryScroll(slug, window.scrollY), [slug]);

    const render = (layerView: View): ReactNode => {
        if (layerView === "skel") return <StorySkeleton hasCapPhoto={!hasVenueCover} />;
        if (layerView === "error") return <StoryError onRetry={retry} />;
        if (layerView === "content" && data) {
            return <StoryContent data={data} hasVenueCover={hasVenueCover} onOpen={onSelectStory} />;
        }
        return null;
    };

    return (
        <div className={styles.root}>
            <div className={styles.stack}>
                {layers.map(layer => (
                    <div
                        key={layer.id}
                        className={styles.layer}
                        data-enter={layer.enter}
                        data-leaving={layer.leaving || undefined}
                        aria-hidden={layer.leaving || undefined}
                        inert={layer.leaving || undefined}
                    >
                        {render(layer.view)}
                    </div>
                ))}
            </div>
            {selectedStoryId ? (
                <StoryTabReader
                    key={selectedStoryId}
                    slug={slug}
                    storyId={selectedStoryId}
                    activityName={activityName}
                    onClose={() => onSelectStory(null)}
                    onOpenProduct={onOpenProduct}
                    findProduct={resolveProduct}
                />
            ) : null}
        </div>
    );
}

function StoryContent({
    data,
    hasVenueCover,
    onOpen
}: {
    data: PublicStoryListResult;
    hasVenueCover: boolean;
    onOpen: (storyId: string) => void;
}) {
    const { t } = useTranslation("public");
    const { cappello, stories } = data;
    // Con la copertina del locale la foto del cappello va nell'isola: da sola non basta a fare il cappello.
    const hasCappello =
        !!cappello && !!((!hasVenueCover && cappello.cover) || cappello.title || cappello.intro || cappello.website);

    if (!hasCappello && stories.length === 0) {
        return <p className={styles.empty}>{t("story.empty")}</p>;
    }

    return (
        <div className={styles.body}>
            {hasCappello && cappello ? <Cappello cappello={cappello} showPhoto={!hasVenueCover} /> : null}
            {stories.length > 0 ? (
                <section className={styles.more} aria-labelledby="story-more-title" data-first={!hasCappello || undefined}>
                    <div className={styles.sec}>
                        <h2 id="story-more-title">{t("story.section_title")}</h2>
                        <span>{t("story.count", { count: stories.length })}</span>
                    </div>
                    {storyLayout(stories.length) === "grandi" ? (
                        <div className={styles.grid}>
                            {stories.map(story => (
                                <StoryCard key={story.id} story={story} onOpen={onOpen} />
                            ))}
                        </div>
                    ) : (
                        <div className={styles.rows}>
                            {stories.map(story => (
                                <StoryRow key={story.id} story={story} onOpen={onOpen} />
                            ))}
                        </div>
                    )}
                </section>
            ) : null}
        </div>
    );
}

function Cappello({ cappello, showPhoto }: { cappello: PublicStoryCappello; showPhoto: boolean }) {
    const { t } = useTranslation("public");
    const paragraphs = introParagraphs(cappello.intro);
    const website = safeHttpHref(cappello.website);
    const introRef = useRef<HTMLDivElement>(null);
    const runningRef = useRef<Animation | null>(null);
    const [open, setOpen] = useState(false);
    const [long, setLong] = useState(false);
    const [fading, setFading] = useState(false);

    // «Continua a leggere» solo se il testo supera l'altezza chiusa.
    useLayoutEffect(() => {
        const box = introRef.current;
        if (!box) return;
        const measure = () => {
            if (!box.classList.contains(styles.introOpen)) setLong(box.scrollHeight > box.clientHeight + 1);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    const toggle = () => {
        const box = introRef.current;
        if (!box) return;
        const from = box.offsetHeight;
        box.getAnimations().forEach(animation => animation.cancel());
        const next = !open;
        box.classList.toggle(styles.introOpen, next);
        const to = box.offsetHeight;
        box.classList.toggle(styles.introOpen, open);
        setOpen(next);
        if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        setFading(true);
        const animation = box.animate([{ height: `${from}px` }, { height: `${to}px` }], {
            duration: Math.round(Math.min(420, 220 + Math.abs(to - from) * 0.8)),
            easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        });
        // Solo l'ultima animazione toglie la maschera: quella annullata da un secondo tocco no.
        runningRef.current = animation;
        const done = () => {
            if (runningRef.current === animation) setFading(false);
        };
        animation.finished.then(done, done);
    };

    return (
        <section className={styles.cap} aria-label={t("story.cap_aria")}>
            {showPhoto && cappello.cover ? (
                <div className={styles.capCover}>
                    <img src={cappello.cover} alt="" decoding="async" />
                </div>
            ) : null}
            {cappello.title ? <h2 className={styles.capTitle}>{cappello.title}</h2> : null}
            {paragraphs.length > 0 ? (
                <div
                    ref={introRef}
                    id="story-intro"
                    className={`${styles.intro} ${open ? styles.introOpen : ""}`}
                    data-masked={(long && (!open || fading)) || undefined}
                >
                    {paragraphs.map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                    ))}
                </div>
            ) : null}
            {(long || website) && (
                <div className={styles.acts}>
                    {long ? (
                        <button
                            type="button"
                            className={styles.readMore}
                            aria-expanded={open}
                            aria-controls="story-intro"
                            onClick={toggle}
                        >
                            <span>{open ? t("story.read_less") : t("story.read_more")}</span>
                            <ChevronDown size={16} strokeWidth={2} aria-hidden />
                        </button>
                    ) : (
                        <span />
                    )}
                    {website ? (
                        <a className={styles.site} href={website} target="_blank" rel="noopener noreferrer">
                            {t("story.website_cta")}
                            <ArrowUpRight size={15} strokeWidth={2} aria-hidden />
                        </a>
                    ) : null}
                </div>
            )}
        </section>
    );
}

function Photo({ src, className }: { src: string | null; className: string }) {
    return (
        <span className={className} aria-hidden>
            {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : null}
        </span>
    );
}

function StoryCard({ story, onOpen }: { story: PublicStoryCard; onOpen: (storyId: string) => void }) {
    const { t } = useTranslation("public");
    return (
        <button
            type="button"
            className={styles.card}
            onClick={() => onOpen(story.id)}
            aria-label={cardLabel(story, story.product ? t("story.pairs_with", { name: story.product.name }) : null)}
        >
            <Photo src={story.cover_media} className={styles.cardCover} />
            <span className={styles.cardBody}>
                {story.eyebrow ? <span className={styles.eyebrow}>{story.eyebrow}</span> : null}
                <span className={styles.title}>
                    <span>{story.title}</span>
                    <ChevronRight size={16} strokeWidth={2} aria-hidden />
                </span>
                {story.excerpt ? <span className={styles.excerpt}>{story.excerpt}</span> : null}
                {story.product ? (
                    <span className={styles.dish}>
                        <UtensilsCrossed size={14} strokeWidth={2} aria-hidden />
                        <span>
                            {t("story.pairs_with_label")}: <b>{story.product.name}</b>
                        </span>
                    </span>
                ) : null}
            </span>
        </button>
    );
}

function StoryRow({ story, onOpen }: { story: PublicStoryCard; onOpen: (storyId: string) => void }) {
    return (
        <button type="button" className={styles.row} onClick={() => onOpen(story.id)} aria-label={cardLabel(story, null)}>
            <Photo src={story.cover_media} className={styles.thumb} />
            <span className={styles.rowText}>
                {story.eyebrow ? <span className={styles.eyebrow}>{story.eyebrow}</span> : null}
                <span className={styles.title}>{story.title}</span>
                {story.excerpt ? <span className={styles.excerpt}>{story.excerpt}</span> : null}
            </span>
            <ChevronRight size={16} strokeWidth={2} aria-hidden />
        </button>
    );
}

function cardLabel(story: PublicStoryCard, pairs: string | null): string {
    const head = story.eyebrow ? `${story.eyebrow}: ${story.title}` : story.title;
    return pairs ? `${head}. ${pairs}` : head;
}

function StorySkeleton({ hasCapPhoto }: { hasCapPhoto: boolean }) {
    const { t } = useTranslation("public");
    const count = 3;
    return (
        <div className={styles.skel} role="status" aria-label={t("story.loading_aria")}>
            <div aria-hidden>
                <div className={styles.cap}>
                    {hasCapPhoto ? <div className={`${styles.sk} ${styles.capCover}`} /> : null}
                    <div className={styles.sk} style={{ height: 22, width: "64%", marginTop: 6 }} />
                    <div className={styles.skLines}>
                        {["100%", "97%", "100%", "91%", "58%"].map((width, index) => (
                            <div key={index} className={styles.sk} style={{ width }} />
                        ))}
                    </div>
                </div>
                <div className={styles.sec}>
                    <div className={styles.sk} style={{ height: 14, width: "42%" }} />
                </div>
                <div className={styles.grid}>
                    {Array.from({ length: count }, (_, index) => (
                        <div key={index} className={styles.card}>
                            <div className={`${styles.sk} ${styles.cardCover}`} />
                            <div className={styles.cardBody}>
                                <div className={styles.sk} style={{ height: 9, width: "30%" }} />
                                <div className={styles.sk} style={{ height: 15, width: "72%", marginTop: 8 }} />
                                <div className={styles.sk} style={{ height: 11, width: "100%", marginTop: 10 }} />
                                <div className={styles.sk} style={{ height: 11, width: "62%", marginTop: 8 }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StoryError({ onRetry }: { onRetry: () => void }) {
    const { t } = useTranslation("public");
    return (
        <div className={styles.error} role="alert">
            <span className={styles.errorIcon} aria-hidden>
                <CloudOff size={24} strokeWidth={1.75} />
            </span>
            <b>{t("story.error_title")}</b>
            <small>{t("story.error_body")}</small>
            <button type="button" className={styles.retry} onClick={onRetry}>
                {t("error.retry")}
            </button>
        </div>
    );
}
