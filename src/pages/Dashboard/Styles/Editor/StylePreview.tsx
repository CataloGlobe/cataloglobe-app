import React, { useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { StyleTokenModel } from "./StyleTokenModel";
import { IconSearch, IconShoppingBag, IconHome, IconHeart, IconUser } from "@tabler/icons-react";

type StylePreviewProps = {
    model: StyleTokenModel;
};

export const StylePreview = ({ model }: StylePreviewProps) => {
    const { colors, typography, header, navigation, card } = model;

    // Toggle for desktop/mobile mock canvas width
    const [viewMode, setViewMode] = useState<"mobile" | "desktop">("mobile");

    // CSS Variables for the preview scope
    const previewStyle = {
        "--preview-bg": colors.pageBackground,
        "--preview-primary": colors.primary,
        "--preview-header-bg": colors.headerBackground,
        "--preview-header-radius": `${header.imageBorderRadiusPx}px`,
        "--preview-font-family":
            typography.fontFamily === "poppins"
                ? "'Poppins', sans-serif"
                : typography.fontFamily === "playfair"
                  ? "'Playfair Display', serif"
                  : "'Inter', sans-serif",
        "--preview-card-radius": card.radius === "sharp" ? "0px" : "14px",
        // Dynamic text colors based on background perceived lightness could be added,
        // using simple defaults for now.
        "--preview-text-main": "#111827",
        "--preview-text-muted": "#6b7280",
        fontFamily: "var(--preview-font-family, sans-serif)"
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "32px",
                margin: "0 auto",
                width: "100%"
            }}
        >
            {/* View Mode Toggle */}
            <div
                style={{
                    marginBottom: "24px",
                    display: "flex",
                    gap: "8px",
                    backgroundColor: "var(--color-surface)",
                    borderRadius: "8px",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
            >
                <button
                    onClick={() => setViewMode("mobile")}
                    style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background:
                            viewMode === "mobile" ? "var(--color-bg-subtle)" : "transparent",
                        fontWeight: viewMode === "mobile" ? 600 : 400,
                        color:
                            viewMode === "mobile" ? "var(--color-text)" : "var(--color-text-muted)",
                        cursor: "pointer",
                        fontSize: "14px"
                    }}
                >
                    Mobile
                </button>
                <button
                    onClick={() => setViewMode("desktop")}
                    style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background:
                            viewMode === "desktop" ? "var(--color-bg-subtle)" : "transparent",
                        fontWeight: viewMode === "desktop" ? 600 : 400,
                        color:
                            viewMode === "desktop"
                                ? "var(--color-text)"
                                : "var(--color-text-muted)",
                        cursor: "pointer",
                        fontSize: "14px"
                    }}
                >
                    Desktop
                </button>
            </div>

            {/* Neutral Canvas Container */}
            <div
                style={{
                    ...previewStyle,
                    width: "100%",
                    maxWidth: viewMode === "mobile" ? "390px" : "900px",
                    backgroundColor: "var(--preview-bg, #ffffff)",
                    borderRadius: "16px",
                    boxShadow:
                        "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "max-width 0.3s ease-in-out"
                }}
            >
                {/* Scrollable Content Engine */}
                <div
                    style={{
                        minHeight: "600px",
                        display: "flex",
                        flexDirection: "column",
                        backgroundColor: "transparent"
                    }}
                >
                    {/* Simple Header */}
                    <header
                        style={{
                            backgroundColor: "var(--preview-header-bg)",
                            padding: "24px 20px",
                            borderBottomLeftRadius: "var(--preview-header-radius)",
                            borderBottomRightRadius: "var(--preview-header-radius)",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                            zIndex: 10
                        }}
                    >
                        <Text
                            variant="title-md"
                            weight={700}
                            style={{ color: "var(--preview-text-main)" }}
                        >
                            Catalogo di esempio
                        </Text>
                    </header>

                    {/* Scrollable Content Engine */}
                    <div
                        style={{
                            padding: "24px 20px",
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: "32px"
                        }}
                    >
                        {/* Featured Block */}
                        <div
                            style={{
                                backgroundColor: "var(--preview-primary)",
                                backgroundImage:
                                    "radial-gradient(circle at top right, rgba(255,255,255,0.15), transparent)",
                                padding: "32px 24px",
                                borderRadius: "12px",
                                color: "#ffffff",
                                display: "flex",
                                flexDirection: "column",
                                gap: "12px"
                            }}
                        >
                            <Text variant="title-sm" weight={700} style={{ color: "inherit" }}>
                                Contenuto in evidenza
                            </Text>
                            <Text variant="body-sm" style={{ color: "inherit", opacity: 0.9 }}>
                                Questa è un'anteprima. I contenuti reali dipendono dal tuo catalogo.
                            </Text>
                            <div style={{ marginTop: "8px" }}>
                                <button
                                    style={{
                                        backgroundColor: "#ffffff",
                                        color: "var(--preview-primary)",
                                        border: "none",
                                        borderRadius: "6px",
                                        padding: "8px 16px",
                                        fontWeight: 600,
                                        fontSize: "14px",
                                        cursor: "pointer"
                                    }}
                                >
                                    Azione primaria
                                </button>
                            </div>
                        </div>

                        {/* Navigation Section */}
                        <div
                            style={{
                                display: "flex",
                                gap: "12px",
                                overflowX: "auto",
                                paddingBottom: "4px"
                            }}
                        >
                            {["Sezione A", "Sezione B", "Sezione C"].map((cat, i) => {
                                const isActive = i === 0;

                                if (navigation.style === "pill") {
                                    return (
                                        <div
                                            key={cat}
                                            style={{
                                                padding: "8px 20px",
                                                backgroundColor: isActive
                                                    ? "var(--preview-primary)"
                                                    : "#f3f4f6",
                                                color: isActive
                                                    ? "#ffffff"
                                                    : "var(--preview-text-main)",
                                                borderRadius: "999px",
                                                fontSize: "14px",
                                                fontWeight: isActive ? 600 : 400,
                                                whiteSpace: "nowrap"
                                            }}
                                        >
                                            {cat}
                                        </div>
                                    );
                                } else if (navigation.style === "tabs") {
                                    return (
                                        <div
                                            key={cat}
                                            style={{
                                                padding: "8px 16px",
                                                borderBottom: isActive
                                                    ? "2px solid var(--preview-primary)"
                                                    : "2px solid transparent",
                                                color: isActive
                                                    ? "var(--preview-primary)"
                                                    : "var(--preview-text-muted)",
                                                fontSize: "14px",
                                                fontWeight: isActive ? 600 : 400,
                                                whiteSpace: "nowrap"
                                            }}
                                        >
                                            {cat}
                                        </div>
                                    );
                                } else {
                                    // minimal
                                    return (
                                        <div
                                            key={cat}
                                            style={{
                                                padding: "8px 12px",
                                                color: isActive
                                                    ? "var(--preview-text-main)"
                                                    : "var(--preview-text-muted)",
                                                fontSize: "16px",
                                                fontWeight: isActive ? 700 : 400,
                                                whiteSpace: "nowrap"
                                            }}
                                        >
                                            {cat}
                                        </div>
                                    );
                                }
                            })}
                        </div>

                        {/* Card Layout Section */}
                        <div
                            style={{
                                display: card.layout === "grid" ? "grid" : "flex",
                                gridTemplateColumns:
                                    card.layout === "grid"
                                        ? viewMode === "desktop"
                                            ? "repeat(3, 1fr)"
                                            : "repeat(2, 1fr)"
                                        : "none",
                                flexDirection: card.layout === "grid" ? "row" : "column",
                                gap: "20px"
                            }}
                        >
                            {[1, 2, 3, 4].map(item => (
                                <div
                                    key={item}
                                    style={{
                                        backgroundColor: "#ffffff",
                                        borderRadius: "var(--preview-card-radius)",
                                        overflow: "hidden",
                                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                        display: card.layout === "list" ? "flex" : "block",
                                        flexDirection:
                                            card.layout === "list" &&
                                            card.image.position === "right"
                                                ? "row-reverse"
                                                : "row",
                                        border: "1px solid #f3f4f6"
                                    }}
                                >
                                    {card.image.mode === "show" && (
                                        <div
                                            style={{
                                                height: card.layout === "grid" ? "140px" : "auto",
                                                width: card.layout === "grid" ? "100%" : "120px",
                                                backgroundColor: "#e5e7eb",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: "40px",
                                                    height: "40px",
                                                    backgroundColor: "#d1d5db",
                                                    borderRadius: "4px"
                                                }}
                                            />
                                        </div>
                                    )}
                                    <div
                                        style={{
                                            padding: "16px",
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "8px"
                                        }}
                                    >
                                        <div>
                                            <div
                                                style={{
                                                    fontSize: "15px",
                                                    fontWeight: 600,
                                                    color: "#111827"
                                                }}
                                            >
                                                Elemento {item}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "13px",
                                                    color: "#6b7280",
                                                    marginTop: "2px"
                                                }}
                                            >
                                                Descrizione breve...
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                marginTop: "auto",
                                                paddingTop: "8px"
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: "14px",
                                                    fontWeight: 600,
                                                    color: "var(--preview-text-main)"
                                                }}
                                            >
                                                Valore
                                            </div>

                                            <div
                                                style={{
                                                    padding: "4px 12px",
                                                    borderRadius: "4px",
                                                    backgroundColor: "transparent",
                                                    color: "var(--preview-primary)",
                                                    border: "1px solid var(--preview-primary)",
                                                    fontSize: "12px",
                                                    fontWeight: 600
                                                }}
                                            >
                                                Dettagli
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
