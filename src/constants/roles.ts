import type { EffectiveRole } from "@/types/team";

/**
 * I ruoli come li legge chi usa il pannello (§37.3): i valori DB restano
 * `owner/admin/manager/staff/viewer`, cambia solo la parola a schermo.
 */
export const ROLE_LABEL: Record<EffectiveRole, string> = {
    owner: "Proprietario",
    admin: "Amministratore",
    manager: "Manager",
    staff: "Staff",
    viewer: "Sola lettura"
};

/**
 * Cosa può fare ogni ruolo, in una riga. Verificate su `role_permissions`
 * il 21/09/2026 (registro feature, §Team passo 2): l'amministratore gestisce
 * anche l'abbonamento, lo staff non tocca la disponibilità dei prodotti.
 */
export const ROLE_PHRASE: Record<EffectiveRole, string> = {
    owner: "Tutto, e può eliminare l'azienda",
    admin: "Gestisce tutte le sedi e l'abbonamento; non elimina l'azienda",
    manager: "Gestisce le sue sedi e invita chi ci lavora",
    staff: "Comande, tavoli e prenotazioni sulle sue sedi",
    viewer: "Guarda e non modifica niente"
};

/** Ordine di presentazione, dal ruolo più ampio al più stretto. */
export const ROLE_ORDER: EffectiveRole[] = ["owner", "admin", "manager", "staff", "viewer"];
