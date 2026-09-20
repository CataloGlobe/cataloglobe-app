import React, { useCallback, useMemo } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { COMPANY } from "@/config/company";
import { BusinessCreateCard } from "../BusinessCreateCard/BusinessCreateCard";
import type { BusinessFormValues } from "@/types/Businesses";
import styles from "./BusinessLocationDrawer.module.scss";

type SlugInlineState =
    | { type: "idle" }
    | { type: "warning" }
    | { type: "conflict"; suggestions: string[] };

/** Dati per il blocco "prossima sede a pagamento" (piano già al limite). */
export interface SeatUpgradeOfferInfo {
    planName: string;
    /** Sedi usate / previste dal piano — coincidono al momento dell'offerta. */
    usedSeats: number;
    paidSeats: number;
    /** Costo mensile aggiuntivo per la prossima sede, con lo sconto volume già applicato. */
    extraPriceCents: number;
    /** Prezzo di listino (senza sconto volume) della sede aggiuntiva. */
    listPriceCents: number;
    volumeDiscountPercent: number;
    /** Data di rinnovo già formattata ("12 ottobre 2026"), o "—" se ignota. */
    renewalDateLabel: string;
}

/**
 * Stato "offerta" mostrato al posto del form quando il piano è al limite di
 * sedi: `upgrade` (self-service, entro `max_self_service_seats`) offre di
 * aggiungere una sede al piano; `contact_support` (oltre il tetto self-service)
 * non mostra prezzi, solo il contatto assistenza.
 */
export type SeatUpgradeOffer =
    | { kind: "upgrade"; info: SeatUpgradeOfferInfo }
    | { kind: "contact_support"; planName: string; usedSeats: number; paidSeats: number };

type Props = {
    open: boolean;
    mode: "create" | "edit";
    tenantName?: string;

    values: BusinessFormValues | null;
    errors?: Partial<Record<keyof BusinessFormValues, string>>;
    loading: boolean;

    onFieldChange: <K extends keyof BusinessFormValues>(
        field: K,
        value: BusinessFormValues[K]
    ) => void;
    onCoverChange: (file: File | null) => void;
    slugState: SlugInlineState;
    onPickSlugSuggestion: (slug: string) => void;

    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onClose: () => void;

    /**
     * Solo per `mode="create"`. Quando presente, il drawer mostra lo stato
     * offerta al posto del form — niente form destinato a fallire contro il
     * trigger DB `enforce_seat_limit`.
     */
    seatOffer?: SeatUpgradeOffer | null;
    /** Solo per `seatOffer.kind === "upgrade"`: apre il drawer piano/sedi. */
    onOpenPlanDrawer?: () => void;
};

function formatEuroCents(cents: number): string {
    return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SEAT_UPGRADE_SUPPORT_MAILTO = `mailto:${COMPANY.contact.support}?subject=${encodeURIComponent(
    "Aggiungere sedi oltre il piano self-service"
)}`;

export const BusinessLocationDrawer: React.FC<Props> = React.memo(
    ({
        open,
        mode,
        tenantName,
        values,
        errors,
        loading,
        onFieldChange,
        onCoverChange,
        slugState,
        onPickSlugSuggestion,
        onSubmit,
        onClose,
        seatOffer = null,
        onOpenPlanDrawer
    }) => {
        const isEdit = mode === "edit";
        const formId = isEdit ? "edit-business-form" : "create-business-form";
        const isOfferView = mode === "create" && seatOffer != null;

        const safeClose = useCallback(() => {
            if (!loading) onClose();
        }, [loading, onClose]);

        const header = useMemo(
            () => (
                <div className={styles.header}>
                    <Text variant="title-sm" weight={700}>
                        {isOfferView
                            ? "Hai usato tutte le sedi del tuo piano"
                            : isEdit
                            ? "Modifica sede"
                            : "Nuova sede"}
                    </Text>
                    {!isOfferView && (
                        <Text variant="body-sm" colorVariant="muted">
                            {isEdit
                                ? "Aggiorna i dati di questa sede."
                                : "Inserisci le informazioni principali della sede."}
                        </Text>
                    )}
                </div>
            ),
            [isEdit, isOfferView]
        );

        const footer = useMemo(() => {
            if (isOfferView && seatOffer) {
                if (seatOffer.kind === "upgrade") {
                    return (
                        <>
                            <Button variant="secondary" onClick={safeClose}>
                                Annulla
                            </Button>
                            <Button variant="primary" onClick={onOpenPlanDrawer}>
                                Aggiungi una sede al piano
                            </Button>
                        </>
                    );
                }
                return (
                    <>
                        <Button variant="secondary" onClick={safeClose}>
                            Chiudi
                        </Button>
                        <Button as="a" href={SEAT_UPGRADE_SUPPORT_MAILTO} variant="primary">
                            Scrivi all&apos;assistenza
                        </Button>
                    </>
                );
            }

            return (
                <>
                    <Button variant="secondary" onClick={safeClose} disabled={loading}>
                        Annulla
                    </Button>
                    <Button
                        variant="primary"
                        type="submit"
                        form={formId}
                        loading={loading}
                        disabled={loading}
                    >
                        {isEdit ? "Salva modifiche" : "Crea sede"}
                    </Button>
                </>
            );
        }, [loading, safeClose, isEdit, formId, isOfferView, seatOffer, onOpenPlanDrawer]);

        if (!values && !isOfferView) return null;

        return (
            <SystemDrawer open={open} onClose={safeClose} width={520}>
                <DrawerLayout header={header} footer={footer}>
                    {isOfferView && seatOffer ? (
                        <div className={styles.seatOffer}>
                            {seatOffer.kind === "upgrade" ? (
                                <>
                                    <Text variant="body">
                                        Il piano {seatOffer.info.planName} copre {seatOffer.info.usedSeats}{" "}
                                        {seatOffer.info.usedSeats === 1 ? "sede" : "sedi"} su{" "}
                                        {seatOffer.info.paidSeats}. Per aprire la {seatOffer.info.paidSeats + 1}ª
                                        servono {formatEuroCents(seatOffer.info.extraPriceCents)} al mese in più (
                                        {formatEuroCents(seatOffer.info.listPriceCents)} di listino, meno lo sconto
                                        volume del {seatOffer.info.volumeDiscountPercent}%), addebitati subito in
                                        proporzione ai giorni che restano fino al {seatOffer.info.renewalDateLabel}.
                                    </Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Poi torni qui e la crei.
                                    </Text>
                                </>
                            ) : (
                                <Text variant="body">
                                    Il piano {seatOffer.planName} copre {seatOffer.usedSeats}{" "}
                                    {seatOffer.usedSeats === 1 ? "sede" : "sedi"} su {seatOffer.paidSeats}. Per
                                    aprirne altre serve un piano dedicato: scrivi all&apos;assistenza.
                                </Text>
                            )}
                        </div>
                    ) : (
                        <BusinessCreateCard
                            formId={formId}
                            mode={mode}
                            values={values as BusinessFormValues}
                            errors={errors}
                            onFieldChange={onFieldChange}
                            onCoverChange={onCoverChange}
                            onSubmit={onSubmit}
                            slugState={slugState}
                            onPickSlugSuggestion={onPickSlugSuggestion}
                            namePlaceholder={
                                !isEdit
                                    ? tenantName
                                        ? `Es. ${tenantName} - Via Certosa`
                                        : "Es. McDonald's - Via Certosa"
                                    : undefined
                            }
                        />
                    )}
                </DrawerLayout>
            </SystemDrawer>
        );
    }
);
