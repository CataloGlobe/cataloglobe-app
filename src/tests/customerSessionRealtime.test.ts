import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { V2CustomerSession } from "@/types/orders";

// Regressione del fix «keep table session on transient realtime channel
// errors»: un CHANNEL_ERROR/TIMED_OUT, anche con un messaggio da auth
// (token/jwt), NON deve cancellare la sessione del tavolo.

type SubscribeCb = (status: string, err?: Error) => void;
let subscribeCb: SubscribeCb | null = null;
const setAuth = vi.fn();

vi.mock("@/services/supabase/client", () => {
    const channel = {
        on: () => channel,
        subscribe: (cb: SubscribeCb) => {
            subscribeCb = cb;
            return channel;
        },
        unsubscribe: vi.fn()
    };
    return {
        supabase: {
            realtime: { setAuth: (...a: unknown[]) => setAuth(...a) },
            channel: () => channel
        }
    };
});

import { subscribeToCustomerSession } from "@/services/supabase/customerSessions";
import { createCustomerSessionRealtimeHandlers } from "@/components/PublicCollectionView/CollectionView/customerSessionRealtime";

const ACTIVITY_ID = "act-1";
const KEY = `cataloglobe-customer-${ACTIVITY_ID}`;
const BLOB = JSON.stringify({ jwt: "jwt-1", expiresAt: "2099-01-01T00:00:00Z", sessionId: "s1", activityId: ACTIVITY_ID });

function makeStorage() {
    const data = new Map<string, string>();
    return {
        getItem: vi.fn((k: string) => data.get(k) ?? null),
        setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
        removeItem: vi.fn((k: string) => void data.delete(k)),
        clear: vi.fn(() => data.clear()),
        key: vi.fn(),
        get length() {
            return data.size;
        }
    };
}

function makeDeps() {
    return {
        setBillRequestedAt: vi.fn(),
        setWaiterCalledAt: vi.fn(),
        setDiscoveredMaintenance: vi.fn(),
        serviceEndedMessage: () => "Servizio terminato",
        now: () => new Date("2026-10-09T20:00:00Z").getTime(),
        warn: vi.fn()
    };
}

const AUTH_FLAVORED_ERRORS = [
    new Error("JWT expired"),
    new Error("invalid token"),
    new Error("Unauthorized: auth session missing"),
    new Error("Realtime channel error: CHANNEL_ERROR"),
    new Error("Realtime channel error: TIMED_OUT")
];

describe("realtime customer_sessions: onError non cancella la sessione del tavolo", () => {
    let storage: ReturnType<typeof makeStorage>;

    beforeEach(() => {
        storage = makeStorage();
        storage.setItem(KEY, BLOB);
        storage.setItem.mockClear();
        vi.stubGlobal("sessionStorage", storage);
        vi.stubGlobal("window", { sessionStorage: storage });
        subscribeCb = null;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each(AUTH_FLAVORED_ERRORS.map(e => [e.message, e] as const))(
        "onError(%s): sessione e stato intatti",
        (_msg, err) => {
            const deps = makeDeps();
            createCustomerSessionRealtimeHandlers(deps).onError(err);

            expect(storage.getItem(KEY)).toBe(BLOB);
            expect(storage.removeItem).not.toHaveBeenCalled();
            expect(storage.clear).not.toHaveBeenCalled();
            expect(storage.setItem).not.toHaveBeenCalled();
            expect(deps.setBillRequestedAt).not.toHaveBeenCalled();
            expect(deps.setWaiterCalledAt).not.toHaveBeenCalled();
            expect(deps.setDiscoveredMaintenance).not.toHaveBeenCalled();
            expect(deps.warn).toHaveBeenCalledTimes(1);
        }
    );

    it.each(["CHANNEL_ERROR", "TIMED_OUT"])(
        "dal canale vero: %s con errore auth arriva a onError e la sessione resta",
        status => {
            const deps = makeDeps();
            const handlers = createCustomerSessionRealtimeHandlers(deps);
            const onError = vi.spyOn(handlers, "onError");

            const channel = subscribeToCustomerSession("jwt-1", handlers);
            expect(channel).not.toBeNull();
            expect(subscribeCb).not.toBeNull();

            subscribeCb!(status, new Error("JWT expired"));

            expect(onError).toHaveBeenCalledTimes(1);
            expect(storage.getItem(KEY)).toBe(BLOB);
            expect(storage.removeItem).not.toHaveBeenCalled();
            expect(storage.clear).not.toHaveBeenCalled();
            expect(deps.setDiscoveredMaintenance).not.toHaveBeenCalled();
        }
    );

    it("SUBSCRIBED e CLOSED non chiamano onError", () => {
        const deps = makeDeps();
        subscribeToCustomerSession("jwt-1", createCustomerSessionRealtimeHandlers(deps));
        subscribeCb!("SUBSCRIBED");
        subscribeCb!("CLOSED");
        expect(deps.warn).not.toHaveBeenCalled();
    });
});

describe("realtime customer_sessions: onUpdate", () => {
    const base = {
        bill_requested_at: "2026-10-09T19:00:00Z",
        waiter_called_at: null,
        expires_at: "2026-10-09T23:00:00Z"
    } as unknown as V2CustomerSession;

    it("propaga conto e cameriere, nessuna chiusura se la sessione non è scaduta", () => {
        const deps = makeDeps();
        createCustomerSessionRealtimeHandlers(deps).onUpdate(base);
        expect(deps.setBillRequestedAt).toHaveBeenCalledWith("2026-10-09T19:00:00Z");
        expect(deps.setWaiterCalledAt).toHaveBeenCalledWith(null);
        expect(deps.setDiscoveredMaintenance).not.toHaveBeenCalled();
    });

    it("expires_at passato → table_closed, senza sovrascrivere un maintenance già attivo", () => {
        const deps = makeDeps();
        createCustomerSessionRealtimeHandlers(deps).onUpdate({ ...base, expires_at: "2026-10-09T19:59:00Z" });
        const update = deps.setDiscoveredMaintenance.mock.calls[0][0];
        expect(update(null)).toEqual({ reason: "table_closed", message: "Servizio terminato" });
        const existing = { reason: "table_maintenance" as const, message: "x" };
        expect(update(existing)).toBe(existing);
    });
});

describe("guardia sul sorgente", () => {
    const root = path.resolve(__dirname, "..", "components/PublicCollectionView/CollectionView");

    it("CollectionView usa i callback estratti (niente onError inline)", () => {
        const src = readFileSync(path.join(root, "CollectionView.tsx"), "utf8");
        expect(src).toContain("createCustomerSessionRealtimeHandlers(");
        expect(src).not.toMatch(/subscribeToCustomerSession\(jwt,\s*\{/);
    });

    it("i callback non toccano lo storage della sessione", () => {
        const code = readFileSync(path.join(root, "customerSessionRealtime.ts"), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
        expect(code).not.toMatch(/sessionStorage|clearCustomerSession|removeItem/);
    });
});
