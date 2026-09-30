/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { Info } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Loader } from "@/components/ui/Loader/Loader";
import { LoadingState } from "@/components/ui/LoadingState/LoadingState";
import { AppLoader } from "@/components/ui/AppLoader/AppLoader";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ToastItem } from "@/components/ui/Toast/Toast";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { InfoTooltip } from "@/components/ui/Tooltip/InfoTooltip";
import { Button } from "@/components/ui/Button/Button";
import type { Toast } from "@/types/toast";
import { State, noop, type GallerySection } from "../gallery";
import styles from "../DevUiPage.module.scss";

function SkeletonSection() {
    return (
        <>
            <State label="text (righe 12px, 40–80%)" column>
                <Skeleton height={12} width="80%" radius="4px" />
                <Skeleton height={12} width="60%" radius="4px" />
                <Skeleton height={12} width="40%" radius="4px" />
            </State>
            <State label="row 56 · stat 34 · card" column>
                <Skeleton height={56} />
                <Skeleton height={34} width={120} />
                <Skeleton height={160} radius="12px" />
            </State>
            <State label="wrapper mode (loading=true / false)" column>
                <Skeleton loading>
                    <Text variant="body">Questo testo è coperto dallo skeleton.</Text>
                </Skeleton>
                <Skeleton loading={false}>
                    <Text variant="body">Questo testo è visibile.</Text>
                </Skeleton>
            </State>
        </>
    );
}

function LoaderSection() {
    return (
        <>
            <State label="sm / md / lg">
                <Loader size="sm" ariaLabel="Caricamento" />
                <Loader size="md" ariaLabel="Caricamento" />
                <Loader size="lg" ariaLabel="Caricamento" />
            </State>
            <State label="fullscreen (in un riquadro)" column>
                <div className={styles.box}>
                    <Loader size="lg" fullscreen ariaLabel="Caricamento" />
                </div>
            </State>
        </>
    );
}

function LoadingStateSection() {
    return (
        <>
            <State label="default" column>
                <LoadingState message="Carico i cataloghi…" />
            </State>
            <State label="compact + icona" column>
                <LoadingState message="Import in corso…" compact icon={<Info size={16} />} />
            </State>
        </>
    );
}

function AppLoaderSection() {
    return (
        <>
            {(["dashboard", "auth", "otp", "sync", "public", "generic"] as const).map(intent => (
                <State key={intent} label={`intent=${intent}`} column>
                    <div className={styles.box}>
                        <AppLoader intent={intent} />
                    </div>
                </State>
            ))}
            <State label="senza messaggio" column>
                <div className={styles.box}>
                    <AppLoader showMessage={false} />
                </div>
            </State>
        </>
    );
}

function InlineBannerSection() {
    return (
        <>
            <State label="error" column>
                <InlineBanner variant="error">Non siamo riusciti a salvare. Riprova.</InlineBanner>
            </State>
            <State label="warning" column>
                <InlineBanner variant="warning">Hai usato tutte le 3 sedi pagate.</InlineBanner>
            </State>
            <State label="info" column>
                <InlineBanner variant="info">Le modifiche compaiono nella pagina pubblica entro un minuto.</InlineBanner>
            </State>
            <State label="con azione a destra (error «Riprova», info link)" column>
                <InlineBanner
                    variant="error"
                    action={
                        <Button variant="secondary" size="sm" onClick={noop}>
                            Riprova
                        </Button>
                    }
                >
                    Non siamo riusciti a salvare le modifiche.
                </InlineBanner>
                <InlineBanner variant="info" action={<a href="#inlinebanner">Gestisci stampanti</a>}>
                    Nessuna stampante collegata a questa sede: le comande non vengono stampate in automatico.
                </InlineBanner>
            </State>
            <State label="icona custom · testo lungo con azione" column>
                <InlineBanner variant="warning" icon={<Info size={16} aria-hidden />} action={<a href="#toast">Vai al piano</a>}>
                    Hai usato tutte le 3 sedi pagate: per aggiungerne un'altra serve un posto in più nel piano.
                    Le sedi esistenti continuano a funzionare come prima.
                </InlineBanner>
            </State>
        </>
    );
}

const TOASTS: Toast[] = [
    { id: "t1", message: "Menù pubblicato", type: "success", duration: 999999 },
    { id: "t2", message: "Il link è stato copiato", type: "info", duration: 999999 },
    { id: "t3", message: "Sede eliminata", type: "success", duration: 999999, actionLabel: "Annulla", onAction: noop },
    { id: "t4", message: "La sede è sospesa", type: "warning", duration: 999999 },
    { id: "t5", message: "Non siamo riusciti a salvare", type: "error", duration: 999999 }
];

function ToastSection() {
    return (
        <State label="success · info · con azione · warning · error (statici)" column>
            <div className={styles.toastStack}>
                {TOASTS.map(toast => (
                    <ToastItem key={toast.id} toast={toast} onRemove={noop} />
                ))}
            </div>
        </State>
    );
}

function TooltipSection() {
    return (
        <>
            <State label="side top / right / bottom / left (hover)">
                {(["top", "right", "bottom", "left"] as const).map(side => (
                    <Tooltip key={side} content={`Tooltip ${side}`} side={side}>
                        <Button variant="secondary" size="sm" onClick={noop}>
                            {side}
                        </Button>
                    </Tooltip>
                ))}
            </State>
            <State label="InfoTooltip accanto a un'etichetta">
                <Text variant="body-sm" as="span">
                    Coperti
                </Text>
                <InfoTooltip content="Il numero massimo di persone per prenotazione." />
                <InfoTooltip content="Senza spaziatura" withSpacing={false} side="right" />
            </State>
        </>
    );
}

export const feedbackSections: GallerySection[] = [
    { id: "skeleton", title: "Skeleton", sheet: "Skeleton", Component: SkeletonSection },
    { id: "loader", title: "Loader", sheet: "Loader", Component: LoaderSection },
    { id: "loadingstate", title: "LoadingState", sheet: "Skeleton", Component: LoadingStateSection },
    { id: "apploader", title: "AppLoader", sheet: "Loader", Component: AppLoaderSection },
    { id: "inlinebanner", title: "InlineBanner", sheet: "InlineBanner", Component: InlineBannerSection },
    { id: "toast", title: "Toast", sheet: "Toast", Component: ToastSection },
    { id: "tooltip", title: "Tooltip · InfoTooltip", sheet: "Tooltip", Component: TooltipSection }
];
