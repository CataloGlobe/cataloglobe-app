import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ReceiptText, ScrollText, Utensils } from "lucide-react";
import type { HubTab } from "@/types/collectionStyle";
import type { BottomBarSlotContext } from "../slots";
import { useVoteInvite } from "../vote/useVoteInvite";
import type { FlightOrigin } from "../vote/VoteControls";
import styles from "./BottomBar.module.scss";

// Modale e pulsante del voto nel loro chunk: arrivano solo dopo un momento della visita.
const loadVote = () => import("../vote/VoteControls");
const VoteInviteCard = lazy(() => loadVote().then(m => ({ default: m.VoteInviteCard })));
const VoteButton = lazy(() => loadVote().then(m => ({ default: m.VoteButton })));

const VOCI: { id: HubTab; icon: ReactNode; labelKey: string }[] = [
    { id: "menu", icon: <Utensils size={19} strokeWidth={1.9} />, labelKey: "hub.menu" },
    { id: "storia", icon: <ScrollText size={19} strokeWidth={1.9} />, labelKey: "hub.storia" }
];

/**
 * Barra in basso del redesign, solo telefono (≤640 px, via CSS). Capsula Menu/Storia
 * (solo con almeno due pagine) e cerchio dell'ordine (solo con gli ordini al tavolo),
 * staccati. La voce attiva porta icona e nome, le altre solo l'icona; il numero
 * dell'ordine sta accanto all'icona. Il voto non è una voce: arriva come invito e
 * vola qui accanto al cerchio dell'ordine (spec §11, `vote/`). Nascondi/mostra lo
 * decide `useBottomBarAutoHide` (prop `hidden`).
 *
 * Materiale pieno semitrasparente, senza blur, come l'isola: la barra trasla quando
 * si nasconde e su WebKit un blur su un elemento che trasla si ridisegna a ogni
 * fotogramma; accenderlo e spegnerlo ai capi del passaggio (il materiale ibrido di
 * prima) faceva lo scatto. Nascondi/mostra non fa render: solo `data-hidden`.
 */
export default function BottomBar({
    activeTab,
    onTabChange,
    showStoryTab,
    orderVisible,
    selectionCount,
    onOpenOrder,
    hidden,
    vote
}: BottomBarSlotContext) {
    const { t } = useTranslation("public");
    const wrapRef = useRef<HTMLDivElement>(null);
    const gruppoRef = useRef<HTMLDivElement>(null);
    const vociRef = useRef<Partial<Record<HubTab, HTMLButtonElement | null>>>({});
    const [indicatore, setIndicatore] = useState({ left: 0, width: 0 });
    const { state: voteState, send: sendVote } = useVoteInvite(vote);
    const [flightFrom, setFlightFrom] = useState<FlightOrigin | null>(null);
    const landed = useCallback(() => setFlightFrom(null), []);
    const rateFromInvite = useCallback((rating: number) => vote?.onRate(rating), [vote]);

    // Altezza reale → `--pub-bottombar-h` su `main.page`: da qui parte lo spazio in fondo
    // (`--pub-bottom-clearance`, scrim, toast). Non cambia quando la barra si nasconde.
    useEffect(() => {
        const wrap = wrapRef.current;
        const host = wrap?.parentElement;
        if (!wrap || !host || typeof ResizeObserver === "undefined") return;
        const scrivi = () => {
            const h = wrap.offsetHeight;
            if (h > 0) host.style.setProperty("--pub-bottombar-h", `${h}px`);
            else host.style.removeProperty("--pub-bottombar-h");
        };
        scrivi();
        const ro = new ResizeObserver(scrivi);
        ro.observe(wrap);
        return () => {
            ro.disconnect();
            host.style.removeProperty("--pub-bottombar-h");
        };
    }, []);

    // Il fondo morbido scorre tra le voci (transform, la larghezza è di una foglia): si misura la voce attiva.
    const misura = () => {
        const btn = vociRef.current[activeTab];
        if (btn) setIndicatore({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    useLayoutEffect(() => {
        misura();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, showStoryTab]);
    useEffect(() => {
        const gruppo = gruppoRef.current;
        if (!gruppo || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(misura);
        ro.observe(gruppo);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, showStoryTab]);

    // L'invito arriva o vola qui: la barra si deve vedere.
    const revealRef = useRef(vote?.reveal);
    revealRef.current = vote?.reveal;
    const voteWide = voteState.phase === "parked" && voteState.wide;
    useEffect(() => {
        if (voteState.phase === "invite" || voteWide) revealRef.current?.();
    }, [voteState.phase, voteWide]);

    return (
        <>
            {vote && voteState.phase === "invite" && (
                <Suspense fallback={null}>
                    <VoteInviteCard send={sendVote} onRate={rateFromInvite} onLeave={setFlightFrom} />
                </Suspense>
            )}
            <div
                ref={wrapRef}
                className={styles.wrap}
                data-hidden={hidden ? "true" : undefined}
                inert={hidden}
                aria-hidden={hidden ? true : undefined}
            >
                {showStoryTab && (
                    <nav className={styles.capsula} aria-label={t("nav.bottom_aria")}>
                        <div className={styles.gruppo} ref={gruppoRef}>
                            <span
                                className={styles.fondo}
                                style={{ width: indicatore.width, transform: `translateX(${indicatore.left}px)` }}
                                aria-hidden="true"
                            />
                            {VOCI.map(voce => {
                                const attiva = activeTab === voce.id;
                                return (
                                    <button
                                        key={voce.id}
                                        ref={el => {
                                            vociRef.current[voce.id] = el;
                                        }}
                                        type="button"
                                        className={styles.voce}
                                        data-active={attiva || undefined}
                                        // Menu già attivo: toccarlo di nuovo apre le categorie (spec §4).
                                        aria-label={t(attiva && voce.id === "menu" ? "hub.menu_retap_aria" : voce.labelKey)}
                                        aria-current={attiva ? "page" : undefined}
                                        onClick={() => onTabChange(voce.id)}
                                    >
                                        {voce.icon}
                                        {attiva && <span className={styles.nome}>{t(voce.labelKey)}</span>}
                                        {/* Il piccolo ⌃ dice che il Menu attivo apre «Categorie» (mockup v32). */}
                                        {attiva && voce.id === "menu" && (
                                            <ChevronUp size={14} strokeWidth={2.25} className={styles.categorie} aria-hidden />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </nav>
                )}

                {vote && (voteState.phase === "parked" || voteState.phase === "rating") && (
                    <Suspense fallback={null}>
                        <VoteButton
                            state={voteState}
                            send={sendVote}
                            onRate={() => vote.onRate()}
                            flightFrom={flightFrom}
                            onLanded={landed}
                        />
                    </Suspense>
                )}

                {orderVisible && (
                    <button
                        type="button"
                        className={styles.ordine}
                        aria-label={
                            selectionCount > 0 ? t("fab.cart_aria_count", { count: selectionCount }) : t("fab.cart_aria")
                        }
                        onClick={onOpenOrder}
                    >
                        <ReceiptText size={22} strokeWidth={1.9} />
                        {selectionCount > 0 && (
                            <span className={styles.conto} aria-hidden="true">
                                {selectionCount}
                            </span>
                        )}
                    </button>
                )}
            </div>
        </>
    );
}
