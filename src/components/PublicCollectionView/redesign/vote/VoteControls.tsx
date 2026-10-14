import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Star, X } from "lucide-react";
import { VoteHead } from "./VoteHead";
import { loadVoteForm } from "./loadVoteForm";
import { hasOpenSheet } from "../../hooks/openSheets";
import { INVITE_IGNORE_MS, WIDE_MS, fitsWide, type VoteEvent, type VoteState } from "./voteInvite";
import styles from "./VoteControls.module.scss";

/** Volo dalla modale alla barra e uscita: solo transform e opacity, su WAAPI. */
const FLIGHT_MS = 460;
const LEAVE_MS = 220;
/** Tirata giù oltre questa distanza: l'invito va nella barra. */
const PULL_DOWN_PX = 36;
/** Il largo si stringe allo scorrimento solo dopo l'atterraggio e con uno spostamento vero. */
const SHRINK_GRACE_MS = 600;
const SHRINK_SCROLL_PX = 24;

/** Dove stava la modale quando è partita verso la barra (per il volo). */
export type FlightOrigin = { left: number; top: number; width: number; height: number };

function reducedMotion(): boolean {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * La modale piccola dell'invito (spec §11, mockup v38): nella geometria dei
 * fogli, attaccata al fondo, senza velo e senza blocco della pagina; la barra
 * scende finché c'è. × = «no grazie»; ignorata, tocco fuori o tirata giù = vola
 * nella barra; una stella = la modale cresce nel modulo (il foglio entra già alto
 * quanto lei, con la stessa testata).
 */
export function VoteInviteCard({
    send,
    onRate,
    onLeave,
    logoUrl,
    venueName
}: {
    send: (event: VoteEvent) => void;
    /** Una stella: il voto e l'altezza della modale, da cui il modulo cresce. */
    onRate: (rating: number, height: number) => void;
    /** Prima di andare nella barra: dove stava, per il volo. */
    onLeave: (origin: FlightOrigin) => void;
    logoUrl: string | null;
    venueName: string;
}) {
    const { t } = useTranslation("public");
    const cardRef = useRef<HTMLElement>(null);
    const done = useRef(false);
    // La stella toccata si accende subito, mentre il modulo arriva.
    const [picked, setPicked] = useState(0);

    useEffect(() => {
        void loadVoteForm();
    }, []);

    useEffect(() => {
        const card = cardRef.current;
        if (!card) return;
        const park = () => {
            if (done.current) return;
            done.current = true;
            const rect = card.getBoundingClientRect();
            onLeave({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
            send({ type: "ignore" });
        };
        const timer = window.setTimeout(park, INVITE_IGNORE_MS);
        const outside = (event: PointerEvent) => {
            if (!card.contains(event.target as Node)) park();
        };
        // Tirata giù: si segue il dito solo per decidere, la modale non si trascina.
        let startY: number | null = null;
        const down = (event: PointerEvent) => {
            startY = event.clientY;
        };
        const move = (event: PointerEvent) => {
            if (startY !== null && event.clientY - startY > PULL_DOWN_PX) park();
        };
        const up = () => {
            startY = null;
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === "Escape") park();
        };
        document.addEventListener("keydown", key);
        document.addEventListener("pointerdown", outside, true);
        card.addEventListener("pointerdown", down);
        card.addEventListener("pointermove", move);
        card.addEventListener("pointerup", up);
        card.addEventListener("pointercancel", up);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("keydown", key);
            card.removeEventListener("pointerdown", down);
            card.removeEventListener("pointermove", move);
            card.removeEventListener("pointerup", up);
            card.removeEventListener("pointercancel", up);
        };
    }, [send, onLeave]);

    // × : esce come è entrata, poi non torna.
    const dismiss = () => {
        if (done.current) return;
        done.current = true;
        const card = cardRef.current;
        if (!card || typeof card.animate !== "function" || reducedMotion()) {
            send({ type: "dismiss" });
            return;
        }
        const exit = card.animate(
            [
                { transform: "translateY(0)" },
                { transform: "translateY(100%)" }
            ],
            { duration: LEAVE_MS, easing: "ease-in", fill: "forwards" }
        );
        exit.onfinish = () => send({ type: "dismiss" });
    };

    const rate = (value: number) => {
        if (done.current) return;
        done.current = true;
        setPicked(value);
        send({ type: "rate" });
        onRate(value, cardRef.current?.offsetHeight ?? 0);
    };

    return (
        // Non è una finestra modale: niente fuoco rubato a chi sta leggendo, una regione col suo titolo.
        <section ref={cardRef} className={styles.card} role="region" aria-labelledby="pub-vote-title">
            <span className={styles.handle} aria-hidden="true" />
            <button type="button" className={styles.close} aria-label={t("vote.dismiss_aria")} onClick={dismiss}>
                <X size={18} strokeWidth={2.25} aria-hidden />
            </button>
            <div className={styles.body}>
                <VoteHead
                    titleId="pub-vote-title"
                    logoUrl={logoUrl}
                    venueName={venueName}
                    subtitle={t("vote.helps", { name: venueName })}
                    rating={picked}
                    onRate={rate}
                />
            </div>
        </section>
    );
}

/**
 * Il pulsante del voto nella barra: largo «Com'è andata? ★» quando arriva, poi
 * «★ Vota». Arriva volando dalla modale (FLIP su WAAPI); toccato, torna la
 * modale piccola (mockup v38). Materiale pieno, mai sfocato: si muove.
 */
export function VoteButton({
    state,
    send,
    flightFrom,
    onLanded
}: {
    state: VoteState;
    send: (event: VoteEvent) => void;
    flightFrom: FlightOrigin | null;
    onLanded: () => void;
}) {
    const { t } = useTranslation("public");
    const ref = useRef<HTMLButtonElement>(null);
    const shown = state.phase === "parked";
    const wide = state.phase === "parked" && state.wide;

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !flightFrom) return;
        onLanded();
        if (typeof el.animate !== "function" || reducedMotion()) return;
        const to = el.getBoundingClientRect();
        const dx = flightFrom.left - to.left;
        const dy = flightFrom.top - to.top;
        const sx = flightFrom.width / Math.max(1, to.width);
        const sy = flightFrom.height / Math.max(1, to.height);
        el.animate(
            [
                { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.4 },
                { transformOrigin: "0 0", transform: "none", opacity: 1 }
            ],
            { duration: FLIGHT_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
        );
    }, [flightFrom, onLanded]);

    // Il largo non ci sta accanto a capsula e ordine: si stringe subito. Si sommano
    // le larghezze piene dei pezzi: la capsula può stringersi invece di sforare.
    useLayoutEffect(() => {
        const bar = ref.current?.parentElement;
        if (!wide || !bar) return;
        const parts = Array.from(bar.children) as HTMLElement[];
        const gap = parseFloat(getComputedStyle(bar).columnGap) || 0;
        const total = parts.reduce((sum, part) => sum + part.scrollWidth, 0) + gap * Math.max(0, parts.length - 1);
        if (!fitsWide(total, window.innerWidth)) send({ type: "shrink" });
    }, [wide, send]);

    // Largo: si stringe da solo dopo poco, o scorrendo davvero (non al primo
    // evento, non per lo scroll del blocco di un foglio).
    useEffect(() => {
        if (!wide) return;
        const timer = window.setTimeout(() => send({ type: "shrink" }), WIDE_MS);
        const since = performance.now();
        const fromY = window.scrollY;
        const onScroll = () => {
            if (hasOpenSheet() || performance.now() - since < SHRINK_GRACE_MS) return;
            if (Math.abs(window.scrollY - fromY) > SHRINK_SCROLL_PX) send({ type: "shrink" });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("scroll", onScroll);
        };
    }, [wide, send]);

    if (!shown) return null;
    return (
        <button
            ref={ref}
            type="button"
            className={styles.vote}
            data-wide={wide || undefined}
            onClick={() => send({ type: "reopen" })}
        >
            {wide ? (
                <>
                    <span className={styles.label}>{t("page_end.rate_title")}</span>
                    <Star size={18} strokeWidth={2} aria-hidden />
                </>
            ) : (
                <>
                    <Star size={18} strokeWidth={2} aria-hidden />
                    <span className={styles.label}>{t("vote.button")}</span>
                </>
            )}
        </button>
    );
}
