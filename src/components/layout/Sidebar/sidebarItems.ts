import type { ReactNode } from "react";
import type { UserPermissions } from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";
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
    to: string;
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
    requiresFeature?: PlanFeature;
    /** Voce annunciata e non ancora navigabile: attenuata, con il perché nel tooltip. */
    disabled?: boolean;
    disabledHint?: string;
    /** Altri percorsi che tengono la voce corrente (prefissi): una voce sola
     *  per più pagine, come la «Scheda» di una sede. */
    matchPrefixes?: string[];
    /** Spinner ambra + conteggio delle traduzioni in corso (`translationPendingCount`). */
    showTranslationBadge?: boolean;
    /** Spinner senza numero: import AI in volo (`importInProgress`). */
    showImportBadge?: boolean;
    /** Pallino: una risposta del supporto non letta (`supportUnread`). */
    showUnreadDot?: boolean;
}

export interface SidebarNavGroup {
    title: string | null;
    items: SidebarNavItem[];
}

/**
 * I segnali che il layout calcola una volta sola e passa giù: la sidebar è
 * montata su ogni pagina e non interroga il DB per conto proprio.
 */
export interface SidebarSignals {
    translationPendingCount?: number;
    translationLabel?: string;
    importInProgress?: boolean;
    supportUnread?: boolean;
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
        importInProgress = false,
        supportUnread = false
    } = signals;

    return groups
        .map(group => ({
            title: group.title ?? undefined,
            items: group.items
                .filter(item => {
                    if (!item.permission) return true;
                    if (!permissions) return true;
                    return item.permission(permissions);
                })
                .map((item): AppSidebarNavItem => {
                    const showTranslation = !!item.showTranslationBadge && translationPendingCount > 0;
                    const showImport = !!item.showImportBadge && importInProgress;
                    return {
                        to: item.to,
                        label: item.label,
                        icon: item.icon,
                        end: item.end,
                        disabled: item.disabled,
                        disabledHint: item.disabledHint,
                        matchPrefixes: item.matchPrefixes,
                        locked: !!item.requiresFeature && !hasFeature(item.requiresFeature),
                        loading: showTranslation || showImport,
                        loadingLabel: showTranslation
                            ? translationLabel
                            : showImport
                                ? "Importazione menù con AI in corso"
                                : undefined,
                        badge: showTranslation ? translationPendingCount : undefined,
                        showDot: !!item.showUnreadDot && supportUnread,
                        dotLabel: item.showUnreadDot ? "Hai una risposta non letta" : undefined
                    };
                })
        }))
        .filter(group => group.items.length > 0);
}
