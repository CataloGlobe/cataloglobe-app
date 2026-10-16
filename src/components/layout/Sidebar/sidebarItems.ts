import type { ReactNode } from "react";
import type { UserPermissions } from "@/lib/permissions";
import { passesPlanGate, type PlanFeature, type PlanGate } from "@/lib/planFeatures";
import type { AppSidebarNavGroup, AppSidebarNavItem } from "@/components/layout/AppSidebar/AppSidebar";

/**
 * La voce di sidebar come la dichiarano i costruttori (azienda e sede), prima
 * che permessi, piano e segnali la traducano in una voce di `AppSidebar`.
 *
 * Due costruttori, una sola regola di filtro: chi dichiara le voci descrive
 * *cosa* c'è e *a chi* spetta; qui si decide cosa si vede. Prima la regola
 * viveva dentro `TenantSidebar` e un secondo contesto l'avrebbe copiata.
 */
export interface SidebarNavItem {
    /** La parte (chiave del modello): la sidebar ricorda l'ultima usata. */
    id?: string;
    to: string;
    /** La query della parte (`vista=calendario`): due parti sulla stessa pagina. */
    search?: string;
    /** Con questa query la parte non si accende: «In servizio» quando la Sala sta nella Sede (D). */
    exceptSearch?: string;
    label: string;
    icon: ReactNode;
    end?: boolean;
    /** Chi non lo passa vede sempre la voce. Chi lo passa la **nasconde** a chi non può. */
    permission?: (perms: UserPermissions) => boolean;
    /**
     * Gate di piano: la voce resta visibile e navigabile con il lucchetto
     * «Pro» — è la pagina a dire il resto. Diverso da `permission`, che
     * nasconde.
     */
    requiresFeature?: PlanGate;
    /** Voce annunciata e non ancora navigabile: attenuata, con il perché nel tooltip. */
    disabled?: boolean;
    disabledHint?: string;
    /** Altri percorsi che tengono la voce corrente (prefissi): una voce sola
     *  per più pagine, come la «Scheda» di una sede. */
    matchPrefixes?: string[];
    /**
     * Spinner ambra + conteggio delle traduzioni in corso (`translationPendingCount`);
     * senza lavoro in corso, il numero di quelle in attesa dei 10 minuti
     * (`translationWaitingCount`), senza spinner e con il titolo.
     */
    showTranslationBadge?: boolean;
    /** Spinner senza numero: import AI in volo (`importInProgress`). */
    showImportBadge?: boolean;
    /** Pallino: una risposta del supporto non letta (`supportUnread`). */
    showUnreadDot?: boolean;
    /**
     * Cose che aspettano un gesto (le recensioni in attesa): sopra zero,
     * `Badge` brand col numero. Il costruttore lo passa già filtrato per
     * permesso: a chi non può agire arriva 0.
     */
    count?: number;
    /**
     * Numeri del Servizio (D, copia «Visual Redesign PR 3»): «servizio» sono
     * le comande nuove più i tavoli che chiamano, col pallino caldo;
     * «pendingReservations» le prenotazioni da confermare.
     */
    countSignal?: "servizio" | "pendingReservations";
}

export interface SidebarNavGroup {
    /** La sezione (chiave del modello). */
    key?: string;
    title: string | null;
    /** L'icona della sezione (Officina): con l'icona il gruppo è una sezione. */
    icon?: ReactNode;
    items: SidebarNavItem[];
}

/**
 * I segnali che il layout calcola una volta sola e passa giù: la sidebar è
 * montata su ogni pagina e non interroga il DB per conto proprio.
 */
export interface SidebarSignals {
    translationPendingCount?: number;
    translationLabel?: string;
    /** Traduzioni accodate in attesa dei 10 minuti (run_after futuro). */
    translationWaitingCount?: number;
    /** «N traduzioni in attesa · partono tra X min». */
    translationWaitingLabel?: string;
    importInProgress?: boolean;
    supportUnread?: boolean;
    /** Comande nuove e tavoli che chiamano nella sede del Servizio. */
    servizioCount?: number;
    /** Prenotazioni da confermare nella sede del Servizio. */
    pendingReservations?: number;
}

interface BuildOptions {
    /** `null` = permessi non ancora arrivati: si mostra tutto (ottimistico, transitorio). */
    permissions: UserPermissions | null;
    hasFeature: (feature: PlanFeature) => boolean;
    signals?: SidebarSignals;
}

/** Applica permessi, piano e segnali; i gruppi rimasti vuoti spariscono. */
export function buildSidebarGroups(
    groups: SidebarNavGroup[],
    { permissions, hasFeature, signals = {} }: BuildOptions
): AppSidebarNavGroup[] {
    const {
        translationPendingCount = 0,
        translationLabel,
        translationWaitingCount = 0,
        translationWaitingLabel,
        importInProgress = false,
        supportUnread = false,
        servizioCount = 0,
        pendingReservations = 0
    } = signals;

    return groups
        .map(group => ({
            key: group.key,
            title: group.title ?? undefined,
            icon: group.icon,
            items: group.items
                .filter(item => {
                    if (!item.permission) return true;
                    if (!permissions) return true;
                    return item.permission(permissions);
                })
                .map((item): AppSidebarNavItem => {
                    const showTranslation = !!item.showTranslationBadge && translationPendingCount > 0;
                    const showWaiting =
                        !!item.showTranslationBadge && !showTranslation && translationWaitingCount > 0;
                    const count =
                        item.count ??
                        (item.countSignal === "servizio"
                            ? servizioCount
                            : item.countSignal === "pendingReservations"
                                ? pendingReservations
                                : 0);
                    const countLabel =
                        count > 0 && item.countSignal === "servizio"
                            ? `${count} ${count === 1 ? "cosa aspetta" : "cose aspettano"} in servizio`
                            : count > 0 && item.countSignal === "pendingReservations"
                                ? `${count} ${count === 1 ? "prenotazione da confermare" : "prenotazioni da confermare"}`
                                : undefined;
                    const showImport = !!item.showImportBadge && importInProgress;
                    return {
                        id: item.id,
                        to: item.to,
                        search: item.search,
                        exceptSearch: item.exceptSearch,
                        label: item.label,
                        icon: item.icon,
                        end: item.end,
                        disabled: item.disabled,
                        disabledHint: item.disabledHint,
                        matchPrefixes: item.matchPrefixes,
                        locked: !passesPlanGate(item.requiresFeature, hasFeature),
                        loading: showTranslation || showImport,
                        loadingLabel: showTranslation
                            ? translationLabel
                            : showImport
                                ? "Importazione menù con AI in corso"
                                : undefined,
                        badge: showTranslation
                            ? translationPendingCount
                            : showWaiting
                                ? translationWaitingCount
                                : count > 0
                                    ? count
                                    : undefined,
                        badgeTone: !showTranslation && !showWaiting && count > 0 ? "brand" : undefined,
                        badgeLabel: showWaiting ? translationWaitingLabel : countLabel,
                        badgeDot: !showTranslation && !showWaiting && count > 0 && item.countSignal === "servizio",
                        showDot: !!item.showUnreadDot && supportUnread,
                        dotLabel: item.showUnreadDot ? "Hai una risposta non letta" : undefined
                    };
                })
        }))
        .filter(group => group.items.length > 0);
}
