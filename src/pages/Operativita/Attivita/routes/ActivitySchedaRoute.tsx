import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/context/Toast/ToastContext";
import { usePlanFeatures } from "@/lib/planFeatures";
import { updateActivity, updateActivityHoursPublic, updateActivityOrderingEnabled } from "@/services/supabase/activities";
import {
    createActivityClosure,
    deleteActivityClosure,
    listActivityClosures
} from "@/services/supabase/activityClosures";
import { fetchPrintersStatus, listPrinters } from "@/services/supabase/printers";
import type { V2ActivityClosure } from "@/types/activity-closures";
import type { Printer } from "@/types/printers";
import { buildPublicUrl } from "@/utils/publicUrl";
import { getDaySlots } from "@/pages/ReservationPage/availability";
import { normalizeHours } from "../tabs/hours-services/blockTimeRange";
import { useActivityDetail } from "../ActivityDetailContext";
import type { ActivityDraftField } from "../useActivityDraft";
import { isSchedaPart, PART_FIELDS, type SchedaPart } from "../scheda/schedaCopy";
import { buildFacts, EARLY_CLOSE, isTodayOnly, makeNow, partTone, type Problem } from "../scheda/schedaModel";
import { SchedaDashboard } from "../scheda/SchedaDashboard";
import { SchedaFocus } from "../scheda/SchedaFocus";
import { ContattiEditor, ContoEditor, DoveEditor, LocaleEditor, OffriteEditor } from "../scheda/SchedaEditors";
import { scrollParent } from "../scheda/useSchedaFollow";
import ActivityOrariRoute from "./ActivityOrariRoute";
import ActivityPubblicazioneRoute from "./ActivityPubblicazioneRoute";
import ActivityOrdiniPrenotazioniRoute from "./ActivityOrdiniPrenotazioniRoute";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function urlProblem(value: string): string | null {
    try {
        const u = new URL(value);
        return u.protocol === "http:" || u.protocol === "https:" ? null : "Il sito web deve iniziare con http:// o https://.";
    } catch {
        return "Sito web: inserisci un indirizzo valido (es. https://esempio.com).";
    }
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * La Scheda della sede (Officina 3, prototipo C+++ «Scorrono insieme»,
 * scelto da Alex il 2026-10-09): un cruscotto con il telefono che scorre
 * insieme, e ogni parte a fuoco con `?parte=`. Al posto delle due pagine «Il
 * biglietto da visita» e «Come lavorate»; gli editor sono quelli di prima.
 * Il draft unico (§31.4) resta del parent: qui si legge e si scrive, e qui
 * stanno le validazioni, così valgono anche a parte chiusa.
 */
export default function ActivitySchedaRoute() {
    const { activity, tenantId, reload, hours, canManage, canManageHours, draft } = useActivityDetail();
    const { showToast } = useToast();
    /** Un errore della Scheda: un avviso che dice cosa non è riuscito. */
    const fail = useCallback((message: string) => showToast({ message, type: "error" }), [showToast]);
    const { hasFeature } = usePlanFeatures();
    const [searchParams, setSearchParams] = useSearchParams();
    const rawPart = searchParams.get("parte");
    const part: SchedaPart | null = isSchedaPart(rawPart) ? rawPart : null;
    const d = draft.draft;

    // ── Validazioni del Salva ───────────────────────────────────────────────
    useEffect(() => {
        return draft.registerValidator("scheda", () => {
            if (!(d.name ?? "").trim()) return "Il nome del locale è obbligatorio.";
            const email = (d.email_public ?? "").trim();
            if (email && !EMAIL_RE.test(email)) return "Email pubblica: inserisci un indirizzo valido.";
            const website = (d.website ?? "").trim();
            if (website) {
                const problem = urlProblem(website);
                if (problem) return problem;
            }
            return null;
        });
    }, [draft, d.name, d.email_public, d.website]);

    // ── Adesso: si rilegge ogni mezzo minuto ────────────────────────────────
    const [clock, setClock] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setClock(new Date()), 30_000);
        return () => window.clearInterval(id);
    }, []);
    const now = useMemo(() => makeNow(clock), [clock]);

    // ── Chiusure e stampanti (azioni immediate, fuori dal draft) ────────────
    const orderingLocked = !hasFeature("table_ordering");
    const reservationsLocked = !hasFeature("table_reservation");
    const [closures, setClosures] = useState<V2ActivityClosure[]>([]);
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [statuses, setStatuses] = useState<Record<string, boolean> | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);

    const loadClosures = useCallback(async () => {
        try {
            setClosures(await listActivityClosures(activity.id, tenantId));
        } catch {
            // Non critico: «Adesso» parla degli orari di sempre.
        }
    }, [activity.id, tenantId]);

    const loadPrinters = useCallback(async () => {
        if (orderingLocked) return;
        try {
            setPrinters(await listPrinters(tenantId, activity.id));
        } catch {
            // Senza permesso o senza rete: nessun avviso sulle stampanti.
        }
    }, [orderingLocked, tenantId, activity.id]);

    // Si rilegge anche tornando dal fuoco: lì le chiusure e le stampanti si
    // cambiano con gli editor di sempre.
    useEffect(() => {
        void loadClosures();
        void loadPrinters();
    }, [loadClosures, loadPrinters, part]);

    const retryPrinters = useCallback(async () => {
        setIsRetrying(true);
        try {
            const result = await fetchPrintersStatus(tenantId, activity.id);
            if (!result.available) {
                showToast({ message: "Lo stato delle stampanti non si legge adesso. Riprova tra poco.", type: "info" });
                return;
            }
            setStatuses(result.statuses);
            const stillDown = printers.filter(p => p.is_active && result.statuses[p.sn] === false).length;
            showToast(
                stillDown
                    ? { message: "La stampante non risponde ancora: controllate che sia accesa e in rete.", type: "error" }
                    : { message: "Le stampanti rispondono.", type: "success" }
            );
        } catch {
            fail("Impossibile leggere lo stato delle stampanti.");
        } finally {
            setIsRetrying(false);
        }
    }, [tenantId, activity.id, printers, showToast, fail]);

    const facts = useMemo(
        () => buildFacts({ a: d, hours, closures, now, printers, statuses, reservationsLocked, orderingLocked }),
        [d, hours, closures, now, printers, statuses, reservationsLocked, orderingLocked]
    );

    // ── Navigazione fra cruscotto e fuoco ───────────────────────────────────
    const anchorRef = useRef<HTMLSpanElement>(null);
    const goTo = useCallback(
        (next: SchedaPart | null) => {
            setSearchParams(
                prev => {
                    const p = new URLSearchParams(prev);
                    if (next) p.set("parte", next);
                    else p.delete("parte");
                    return p;
                },
                { replace: false }
            );
        },
        [setSearchParams]
    );
    useEffect(() => {
        scrollParent(anchorRef.current)?.scrollTo({ top: 0 });
    }, [part]);

    // ── Il draft per parte ──────────────────────────────────────────────────
    const changedFields = Object.keys(draft.patch) as ActivityDraftField[];
    const changed = (k: SchedaPart) => changedFields.some(f => PART_FIELDS[k](f));
    const tone = useCallback((k: SchedaPart) => partTone(k, d, facts.hasHours, facts.down), [d, facts.hasHours, facts.down]);

    // ── Azioni ──────────────────────────────────────────────────────────────
    const toggleReservations = useCallback(
        async (next: boolean) => {
            try {
                await updateActivity(activity.id, tenantId, { enable_reservations: next });
                showToast({ message: next ? "Prenotazioni accese." : "Prenotazioni spente.", type: "success" });
                await reload();
            } catch {
                fail("Impossibile aggiornare le prenotazioni.");
            }
        },
        [activity.id, tenantId, reload, showToast, fail]
    );
    const toggleOrdering = useCallback(
        async (next: boolean) => {
            try {
                await updateActivityOrderingEnabled(activity.id, tenantId, next);
                showToast({
                    message: next ? "Ordini dal tavolo accesi." : "Ordini dal tavolo spenti: dal QR si guarda il menù.",
                    type: "success"
                });
                await reload();
            } catch {
                fail("Impossibile aggiornare gli ordini dal tavolo.");
            }
        },
        [activity.id, tenantId, reload, showToast, fail]
    );
    const showHours = useCallback(async () => {
        try {
            await updateActivityHoursPublic(activity.id, tenantId, true);
            await reload();
            showToast({ message: "Orari sulla pagina.", type: "success" });
        } catch {
            fail("Impossibile mostrare gli orari.");
        }
    }, [activity.id, tenantId, reload, showToast, fail]);

    const [busy, setBusy] = useState<"close" | "early" | "back" | null>(null);
    const closeToday = useCallback(
        async (early: boolean) => {
            setBusy(early ? "early" : "close");
            try {
                if (early) {
                    const slots = getDaySlots(now.iso, normalizeHours(hours), closures)
                        .map(s => {
                            const [h, m] = s.opens_at.split(":").map(Number);
                            const a = h * 60 + m;
                            const [ch, cm] = s.closes_at.split(":").map(Number);
                            const b = ch * 60 + cm + (s.closes_next_day ? 1440 : 0);
                            return { a, b };
                        })
                        .filter(s => s.a < EARLY_CLOSE)
                        .map(s => ({ opens_at: hhmm(s.a), closes_at: hhmm(Math.min(s.b, EARLY_CLOSE)), closes_next_day: false }));
                    await createActivityClosure(tenantId, {
                        activity_id: activity.id,
                        closure_date: now.iso,
                        end_date: null,
                        label: "Chiude alle 21",
                        is_closed: slots.length === 0,
                        slots: slots.length ? slots : null
                    });
                    showToast({ message: "Oggi chiudete alle 21: la pagina lo dice già.", type: "success" });
                } else {
                    await createActivityClosure(tenantId, {
                        activity_id: activity.id,
                        closure_date: now.iso,
                        end_date: null,
                        label: "Chiuso oggi",
                        is_closed: true,
                        slots: null
                    });
                    showToast({ message: "Oggi siete chiusi: la pagina lo dice già.", type: "success" });
                }
                await loadClosures();
            } catch {
                fail("Impossibile cambiare gli orari di oggi.");
            } finally {
                setBusy(null);
            }
        },
        [now.iso, hours, closures, tenantId, activity.id, loadClosures, showToast, fail]
    );
    const backToUsual = useCallback(async () => {
        if (!facts.closure || !isTodayOnly(facts.closure, now)) return;
        setBusy("back");
        try {
            await deleteActivityClosure(facts.closure.id, tenantId);
            await loadClosures();
            showToast({ message: "Oggi valgono gli orari di sempre.", type: "success" });
        } catch {
            fail("Impossibile tornare agli orari di sempre.");
        } finally {
            setBusy(null);
        }
    }, [facts.closure, now, tenantId, loadClosures, showToast, fail]);

    const solve = useCallback(
        (p: Problem) => {
            if (p.action.kind === "printer") void retryPrinters();
            else if (p.action.kind === "hoursPublic") void showHours();
            else goTo(p.part);
        },
        [retryPrinters, showHours, goTo]
    );

    const copyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(buildPublicUrl(activity.slug));
            showToast({ message: "Indirizzo copiato.", type: "success" });
        } catch {
            fail("Impossibile copiare l'indirizzo.");
        }
    }, [activity.slug, showToast, fail]);

    if (part) {
        const editors: Record<SchedaPart, ReactNode> = {
            locale: <LocaleEditor />,
            orari: <ActivityOrariRoute />,
            contatti: <ContattiEditor />,
            dove: <DoveEditor />,
            link: <ActivityPubblicazioneRoute />,
            offrite: <OffriteEditor />,
            conto: <ContoEditor />,
            prenotazioni: <ActivityOrdiniPrenotazioniRoute part="prenotazioni" />,
            ordini: <ActivityOrdiniPrenotazioniRoute part="ordini" />
        };
        const otherChanges = changedFields.filter(f => !PART_FIELDS[part](f)).length;
        return (
            <>
                <span ref={anchorRef} hidden />
                <SchedaFocus
                    key={part}
                    part={part}
                    facts={facts}
                    tone={tone}
                    changed={changed}
                    otherChanges={otherChanges}
                    editor={editors[part]}
                    onPick={goTo}
                    onDone={() => goTo(null)}
                />
            </>
        );
    }

    return (
        <>
            <span ref={anchorRef} hidden />
            <SchedaDashboard
                facts={facts}
                onCopyLink={() => void copyLink()}
                tiles={{
                    canManage,
                    open: goTo,
                    changed,
                    toggleContact: (flag, next) => draft.set(flag, next),
                    toggleReservations: next => void toggleReservations(next),
                    toggleOrdering: next => void toggleOrdering(next),
                    retryPrinters: () => void retryPrinters(),
                    isRetrying
                }}
                now={{
                    canManageHours,
                    closeToday: () => void closeToday(false),
                    closeEarly: () => void closeToday(true),
                    backToUsual: () => void backToUsual(),
                    busy,
                    solve,
                    isRetrying
                }}
            />
        </>
    );
}
