/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { Button } from "@/components/ui/Button/Button";
import { StatusStrip } from "@/components/ui/StatusStrip/StatusStrip";
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

export const stateSections: GallerySection[] = [
    { id: "statusstrip", title: "StatusStrip", sheet: "StatusStrip", Component: StatusStripSection }
];
