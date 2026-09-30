import React, { useCallback, useMemo } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { OfferBlock } from "@/components/ui/OfferBlock";
import { COMPANY } from "@/config/company";
import { formatCurrency } from "@/utils/formatCurrency";
import type { NextSeatOffer } from "@/utils/pricing";
import type { BillingInterval } from "@/types/plan";
import { BusinessCreateCard } from "../BusinessCreateCard/BusinessCreateCard";
import type { BusinessFormValues, SlugInlineState } from "@/types/Businesses";
import styles from "./BusinessLocationDrawer.module.scss";

/**
 * Cosa mostra il drawer quando le sedi pagate sono finite (§37.6, §37.7):
 * l'esito di `nextSeatOffer` più quello che serve a dirlo — nome del piano,
 * sedi pagate, intervallo di fatturazione, data di rinnovo.
 */
export interface SeatLimitOffer {
    offer: Extract<NextSeatOffer, { kind: "upgrade" | "contact" }>;
    planName: string;
    paidSeats: number;
    interval: BillingInterval;
    /** Già formattata («12 ottobre 2026»), o null se ignota. */
    renewalDateLabel: string | null;
}

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
     * Solo per `mode="create"`. Quando presente, il drawer mostra l'offerta al
     * posto del form — niente form destinato a fallire contro il trigger DB
     * `enforce_seat_limit`.
     */
    seatOffer?: SeatLimitOffer | null;
    /** Solo per `offer.kind === "upgrade"`: apre il drawer piano/sedi. */
    onOpenPlanDrawer?: () => void;
};

const SEAT_UPGRADE_SUPPORT_MAILTO = `mailto:${COMPANY.contact.support}?subject=${encodeURIComponent(
    "Aggiungere sedi oltre il piano self-service"
)}`;

const PER_INTERVAL: Record<BillingInterval, string> = { month: "al mese", year: "all'anno" };

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
                        {isEdit ? "Modifica sede" : "Nuova sede"}
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

        // L'offerta porta le sue azioni (OfferBlock): il footer c'è solo col form.
        const footer = useMemo(() => {
            if (isOfferView) return undefined;
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
        }, [loading, safeClose, isEdit, formId, isOfferView]);

        if (!values && !isOfferView) return null;

        return (
            <SystemDrawer open={open} onClose={safeClose} size="md">
                <DrawerLayout header={header} footer={footer}>
                    {isOfferView && seatOffer ? (
                        <SeatLimitOfferBlock seatOffer={seatOffer} onOpenPlanDrawer={onOpenPlanDrawer} onClose={safeClose} />
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

function SeatLimitOfferBlock({
    seatOffer,
    onOpenPlanDrawer,
    onClose
}: {
    seatOffer: SeatLimitOffer;
    onOpenPlanDrawer?: () => void;
    onClose: () => void;
}) {
    const { offer, planName, paidSeats, interval, renewalDateLabel } = seatOffer;
    const title = `Hai usato tutte le ${paidSeats} sedi pagate`;

    if (offer.kind === "contact") {
        return (
            <OfferBlock
                variant="contact"
                title={title}
                description={`Il piano ${planName} arriva a ${offer.cap} sedi in autonomia. Per aprirne altre serve un piano dedicato.`}
                actionLabel="Scrivi all'assistenza"
                onAction={() => window.location.assign(SEAT_UPGRADE_SUPPORT_MAILTO)}
                cancelLabel="Chiudi"
                onCancel={onClose}
            />
        );
    }

    const prorata = `${formatCurrency(offer.listPriceCents / 100)} di listino, meno lo sconto volume del ${offer.volumeDiscountPercent} %. ${
        renewalDateLabel
            ? `Addebitati subito in proporzione ai giorni che restano fino al ${renewalDateLabel}.`
            : "Addebitati subito in proporzione ai giorni che restano del periodo."
    }`;

    return (
        <OfferBlock
            variant="upgrade"
            title={title}
            price={`+ ${formatCurrency(offer.extraPriceCents / 100)} ${PER_INTERVAL[interval]}`}
            prorata={prorata}
            description="Poi torni qui e la crei."
            actionLabel="Aggiungi una sede al piano"
            onAction={() => onOpenPlanDrawer?.()}
            cancelLabel="Annulla"
            onCancel={onClose}
        />
    );
}
