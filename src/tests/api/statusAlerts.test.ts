import { describe, it, expect } from "vitest";
import { decideAlertWithHysteresis } from "../../../api/_lib/statusAlerts";
import type {
    CheckResult,
    CheckStatus,
    ServiceKey
} from "../../../api/_lib/statusServices";
import type { ServiceStateRow } from "../../../api/_lib/statusAlerts";

const SVC: ServiceKey = "public-menu";

function check(status: CheckStatus): CheckResult {
    return { serviceKey: SVC, status, responseTimeMs: 100, error: null };
}

function state(lastNotified: CheckStatus | null): ServiceStateRow | null {
    if (lastNotified === null) return null;
    return {
        service_key: SVC,
        last_status: lastNotified,
        last_status_changed_at: "2026-01-01T00:00:00Z",
        last_notified_status: lastNotified,
        last_notified_at: "2026-01-01T00:00:00Z",
        last_check_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
    };
}

describe("decideAlertWithHysteresis", () => {
    it("bootstrap: 1° check ever (no prev obs) → silent in qualsiasi stato", () => {
        expect(
            decideAlertWithHysteresis(check("down"), null, null).shouldNotify
        ).toBe(false);
        expect(
            decideAlertWithHysteresis(check("up"), null, null).shouldNotify
        ).toBe(false);
        expect(
            decideAlertWithHysteresis(check("degraded"), null, null).shouldNotify
        ).toBe(false);
    });

    it("blip isolato up→down→up: zero email", () => {
        // step 1: prevObs=up, cur=down, prevNotified=null
        expect(
            decideAlertWithHysteresis(check("down"), null, "up").shouldNotify
        ).toBe(false);
        // step 2: prevObs=down, cur=up, prevNotified=null
        // confirmedClear richiede prevNotified=='down', che qui è null.
        expect(
            decideAlertWithHysteresis(check("up"), null, "down").shouldNotify
        ).toBe(false);
    });

    it("flapping alternato up↔down (prevNotified mai avanza): zero email", () => {
        const seq: Array<[CheckStatus, CheckStatus]> = [
            ["up", "down"],
            ["down", "up"],
            ["up", "down"],
            ["down", "up"],
            ["up", "down"]
        ];
        for (const [prev, cur] of seq) {
            expect(
                decideAlertWithHysteresis(check(cur), null, prev).shouldNotify
            ).toBe(false);
        }
    });

    it("down sostenuto: email alla 2ª consecutiva, silent dopo", () => {
        // 1ª: prevObs=up, cur=down, prevNotified=null → no
        expect(
            decideAlertWithHysteresis(check("down"), null, "up").shouldNotify
        ).toBe(false);
        // 2ª: prevObs=down, cur=down, prevNotified=null → ENTRY
        const entry = decideAlertWithHysteresis(check("down"), null, "down");
        expect(entry.shouldNotify).toBe(true);
        expect(entry.currentStatus).toBe("down");
        expect(entry.previousNotifiedStatus).toBe(null);
        // 3ª: prevObs=down, cur=down, prevNotified=down → no (già notificato)
        expect(
            decideAlertWithHysteresis(check("down"), state("down"), "down")
                .shouldNotify
        ).toBe(false);
    });

    it("recovery sostenuto: email dopo 2 non-down consecutivi", () => {
        // cur=up, prevObs=down, prevNotified=down → confirmedClear=false, no email
        expect(
            decideAlertWithHysteresis(check("up"), state("down"), "down")
                .shouldNotify
        ).toBe(false);
        // cur=up, prevObs=up, prevNotified=down → recovery confirmed
        const recUp = decideAlertWithHysteresis(check("up"), state("down"), "up");
        expect(recUp.shouldNotify).toBe(true);
        expect(recUp.currentStatus).toBe("up");
        // degraded conta come "clear" (≠ down)
        const recDeg = decideAlertWithHysteresis(
            check("degraded"),
            state("down"),
            "degraded"
        );
        expect(recDeg.shouldNotify).toBe(true);
    });

    it("up↔degraded: silent in entrambe le direzioni e in qualsiasi prevNotified", () => {
        expect(
            decideAlertWithHysteresis(check("degraded"), state("up"), "up")
                .shouldNotify
        ).toBe(false);
        expect(
            decideAlertWithHysteresis(check("up"), state("degraded"), "degraded")
                .shouldNotify
        ).toBe(false);
        expect(
            decideAlertWithHysteresis(check("degraded"), null, "up").shouldNotify
        ).toBe(false);
        expect(
            decideAlertWithHysteresis(check("up"), null, "degraded").shouldNotify
        ).toBe(false);
    });

    it("recovery non confermata se rimbalza down→up→down: nessun alert spurio", () => {
        // Già notified=down. Singolo up isolato, poi torna down.
        // up isolato (prevObs=down) → no recovery (confirmedClear false).
        expect(
            decideAlertWithHysteresis(check("up"), state("down"), "down")
                .shouldNotify
        ).toBe(false);
        // ritorno a down: prevNotified=='down' AND prevObs=='up' → confirmedDown false.
        // Branch entry richiede prevNotified !== 'down': qui prevNotified='down' → skip.
        expect(
            decideAlertWithHysteresis(check("down"), state("down"), "up")
                .shouldNotify
        ).toBe(false);
    });

    it("decision carries serviceKey + currentStatus + previousNotifiedStatus", () => {
        const d = decideAlertWithHysteresis(check("down"), state("up"), "down");
        expect(d.serviceKey).toBe(SVC);
        expect(d.currentStatus).toBe("down");
        expect(d.previousNotifiedStatus).toBe("up");
    });
});
