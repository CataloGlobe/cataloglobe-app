import { useRef } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { FormGrid } from "@/components/ui/FormGrid/FormGrid";
import { ColorInput } from "@/components/ui/Input/ColorInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { QrCode, type QrCodeHandle, type QrCodeImageSettings } from "@/components/ui/QrCode/QrCode";
import styles from "./ActivityQrDrawer.module.scss";

export const QR_DEFAULT_FG = "#000000";
export const QR_DEFAULT_BG = "#FFFFFF";

interface ActivityQrDrawerProps {
    open: boolean;
    onClose: () => void;
    value: string;
    fileName: string;
    fgColor: string;
    bgColor: string;
    onFgColorChange: (color: string) => void;
    onBgColorChange: (color: string) => void;
    showLogo: boolean;
    onShowLogoChange: (show: boolean) => void;
    /** Logo dell'azienda, se c'è: senza, l'interruttore non si mostra. */
    logoUrl: string | null;
    canEdit: boolean;
}

/**
 * Personalizzazione del QR (registro Sedi #81): colore e sfondo entrano nel
 * draft della pagina e si salvano con tutto il resto; «Logo al centro» resta
 * locale finché non c'è una colonna che lo persista. Il QR grande in cima è
 * l'anteprima di quello che si scarica.
 */
export function ActivityQrDrawer({
    open,
    onClose,
    value,
    fileName,
    fgColor,
    bgColor,
    onFgColorChange,
    onBgColorChange,
    showLogo,
    onShowLogoChange,
    logoUrl,
    canEdit
}: ActivityQrDrawerProps) {
    const qrRef = useRef<QrCodeHandle>(null);

    const imageSettings: QrCodeImageSettings | undefined =
        logoUrl && showLogo
            ? { src: logoUrl, width: 44, height: 44, excavate: true, crossOrigin: "anonymous" }
            : undefined;

    const isDefault = fgColor === QR_DEFAULT_FG && bgColor === QR_DEFAULT_BG;

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                title="Personalizza il QR"
                onClose={onClose}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => qrRef.current?.downloadSvg()}>
                            Scarica SVG
                        </Button>
                        <Button variant="primary" onClick={() => void qrRef.current?.downloadPng()}>
                            Scarica PNG
                        </Button>
                    </>
                }
            >
                <div className={styles.body}>
                    <div className={styles.preview}>
                        <QrCode
                            ref={qrRef}
                            value={value}
                            size={240}
                            level="H"
                            fgColor={fgColor}
                            bgColor={bgColor}
                            imageSettings={imageSettings}
                            fileName={fileName}
                            showActions={false}
                        />
                    </div>
                    <FormGrid cols={2}>
                        <ColorInput
                            label="Colore"
                            value={fgColor}
                            onChange={onFgColorChange}
                            disabled={!canEdit}
                        />
                        <ColorInput
                            label="Sfondo"
                            value={bgColor}
                            onChange={onBgColorChange}
                            disabled={!canEdit}
                        />
                        {logoUrl && (
                            <Switch
                                label="Logo al centro"
                                checked={showLogo}
                                onChange={onShowLogoChange}
                                helperText="Non ancora salvato: torna com'era al ricaricamento."
                            />
                        )}
                    </FormGrid>
                    {canEdit && (
                        <div>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={isDefault}
                                onClick={() => {
                                    onFgColorChange(QR_DEFAULT_FG);
                                    onBgColorChange(QR_DEFAULT_BG);
                                }}
                            >
                                Ripristina i colori
                            </Button>
                        </div>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
