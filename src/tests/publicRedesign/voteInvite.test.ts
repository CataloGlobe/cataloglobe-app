import { describe, expect, it } from "vitest";
import {
    INITIAL_VOTE,
    REVIEW_MEMORY_MS,
    TOP_ZONE_PX,
    fitsWide,
    isTopReturn,
    persistedVote,
    restoreVote,
    reviewedRecently,
    voteReducer,
    type VoteEvent,
    type VoteState
} from "@components/PublicCollectionView/redesign/vote/voteInvite";
import { RATE_PREFIX, rateOf } from "@components/PublicCollectionView/redesign/vote/rateSheet";

const run = (events: VoteEvent[], from: VoteState = INITIAL_VOTE) => events.reduce(voteReducer, from);
const moment = (canInvite = true): VoteEvent => ({ type: "moment", canInvite });

describe("voteReducer", () => {
    it("il primo momento utile apre l'invito", () => {
        expect(run([moment()])).toEqual({ phase: "invite", wide: false, attempts: 1 });
    });

    it("un momento con un foglio aperto si perde, il prossimo conta", () => {
        expect(run([moment(false)])).toEqual(INITIAL_VOTE);
        expect(run([moment(false), moment()]).phase).toBe("invite");
    });

    it("× è «no grazie»: non torna per la visita, nemmeno con altri momenti", () => {
        const state = run([moment(), { type: "dismiss" }, moment(), moment()]);
        expect(state.phase).toBe("gone");
    });

    it("ignorata vola nella barra largo, poi si stringe", () => {
        const parked = run([moment(), { type: "ignore" }]);
        expect(parked).toMatchObject({ phase: "parked", wide: true });
        expect(voteReducer(parked, { type: "shrink" })).toMatchObject({ phase: "parked", wide: false });
    });

    it("una stella fa crescere il modulo; chiuso senza voto è «no grazie»", () => {
        const rating = run([moment(), { type: "rate" }]);
        expect(rating.phase).toBe("rating");
        expect(voteReducer(rating, { type: "formClosed" })).toMatchObject({ phase: "gone" });
    });

    it("il pulsante della barra riapre la modale; ignorata di nuovo torna stretto", () => {
        const state = run([moment(), { type: "ignore" }, { type: "reopen" }]);
        expect(state).toMatchObject({ phase: "invite", again: true });
        expect(voteReducer(state, { type: "ignore" })).toMatchObject({ phase: "parked", wide: false });
        expect(voteReducer(state, { type: "dismiss" })).toMatchObject({ phase: "gone" });
    });

    it("al massimo un secondo tentativo: riallarga il pulsante una volta sola", () => {
        const parked = run([moment(), { type: "ignore" }, { type: "shrink" }]);
        const second = voteReducer(parked, moment());
        expect(second).toMatchObject({ phase: "parked", wide: true, attempts: 2 });
        const third = run([{ type: "shrink" }, moment()], second);
        expect(third).toMatchObject({ wide: false, attempts: 2 });
    });

    it("il secondo tentativo non si spreca con un foglio aperto", () => {
        const parked = run([moment(), { type: "ignore" }, { type: "shrink" }]);
        expect(voteReducer(parked, moment(false))).toBe(parked);
    });

    it("il voto (anche dal fondo) chiude tutto, da qualunque fase", () => {
        for (const from of [INITIAL_VOTE, run([moment()]), run([moment(), { type: "ignore" }]), run([moment(), { type: "rate" }])]) {
            expect(voteReducer(from, { type: "voted" }).phase).toBe("gone");
        }
    });

    it("lo stato riletto vale solo all'inizio", () => {
        const restored: VoteState = { phase: "parked", wide: false, attempts: 1 };
        expect(voteReducer(INITIAL_VOTE, { type: "restore", state: restored })).toEqual(restored);
        const invite = run([moment()]);
        expect(voteReducer(invite, { type: "restore", state: restored })).toBe(invite);
    });
});

describe("persistenza della visita", () => {
    it("modale, modulo e barra tornano come pulsante stretto, mai come modale", () => {
        expect(persistedVote(run([moment()]))).toEqual({ phase: "parked", wide: false, attempts: 1 });
        expect(persistedVote(run([moment(), { type: "rate" }]))?.phase).toBe("parked");
        expect(persistedVote(run([moment(), { type: "dismiss" }]))?.phase).toBe("gone");
        expect(persistedVote(INITIAL_VOTE)).toBeNull();
    });

    it("rilegge solo valori validi", () => {
        expect(restoreVote(null)).toEqual(INITIAL_VOTE);
        expect(restoreVote("{rotto")).toEqual(INITIAL_VOTE);
        expect(restoreVote(JSON.stringify({ phase: "invite", attempts: 1 }))).toEqual(INITIAL_VOTE);
        expect(restoreVote(JSON.stringify({ phase: "parked", wide: true, attempts: 9 }))).toEqual({
            phase: "parked",
            wide: false,
            attempts: 2
        });
        expect(restoreVote(JSON.stringify({ phase: "gone" }))).toEqual({ phase: "gone", wide: false, attempts: 1 });
    });
});

describe("regole di contorno", () => {
    it("un voto vale 24 ore", () => {
        const now = 1_000_000_000_000;
        expect(reviewedRecently(null, now)).toBe(false);
        expect(reviewedRecently("abc", now)).toBe(false);
        expect(reviewedRecently(String(now - REVIEW_MEMORY_MS + 1), now)).toBe(true);
        expect(reviewedRecently(String(now - REVIEW_MEMORY_MS), now)).toBe(false);
    });

    it("tornare in cima conta solo dopo essere scesi di una schermata", () => {
        expect(isTopReturn(300, 0, 800)).toBe(false);
        expect(isTopReturn(1200, TOP_ZONE_PX, 800)).toBe(true);
        expect(isTopReturn(1200, TOP_ZONE_PX + 1, 800)).toBe(false);
    });

    it("il pulsante largo ci sta solo se la barra intera entra con i margini", () => {
        expect(fitsWide(366, 390)).toBe(true);
        expect(fitsWide(367, 390)).toBe(false);
    });

    it("la pagina del voto porta il voto nella chiave", () => {
        const page = (key: string) => ({ key, title: "", size: "large" as const });
        expect(rateOf(page(`${RATE_PREFIX}4`))).toBe(4);
        expect(rateOf(page(`${RATE_PREFIX}0`))).toBe(0);
        expect(rateOf(page(`${RATE_PREFIX}9`))).toBeUndefined();
        expect(rateOf(page("order"))).toBeUndefined();
    });
});
