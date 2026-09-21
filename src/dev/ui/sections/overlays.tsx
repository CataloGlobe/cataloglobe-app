/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, ExternalLink } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog/UnsavedChangesDialog";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { Menu } from "@/components/ui/Menu/Menu";
import { SystemDrawer, type SystemDrawerSize } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { State, noop, type GallerySection } from "../gallery";
import styles from "../DevUiPage.module.scss";

function DialogsSection() {
    const [confirm, setConfirm] = useState<"danger" | "primary" | null>(null);
    const [typed, setTyped] = useState(false);
    const [failing, setFailing] = useState(false);
    const [failError, setFailError] = useState<string | null>(null);
    const [unsaved, setUnsaved] = useState<"three" | "two" | null>(null);
    return (
        <>
            <State label="con campo di conferma (il distruttivo si abilita solo se il testo coincide)">
                <Button variant="danger" onClick={() => setTyped(true)}>
                    Elimina «Trattoria del Porto»
                </Button>
                <ConfirmDialog
                    isOpen={typed}
                    onClose={() => setTyped(false)}
                    onConfirm={async () => {
                        await new Promise(r => setTimeout(r, 800));
                        return true;
                    }}
                    title="Eliminare «Trattoria del Porto»?"
                    message="L'azienda va nell'area «In eliminazione» per 30 giorni, poi sparisce per sempre."
                    confirmText="Trattoria del Porto"
                    confirmLabel="Elimina azienda"
                />
            </State>
            <State label="errore dell'azione: InlineBanner error sopra i bottoni, il dialog resta">
                <Button variant="danger" onClick={() => setFailing(true)}>
                    Apri (l'azione fallisce)
                </Button>
                <ConfirmDialog
                    isOpen={failing}
                    onClose={() => {
                        setFailing(false);
                        setFailError(null);
                    }}
                    onConfirm={async () => {
                        await new Promise(r => setTimeout(r, 600));
                        setFailError("Non è stato possibile eliminare la sede: riprova.");
                        return false;
                    }}
                    title="Elimina la sede?"
                    message="I tavoli e i QR collegati spariscono."
                    confirmLabel="Elimina"
                    error={failError}
                />
            </State>
            <State label="ConfirmDialog danger / primary">
                <Button variant="danger" onClick={() => setConfirm("danger")}>
                    Apri conferma eliminazione
                </Button>
                <Button variant="secondary" onClick={() => setConfirm("primary")}>
                    Apri conferma primaria
                </Button>
                <ConfirmDialog
                    isOpen={confirm !== null}
                    onClose={() => setConfirm(null)}
                    onConfirm={async () => {
                        await new Promise(r => setTimeout(r, 800));
                        setConfirm(null);
                        return true;
                    }}
                    title={confirm === "danger" ? "Elimina la sede?" : "Pubblica il menù?"}
                    message={
                        confirm === "danger"
                            ? "La sede e i suoi tavoli spariscono dalla pagina pubblica. Non si annulla."
                            : "Il menù sarà visibile subito nella pagina pubblica."
                    }
                    confirmLabel={confirm === "danger" ? "Elimina" : "Pubblica"}
                    confirmVariant={confirm ?? "primary"}
                />
            </State>
            <State label="UnsavedChangesDialog 3 opzioni / 2 opzioni («Resta»)">
                <Button variant="secondary" onClick={() => setUnsaved("three")}>
                    Apri con «Salva ed esci»
                </Button>
                <Button variant="secondary" onClick={() => setUnsaved("two")}>
                    Apri variante guardia
                </Button>
                <UnsavedChangesDialog
                    isOpen={unsaved === "three"}
                    onCancel={() => setUnsaved(null)}
                    onDiscard={() => setUnsaved(null)}
                    onSaveAndExit={async () => {
                        await new Promise(r => setTimeout(r, 800));
                        setUnsaved(null);
                        return true;
                    }}
                />
                <UnsavedChangesDialog
                    isOpen={unsaved === "two"}
                    onCancel={() => setUnsaved(null)}
                    onDiscard={() => setUnsaved(null)}
                    cancelLabel="Resta"
                    message="Hai modifiche non salvate. Se esci ora, andranno perse."
                />
            </State>
        </>
    );
}

function DrawerSection() {
    const [size, setSize] = useState<SystemDrawerSize | null>(null);
    const [legacy, setLegacy] = useState<number | null>(null);
    const close = () => {
        setSize(null);
        setLegacy(null);
    };
    const open = size !== null || legacy !== null;
    return (
        <>
            <State label="size sm 420 / md 520 / lg 720 · header canonico (title + onClose), footer con safe-area">
                {(["sm", "md", "lg"] as const).map(s => (
                    <Button key={s} variant="secondary" onClick={() => setSize(s)}>
                        Apri {s}
                    </Button>
                ))}
            </State>
            <State label="width numerica deprecata: 560 → md con warn; 900 resta 900 con warn «route nel lotto 5»">
                <Button variant="secondary" onClick={() => setLegacy(560)}>
                    Apri width=560
                </Button>
                <Button variant="secondary" onClick={() => setLegacy(900)}>
                    Apri width=900
                </Button>
            </State>
            <SystemDrawer
                open={open}
                onClose={close}
                size={size ?? undefined}
                width={legacy ?? undefined}
                aria-labelledby="dev-drawer-title"
            >
                <DrawerLayout
                    title={`Nuova sede (${size ?? `width=${legacy}`})`}
                    titleId="dev-drawer-title"
                    onClose={close}
                    footer={
                        <>
                            <Button variant="secondary" onClick={close}>
                                Annulla
                            </Button>
                            <Button variant="primary" onClick={close}>
                                Salva
                            </Button>
                        </>
                    }
                >
                    <div className={styles.stack}>
                        <TextInput label="Nome" placeholder="Trattoria del Porto" />
                        <TextInput label="Città" placeholder="Milano" helperText="Compare nella pagina pubblica." />
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </>
    );
}

function ModalLayoutSection() {
    const [open, setOpen] = useState(false);
    return (
        <State label="solo guide e anteprime (regola 1): width sm, height fit">
            <Button variant="secondary" onClick={() => setOpen(true)}>
                Apri ModalLayout
            </Button>
            <ModalLayout isOpen={open} onClose={() => setOpen(false)} width="sm" height="fit">
                <ModalLayoutHeader>
                    <Text variant="title-sm" weight={600}>
                        Guida rapida
                    </Text>
                </ModalLayoutHeader>
                <ModalLayoutContent>
                    <Text variant="body-sm" colorVariant="muted">
                        ModalLayout resta per guide e anteprime; le conferme vanno in ConfirmDialog.
                    </Text>
                </ModalLayoutContent>
                <ModalLayoutFooter>
                    <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
                        Chiudi
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
        </State>
    );
}

function MenuSection() {
    return (
        <>
            <State label="allineato a start / end (apri al click)">
                <Menu trigger={<IconButton icon={<MoreHorizontal size={16} />} aria-label="Altre azioni" />} align="start">
                    <Menu.Label>Trattoria del Porto</Menu.Label>
                    <Menu.Item icon={Pencil} onSelect={noop}>
                        Modifica
                    </Menu.Item>
                    <Menu.Item icon={ExternalLink} href="#" target="_blank">
                        Apri pagina pubblica
                    </Menu.Item>
                    <Menu.Item onSelect={noop} disabled>
                        Duplica (piano Pro)
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item icon={Trash2} variant="destructive" onSelect={noop}>
                        Elimina
                    </Menu.Item>
                </Menu>
                <Menu
                    trigger={
                        <Button variant="secondary" size="sm" onClick={noop}>
                            Menu a destra
                        </Button>
                    }
                    align="end"
                    side="top"
                >
                    <Menu.Item onSelect={noop}>Voce uno</Menu.Item>
                    <Menu.Item onSelect={noop}>Voce due</Menu.Item>
                </Menu>
            </State>
        </>
    );
}

export const overlaysSections: GallerySection[] = [
    { id: "dialogs", title: "ConfirmDialog · UnsavedChangesDialog", sheet: "ConfirmDialog", Component: DialogsSection },
    { id: "drawer", title: "SystemDrawer + DrawerLayout", sheet: "SystemDrawer", Component: DrawerSection },
    { id: "modallayout", title: "ModalLayout", sheet: "ConfirmDialog", Component: ModalLayoutSection },
    { id: "menu", title: "Menu", sheet: "Menu", Component: MenuSection }
];
