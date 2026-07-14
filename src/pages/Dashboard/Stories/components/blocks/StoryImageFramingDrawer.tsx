import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { ImageReframeEditor } from "@/components/ui/ImageReframeEditor";
import {
    frameToRatio,
    FRAMING_DEFAULTS,
    type MediaFrame,
    type MediaFraming
} from "@/components/ui/ImageReframeEditor/types";
import styles from "./ImageBlock.module.scss";

const FORM_ID = "story-image-framing-form";

const FRAME_OPTIONS: { value: MediaFrame; label: string }[] = [
    { value: "3:2", label: "Orizzontale" },
    { value: "4:5", label: "Verticale" }
];

/**
 * Drawer "Immagine" del blocco Storie: qui vive la PRESENTAZIONE (formato +
 * inquadratura + sostituzione file), mentre la riga mostra solo il contenuto.
 * Shell duplicato (di proposito) rispetto a FeaturedMediaDrawer. Formato +
 * framing sono un draft locale committato SOLO su Conferma; Annulla scarta. La
 * sostituzione del file è invece immediata (aggiorna il file pendente del
 * parent): riazzera il framing draft a neutro sulla nuova immagine.
 */
interface StoryImageFramingDrawerProps {
    open: boolean;
    onClose: () => void;
    /** URL/objectURL dell'immagine corrente. */
    source: string;
    /** Formato committato (baseline draft). */
    frame: MediaFrame;
    /** Framing committato (baseline draft). */
    framing: MediaFraming;
    /** Sostituisce il file (immediato, gestito dal parent = acceptFile). */
    onReplace: (file: File) => void;
    /** Committa formato + framing nel blocco. Solo su Conferma. */
    onConfirm: (frame: MediaFrame, framing: MediaFraming) => void;
}

export function StoryImageFramingDrawer({
    open,
    onClose,
    source,
    frame,
    framing,
    onReplace,
    onConfirm
}: StoryImageFramingDrawerProps) {
    const [draftFrame, setDraftFrame] = useState<MediaFrame>(frame);
    const [draftFraming, setDraftFraming] = useState<MediaFraming>(framing);
    const replaceInputRef = useRef<HTMLInputElement>(null);

    // Riallinea il draft alla baseline ad ogni apertura.
    useEffect(() => {
        if (open) {
            setDraftFrame(frame);
            setDraftFraming(framing);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleReplace = (file: File) => {
        onReplace(file);
        // Nuova immagine → inquadratura neutra (il formato scelto resta).
        setDraftFraming(FRAMING_DEFAULTS);
    };

    const handleConfirm = () => {
        onConfirm(draftFrame, draftFraming);
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Immagine
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" type="button" onClick={onClose}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID}>
                            Conferma
                        </Button>
                    </>
                }
            >
                <form
                    id={FORM_ID}
                    className={styles.root}
                    onSubmit={e => {
                        e.preventDefault();
                        handleConfirm();
                    }}
                >
                    <div className={styles.frameRow}>
                        <span className={styles.frameLabel}>Formato</span>
                        <SegmentedControl<MediaFrame>
                            value={draftFrame}
                            onChange={setDraftFrame}
                            options={FRAME_OPTIONS}
                            size="sm"
                        />
                    </div>

                    <ImageReframeEditor
                        source={source}
                        value={draftFraming}
                        onChange={setDraftFraming}
                        aspectRatio={frameToRatio(draftFrame)}
                        showActions={false}
                        showFillPanel={false}
                    />

                    <div className={styles.editorActions}>
                        <input
                            ref={replaceInputRef}
                            type="file"
                            accept="image/*"
                            className={styles.hiddenInput}
                            onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) {
                                    handleReplace(f);
                                    e.target.value = "";
                                }
                            }}
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            leftIcon={<RefreshCw size={14} />}
                            onClick={() => replaceInputRef.current?.click()}
                        >
                            Sostituisci immagine
                        </Button>
                    </div>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
