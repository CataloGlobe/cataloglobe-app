import React, { useState, useEffect } from "react";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Drawer } from "@/components/ui/Drawer/Drawer";
import { StylePropertiesPanel } from "./StylePropertiesPanel";
import { StyleTokenModel } from "./StyleTokenModel";
import { V2Style } from "@/services/supabase/styles";
import styles from "../Styles.module.scss";

// Simple hook for media query
function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        const mql = window.matchMedia(query);
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, [query]);

    return matches;
}

type StyleSettingsDrawerProps = {
    isOpen: boolean;
    onClose: () => void;
    // Form and data props
    name: string;
    setName: (name: string) => void;
    tokenModel: StyleTokenModel;
    setTokenModel: (m: StyleTokenModel) => void;
    styleData: V2Style | null;
    isSystemError: boolean | undefined;
    onSubmit: (e: React.FormEvent) => void;
};

export const StyleSettingsDrawer = ({
    isOpen,
    onClose,
    name,
    setName,
    tokenModel,
    setTokenModel,
    styleData,
    isSystemError,
    onSubmit
}: StyleSettingsDrawerProps) => {
    // Mode logic: docked on desktop (>= 1024), overlay on mobile
    const isDesktop = useMediaQuery("(min-width: 1024px)");
    const drawerMode = isDesktop ? "docked" : "overlay";

    return (
        <Drawer
            title="Proprietà Stile"
            isOpen={isOpen}
            onClose={onClose}
            mode={drawerMode}
            position="right"
            width={360}
        >
            <form
                id="style-form"
                className={`${styles.form} ${styles.settingsForm}`}
                onSubmit={onSubmit}
            >
                {styleData && (
                    <div className={styles.versionInfo}>
                        <Text variant="body-sm" weight={600} colorVariant="primary">
                            Versione Corrente: {styleData.current_version?.version || "N/A"}
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Ultimo aggiornamento:{" "}
                            {new Date(styleData.updated_at).toLocaleString("it-IT")}
                        </Text>
                        {styleData.is_system && (
                            <Text
                                variant="caption"
                                colorVariant="error"
                                style={{ display: "block", marginTop: "4px" }}
                            >
                                Questo è uno stile di sistema. Non può essere modificato, ma puoi
                                duplicarlo per creare una tua versione.
                            </Text>
                        )}
                    </div>
                )}

                <div className={styles.styleNameField}>
                    <TextInput
                        label="Nome stile"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Es: Dark Theme, Summer Vibes..."
                        disabled={isSystemError}
                    />
                </div>

                {!isSystemError && (
                    <StylePropertiesPanel
                        model={tokenModel}
                        onChange={newModel => {
                            setTokenModel(newModel);
                        }}
                    />
                )}
            </form>
        </Drawer>
    );
};
