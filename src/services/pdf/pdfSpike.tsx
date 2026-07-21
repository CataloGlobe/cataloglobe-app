// TEMP SPIKE — rimuovere in Stage 6.
// Prova end-to-end @react-pdf/renderer client-side: testo, vettoriale (Svg),
// font TTF custom embeddato. Nessun dato reale, nessun layout menu.
// Caricato SOLO via import() dinamico: non deve finire nel bundle principale.
import { pdf, Document, Page, Text, View, Svg, Rect, Font, StyleSheet } from "@react-pdf/renderer";
import mulishTtfUrl from "@/assets/pdf-spike/mulish-700.ttf?url";

Font.register({
    family: "Mulish",
    fonts: [{ src: mulishTtfUrl, fontWeight: 700 }]
});

const styles = StyleSheet.create({
    page: {
        padding: 48,
        backgroundColor: "#FFFFFF"
    },
    title: {
        fontFamily: "Mulish",
        fontWeight: 700,
        fontSize: 24,
        color: "#6366f1",
        marginBottom: 12
    },
    body: {
        fontSize: 12,
        color: "#1a1a1a",
        lineHeight: 1.5,
        marginBottom: 4
    },
    rectWrap: {
        marginTop: 24
    }
});

function SpikeDocument() {
    return (
        <Document title="CataloGlobe PDF Spike">
            <Page size="A4" style={styles.page}>
                <Text style={styles.title}>CataloGlobe — Spike react-pdf</Text>
                <Text style={styles.body}>
                    Questa riga usa il font di default (Helvetica) per confronto.
                </Text>
                <Text style={styles.body}>
                    Accenti e simboli: à è ì ò ù — € 12,50 — "virgolette".
                </Text>
                <Text style={[styles.body, { fontFamily: "Mulish", fontWeight: 700 }]}>
                    Questa riga usa Mulish 700 embeddato da TTF locale.
                </Text>
                <View style={styles.rectWrap}>
                    <Svg width={200} height={80}>
                        <Rect x={0} y={0} width={200} height={80} rx={8} fill="#6366f1" />
                        <Rect x={12} y={12} width={80} height={24} rx={4} fill="#FFFFFF" />
                    </Svg>
                </View>
            </Page>
        </Document>
    );
}

/** Genera il blob senza scaricarlo (usato anche per verifica automatica). */
export async function generateSpikeBlob(): Promise<Blob> {
    return pdf(<SpikeDocument />).toBlob();
}

/** Genera e scarica il PDF spike. */
export async function runSpike(): Promise<void> {
    const blob = await generateSpikeBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "spike-react-pdf.pdf";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
