import React from "react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";

type StylePreviewMockProps = {
    parsedConfig: any;
    error: boolean;
};

export const StylePreviewMock = ({ parsedConfig, error }: StylePreviewMockProps) => {
    // If there is a parse error, we show a fallback or just empty
    if (error) {
        return (
            <div
                style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                    color: "var(--color-text-muted)"
                }}
            >
                <Text variant="body-sm">Risolvi gli errori JSON per visualizzare l'anteprima.</Text>
            </div>
        );
    }

    // Attempt to extract some dummy variables from the parsed config
    // We assume the V2 logic might use `colors` or `typography` keys
    const rawColors = parsedConfig?.colors || {};
    const primaryColor = rawColors.primary || "var(--color-primary, #0066cc)";
    const backgroundColor = rawColors.background || "var(--color-surface, #ffffff)";
    const textColor = rawColors.text || "var(--color-text, #111827)";
    const borderRadius = parsedConfig?.shape?.borderRadius || "8px";

    return (
        <div
            style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "32px",
                backgroundColor: "var(--color-background, #f3f4f6)",
                overflowY: "auto",
                borderRadius: "8px",
                border: "1px dashed var(--color-border)"
            }}
        >
            <div style={{ alignSelf: "flex-start", marginBottom: "24px" }}>
                <Text variant="title-sm" weight={600} colorVariant="primary">
                    Anteprima Live
                </Text>
                <Text variant="caption" colorVariant="muted">
                    Simulazione dei token sul componente.
                </Text>
            </div>

            <div
                style={{
                    width: "100%",
                    maxWidth: "320px",
                    backgroundColor: backgroundColor,
                    color: textColor,
                    borderRadius: borderRadius,
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    transition: "all 0.3s ease"
                }}
            >
                <Text variant="title-md" weight={700} style={{ color: textColor }}>
                    Contenuto in Evidenza
                </Text>
                <Text variant="body-sm" style={{ color: textColor, opacity: 0.8 }}>
                    Questo testo simula come apparirà un paragrafo sul dispositivo finale
                    utilizzando i colori di background e testo definiti nel JSON.
                </Text>
                <button
                    style={{
                        marginTop: "8px",
                        backgroundColor: primaryColor,
                        color: "#ffffff",
                        padding: "10px 16px",
                        border: "none",
                        borderRadius: borderRadius,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "opacity 0.2s"
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                    Azione Primaria
                </button>
            </div>
        </div>
    );
};
