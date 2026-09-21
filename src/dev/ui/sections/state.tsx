/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { OfferBlock } from "@/components/ui/OfferBlock/OfferBlock";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import styles from "../DevUiPage.module.scss";
import { StatusStrip } from "@/components/ui/StatusStrip/StatusStrip";
import { Checklist, type ChecklistItem } from "@/components/ui/Checklist/Checklist";
import { State, noop, type GallerySection } from "../gallery";

/* ------------------------------------------------------------------ */
/* StatusStrip                                                         */
/* ------------------------------------------------------------------ */

function StatusStripSection() {
    return (
        <>
            <State label="success: attivo, una cifra, un'azione" column>
                <StatusStrip
                    tone="success"
                    badge="Attivo"
                    title="Abbonamento Pro, 3 sedi"
                    description="Prossimo rinnovo il 12 ottobre 2026."
                    figures={[{ value: "48 €", label: "al mese" }]}
                    action={<Button variant="secondary" size="sm" onClick={noop}>Gestisci</Button>}
                />
            </State>
            <State label="warning: in attesa / al limite" column>
                <StatusStrip
                    tone="warning"
                    badge="Al limite"
                    title="Hai usato tutte le 3 sedi pagate"
                    description="La prossima costa 12 € al mese, prorata sul periodo in corso."
                    action={<Button variant="primary" size="sm" onClick={noop}>Aggiungi una sede</Button>}
                />
            </State>
            <State label="danger: sospeso / fallito" column>
                <StatusStrip
                    tone="danger"
                    badge="Sospeso"
                    title="Pagamento non riuscito, il menù pubblico è offline"
                    description="Aggiorna la carta per riattivare le sedi."
                    action={<Button variant="danger" size="sm" onClick={noop}>Aggiorna la carta</Button>}
                />
            </State>
            <State label="info: in prova" column>
                <StatusStrip
                    tone="info"
                    badge="In prova"
                    title="Prova gratuita, 9 giorni rimasti"
                    description="Alla fine della prova scegli un piano: i dati restano."
                    figures={[{ value: "9", label: "giorni" }]}
                    action={<Button variant="primary" size="sm" onClick={noop}>Scegli il piano</Button>}
                />
            </State>
            <State label="neutral: il campione, tre cifre, nessuna azione" column>
                <StatusStrip
                    tone="neutral"
                    badge="Campione"
                    title="Analitiche degli ultimi 30 giorni"
                    description="Sotto le 100 visite i confronti non si mostrano."
                    figures={[
                        { value: "151", label: "visite" },
                        { value: "9", label: "click sul telefono" },
                        { value: "2", label: "sedi" }
                    ]}
                />
            </State>
            <State label="senza descrizione, senza cifre (il minimo)" column>
                <StatusStrip tone="warning" badge="In ritardo" title="Ordine #1042 in attesa da 12 minuti" action={<Button variant="secondary" size="sm" onClick={noop}>Vai all'ordine</Button>} />
            </State>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

const BASICS: ChecklistItem[] = [
    { id: "logo", title: "Aggiungi il logo", description: "Compare nell'header della pagina pubblica", done: true },
    { id: "sede", title: "Crea la prima sede", description: "Indirizzo e orari", done: true },
    { id: "menu", title: "Pubblica il primo menù", description: "Serve un catalogo con almeno un prodotto", done: false, onAction: noop },
    { id: "qr", title: "Stampa il QR", description: "Da mettere sui tavoli", done: false, onAction: noop }
];

function ChecklistSection() {
    return (
        <>
            <State label="open: 2 di 4, righe fatte muted, «Fai ora» sulle aperte" column>
                <Checklist items={BASICS} />
            </State>
            <State label="open: 0 di 4 (nulla fatto)" column>
                <Checklist items={BASICS.map(i => ({ ...i, done: false, onAction: noop }))} />
            </State>
            <State label="done: riga verde collassata, si apre al click (Chip spuntati)" column>
                <Checklist items={BASICS.map(i => ({ ...i, done: true }))} />
            </State>
            <State label="caricamento: Skeleton di quattro righe" column>
                <Checklist items={[]} loading />
            </State>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* OfferBlock                                                          */
/* ------------------------------------------------------------------ */

function OfferBlockSection() {
    const [open, setOpen] = useState<"upgrade" | "contact" | null>(null);
    const [loading, setLoading] = useState(false);
    const close = () => setOpen(null);
    const act = () => {
        setLoading(true);
        window.setTimeout(() => {
            setLoading(false);
            close();
        }, 1500);
    };
    return (
        <>
            <State label="upgrade: icona · titolo · prezzo + prorata · riga · azione + Annulla (nudo, come sta nel drawer)" column>
                <div className={styles.narrow}>
                    <OfferBlock
                        variant="upgrade"
                        title="Hai usato tutte le 3 sedi pagate"
                        price="12 € al mese"
                        prorata="Oggi paghi 4,80 € per i 12 giorni rimasti"
                        description="La quarta sede si aggiunge subito al piano, senza cambiare piano."
                        onAction={noop}
                        onCancel={noop}
                    />
                </div>
            </State>
            <State label="contact: oltre 5 sedi, serve un piano dedicato" column>
                <div className={styles.narrow}>
                    <OfferBlock
                        variant="contact"
                        title="Oltre 5 sedi serve un piano dedicato"
                        description="Ti rispondiamo entro un giorno lavorativo con un'offerta su misura."
                        onAction={noop}
                        onCancel={noop}
                    />
                </div>
            </State>
            <State label="loading: azione in corso" column>
                <div className={styles.narrow}>
                    <OfferBlock variant="upgrade" title="Hai usato tutte le 3 sedi pagate" price="12 € al mese" onAction={noop} onCancel={noop} loading />
                </div>
            </State>
            <State label="nel suo posto: SystemDrawer md (l'azione chiude dopo 1,5 s)">
                <Button variant="secondary" onClick={() => setOpen("upgrade")}>
                    Apri upgrade
                </Button>
                <Button variant="secondary" onClick={() => setOpen("contact")}>
                    Apri contact
                </Button>
            </State>
            <SystemDrawer open={open !== null} onClose={close} size="md" aria-labelledby="dev-offer-title">
                <DrawerLayout title="Nuova sede" titleId="dev-offer-title" onClose={close}>
                    {open === "contact" ? (
                        <OfferBlock variant="contact" title="Oltre 5 sedi serve un piano dedicato" description="Ti rispondiamo entro un giorno lavorativo." onAction={act} onCancel={close} loading={loading} />
                    ) : (
                        <OfferBlock
                            variant="upgrade"
                            title="Hai usato tutte le 3 sedi pagate"
                            price="12 € al mese"
                            prorata="Oggi paghi 4,80 € per i 12 giorni rimasti"
                            description="La quarta sede si aggiunge subito al piano."
                            onAction={act}
                            onCancel={close}
                            loading={loading}
                        />
                    )}
                </DrawerLayout>
            </SystemDrawer>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* ProgressBar                                                         */
/* ------------------------------------------------------------------ */

function ProgressBarSection() {
    return (
        <>
            <State label="brand: avanzamento («3 di 4», «30 %»)" column>
                <ProgressBar value={3} max={4} label="3 di 4" />
                <ProgressBar value={30} label="30 %" />
            </State>
            <State label="success: completamento raggiunto" column>
                <ProgressBar value={4} max={4} variant="success" label="4 di 4" />
            </State>
            <State label="warning: oltre l'80 % di un limite (credito AI)" column>
                <ProgressBar value={15.6} max={18} variant="warning" label="€ 15,60 di € 18" />
            </State>
            <State label="indeterminate: import senza totale" column>
                <ProgressBar variant="indeterminate" label="Importazione in corso" />
            </State>
            <State label="inline: max 160 in una riga">
                <ProgressBar value={12} max={40} label="12 di 40 piatti" inline />
                <ProgressBar value={0} max={40} label="0 di 40" inline />
            </State>
        </>
    );
}

export const stateSections: GallerySection[] = [
    { id: "statusstrip", title: "StatusStrip", sheet: "StatusStrip", Component: StatusStripSection },
    { id: "checklist", title: "Checklist", sheet: "Checklist", Component: ChecklistSection },
    { id: "offerblock", title: "OfferBlock", sheet: "OfferBlock", Component: OfferBlockSection },
    { id: "progressbar", title: "ProgressBar", sheet: "ProgressBar", Component: ProgressBarSection }
];
