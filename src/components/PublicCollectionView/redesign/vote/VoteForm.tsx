import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import { safeHttpHref } from "@/utils/sanitizeUrl";
import type { ReviewsViewProps } from "../../ReviewsView/ReviewsView";
import { submitReview } from "../../ReviewsView/submitReview";
import { closeSheet } from "../sheets/sheetStack";
import { VoteHead } from "./VoteHead";
import styles from "./VoteForm.module.scss";

/** Scelte rapide (D71): quelle toccate vanno in testa al commento. */
const TOPICS = ["service", "dishes", "atmosphere", "wait"] as const;
/** 4-5 stelle: dopo il grazie, la riga Google (come ReviewsView). */
const GOOGLE_DELAY_MS = 600;
/** Solo il grazie (1-3 stelle, o nessun link Google): si chiude da solo. */
const AUTO_CLOSE_MS = 2600;
const MAX_COMMENT = 2000;

type Phase = "form" | "sending" | "thanks";

function readReviewed(activityId: string): boolean {
    try {
        const ts = localStorage.getItem(`fab_reviewed_${activityId}`);
        return !!ts && Date.now() - parseInt(ts, 10) < 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
}

/**
 * Il modulo del voto (spec §11, mockup v38): la modale piccola cresciuta. Stessa
 * testata con le stelle accese e «Molto bene · 4 su 5», scelte rapide, testo
 * facoltativo, «Invia»; poi il grazie e, da 4 stelle con il link del locale,
 * l'invito a Google. Ogni parere arriva al locale, nessuno è bloccato.
 */
export default function VoteForm({
    review,
    initialRating,
    logoUrl,
    venueName,
    onSubmitted
}: {
    review: ReviewsViewProps;
    initialRating: number;
    logoUrl: string | null;
    venueName: string;
    onSubmitted: () => void;
}) {
    const { t } = useTranslation("public");
    const [alreadyReviewed] = useState(() => readReviewed(review.activityId));
    const [phase, setPhase] = useState<Phase>("form");
    const [rating, setRating] = useState(initialRating);
    const [topics, setTopics] = useState<string[]>([]);
    const [text, setText] = useState("");
    // Campo trappola: nascosto, lo compila solo un bot (vedi submit-review).
    const [website, setWebsite] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [showGoogle, setShowGoogle] = useState(false);
    const [copied, setCopied] = useState(false);
    const sent = useRef({ rating: 0, comment: "" });

    const google = safeHttpHref(review.googleReviewUrl);
    const high = sent.current.rating >= 4;

    useEffect(() => {
        if (phase !== "thanks") return;
        if (high && google) {
            const timer = window.setTimeout(() => setShowGoogle(true), GOOGLE_DELAY_MS);
            return () => window.clearTimeout(timer);
        }
        const timer = window.setTimeout(closeSheet, AUTO_CLOSE_MS);
        return () => window.clearTimeout(timer);
    }, [phase, high, google]);

    const send = async () => {
        if (!rating || phase !== "form") return;
        const labels = topics.map(topic => t(`vote.topics.${topic}`));
        const body = text.trim();
        const comment = labels.length ? (body ? `${labels.join(", ")}: ${body}` : labels.join(", ")) : body;
        setError(null);
        setPhase("sending");
        const result = await submitReview({
            supabaseUrl: review.supabaseUrl,
            activityId: review.activityId,
            sessionId: review.sessionId,
            rating,
            comment,
            website
        });
        if (!result.ok) {
            setError(result.message);
            setPhase("form");
            return;
        }
        sent.current = { rating, comment: body };
        setPhase("thanks");
        onSubmitted();
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(sent.current.comment);
            setCopied(true);
        } catch {
            /* niente appunti (contesto non sicuro): il testo resta da riscrivere */
        }
    };

    if (alreadyReviewed || phase === "thanks") {
        const lowOrOld = alreadyReviewed || !high;
        return (
            <div className={styles.body}>
                <div className={styles.thanks} role="status">
                    <span className={styles.check} aria-hidden="true">
                        <Check size={26} strokeWidth={2.6} />
                    </span>
                    <h2 className={styles.thanksTitle}>
                        {alreadyReviewed ? t("reviews.thanks_title") : lowOrOld ? t("vote.thanks_low") : t("vote.thanks_high")}
                    </h2>
                    <p className={styles.thanksText}>
                        {alreadyReviewed
                            ? t("reviews.already_reviewed_subtitle")
                            : lowOrOld
                              ? t("vote.thanks_low_text", { name: venueName })
                              : t("vote.thanks_high_text", { name: venueName })}
                    </p>
                    {showGoogle && google && (
                        <div className={styles.share} role="group" aria-label={t("vote.share_title")}>
                            <p className={styles.shareTitle}>{t("vote.share_title")}</p>
                            <p className={styles.shareText}>{t("vote.share_text", { name: venueName })}</p>
                            <a
                                href={google}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.platform}
                                aria-label={t("vote.google_aria")}
                                onClick={() =>
                                    trackEvent(review.activityId, "review_google_redirect", { rating: sent.current.rating })
                                }
                            >
                                <span className={styles.platformName}>
                                    Google
                                    <small>{t("vote.google_hint")}</small>
                                </span>
                                <span aria-hidden="true">↗</span>
                            </a>
                            {sent.current.comment && (
                                <>
                                    <button type="button" className={styles.copy} onClick={copy}>
                                        <Copy size={17} strokeWidth={1.9} aria-hidden />
                                        {copied ? t("vote.copied") : t("vote.copy")}
                                    </button>
                                    <p className={styles.copyHint}>{t("vote.copy_hint")}</p>
                                </>
                            )}
                        </div>
                    )}
                    {(lowOrOld || !google || showGoogle) && (
                        <button type="button" className={styles.later} onClick={closeSheet}>
                            {showGoogle ? t("vote.later") : t("vote.close")}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.body}>
            <VoteHead
                titleId="pub-vote-form-title"
                logoUrl={logoUrl}
                venueName={venueName}
                subtitle={
                    rating
                        ? t("vote.summary", { label: t(`vote.labels.${rating}`), count: rating })
                        : t("vote.helps", { name: venueName })
                }
                rating={rating}
                onRate={setRating}
            />
            {rating > 0 && (
                <div className={styles.more}>
                    <div className={styles.topics} role="group" aria-label={t("vote.topics_aria")}>
                        {TOPICS.map(topic => {
                            const on = topics.includes(topic);
                            return (
                                <button
                                    key={topic}
                                    type="button"
                                    className={styles.topic}
                                    aria-pressed={on}
                                    onClick={() =>
                                        setTopics(list => (on ? list.filter(x => x !== topic) : [...list, topic]))
                                    }
                                >
                                    {t(`vote.topics.${topic}`)}
                                </button>
                            );
                        })}
                    </div>
                    <textarea
                        className={styles.text}
                        value={text}
                        onChange={event => setText(event.target.value)}
                        placeholder={t("vote.comment_placeholder")}
                        aria-label={t("vote.comment_aria")}
                        maxLength={MAX_COMMENT}
                        rows={3}
                    />
                    <input
                        className={styles.trap}
                        type="text"
                        name="website"
                        value={website}
                        onChange={event => setWebsite(event.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                    />
                    <p className={styles.privacy}>
                        {t("reviews.personal_data_hint")} {t("reviews.privacy_disclaimer_prefix")}
                        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                            {t("reviews.privacy_disclaimer_link")}
                        </a>
                        {t("reviews.privacy_disclaimer_suffix")}
                    </p>
                    {error && (
                        <p className={styles.error} role="alert">
                            {error}
                        </p>
                    )}
                    <button type="button" className={styles.send} onClick={send} disabled={phase === "sending"}>
                        {phase === "sending" ? t("reviews.submitting") : t("vote.send")}
                    </button>
                </div>
            )}
        </div>
    );
}
