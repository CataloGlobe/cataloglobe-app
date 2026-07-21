// Documento react-pdf del menu (Stage 2 — render skeleton).
// Consuma MenuPdfData già risolto: nessun fetch, nessuna logica dati.
// Palette neutra hardcoded e font Helvetica built-in: il tema da brand.tokens
// arriva in Stage 3; allergeni/caratteristiche in Stage 4; foto in Stage 5.
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { MenuPdfCategory, MenuPdfData, MenuPdfProduct } from "./menuPdfTypes";

const COLORS = {
    background: "#FFFFFF",
    text: "#1a1a1a",
    muted: "#8a8a8a",
    hairline: "#e5e5e5"
};

const PAGE_MARGIN = 40;
// Spazio minimo richiesto sotto un header di categoria perché non resti
// orfano a fine pagina: ~header + prima riga prodotto.
const CATEGORY_MIN_PRESENCE = 72;

const styles = StyleSheet.create({
    // ── Copertina ─────────────────────────────────────────────────────────
    coverPage: {
        backgroundColor: COLORS.background,
        padding: PAGE_MARGIN,
        justifyContent: "center",
        alignItems: "center"
    },
    coverActivity: {
        fontFamily: "Helvetica",
        fontSize: 11,
        letterSpacing: 3,
        color: COLORS.muted,
        textTransform: "uppercase",
        marginBottom: 18
    },
    coverRule: {
        width: 48,
        height: 1,
        backgroundColor: COLORS.text,
        marginBottom: 28
    },
    coverCatalog: {
        fontFamily: "Helvetica-Bold",
        fontSize: 32,
        color: COLORS.text,
        textAlign: "center",
        marginBottom: 28
    },
    coverAddress: {
        fontFamily: "Helvetica",
        fontSize: 10,
        color: COLORS.muted,
        textAlign: "center"
    },

    // ── Pagine menù ───────────────────────────────────────────────────────
    menuPage: {
        backgroundColor: COLORS.background,
        paddingTop: PAGE_MARGIN,
        paddingHorizontal: PAGE_MARGIN,
        paddingBottom: PAGE_MARGIN + 26,
        color: COLORS.text
    },
    runningHeader: {
        flexDirection: "row",
        justifyContent: "center",
        borderBottomWidth: 1,
        borderBottomColor: COLORS.hairline,
        paddingBottom: 8,
        marginBottom: 20
    },
    runningHeaderText: {
        fontFamily: "Helvetica",
        fontSize: 8,
        letterSpacing: 1.5,
        color: COLORS.muted,
        textTransform: "uppercase"
    },

    categorySection: {
        marginBottom: 22
    },
    categoryHeader: {
        marginBottom: 10
    },
    categoryName: {
        fontFamily: "Helvetica-Bold",
        fontSize: 14,
        letterSpacing: 1,
        color: COLORS.text,
        textTransform: "uppercase",
        marginBottom: 4
    },
    categoryNameSub: {
        fontFamily: "Helvetica-Bold",
        fontSize: 11,
        letterSpacing: 0.5,
        color: COLORS.muted,
        textTransform: "uppercase",
        marginBottom: 4
    },
    categoryRule: {
        height: 1,
        backgroundColor: COLORS.hairline
    },

    productRow: {
        marginBottom: 12
    },
    productLine: {
        flexDirection: "row",
        alignItems: "flex-end"
    },
    productName: {
        fontFamily: "Helvetica-Bold",
        fontSize: 11,
        color: COLORS.text,
        flexShrink: 1
    },
    productPrice: {
        fontFamily: "Helvetica-Bold",
        fontSize: 11,
        color: COLORS.text,
        marginLeft: 12
    },
    productSpacer: {
        flexGrow: 1
    },
    productDescription: {
        fontFamily: "Helvetica",
        fontSize: 9,
        lineHeight: 1.45,
        color: COLORS.muted,
        marginTop: 3
    },
    formatLine: {
        flexDirection: "row",
        alignItems: "flex-end",
        marginTop: 3
    },
    formatName: {
        fontFamily: "Helvetica",
        fontSize: 9.5,
        color: COLORS.muted,
        flexShrink: 1
    },
    formatPrice: {
        fontFamily: "Helvetica",
        fontSize: 9.5,
        color: COLORS.text,
        marginLeft: 12
    },

    footer: {
        position: "absolute",
        left: PAGE_MARGIN,
        right: PAGE_MARGIN,
        bottom: 22,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 1,
        borderTopColor: COLORS.hairline,
        paddingTop: 6
    },
    footerText: {
        fontFamily: "Helvetica",
        fontSize: 8,
        color: COLORS.muted
    }
});

function ProductRow({ product }: { product: MenuPdfProduct }) {
    return (
        <View style={styles.productRow} wrap={false}>
            <View style={styles.productLine}>
                <Text style={styles.productName}>{product.name}</Text>
                <View style={styles.productSpacer} />
                {product.priceLabel ? (
                    <Text style={styles.productPrice}>{product.priceLabel}</Text>
                ) : null}
            </View>
            {product.description ? (
                <Text style={styles.productDescription}>{product.description}</Text>
            ) : null}
            {product.formats.map(format => (
                <View key={format.name} style={styles.formatLine}>
                    <Text style={styles.formatName}>{format.name}</Text>
                    <View style={styles.productSpacer} />
                    <Text style={styles.formatPrice}>{format.priceLabel}</Text>
                </View>
            ))}
        </View>
    );
}

function CategorySection({ category }: { category: MenuPdfCategory }) {
    const isSubCategory = category.level > 0;
    return (
        <View style={styles.categorySection}>
            {/* minPresenceAhead: se sotto l'header non c'è spazio almeno per la
                prima riga prodotto, l'header passa alla pagina successiva. */}
            <View style={styles.categoryHeader} minPresenceAhead={CATEGORY_MIN_PRESENCE}>
                <Text style={isSubCategory ? styles.categoryNameSub : styles.categoryName}>
                    {category.name}
                </Text>
                {!isSubCategory ? <View style={styles.categoryRule} /> : null}
            </View>
            {category.products.map(product => (
                <ProductRow key={product.id} product={product} />
            ))}
        </View>
    );
}

export function MenuPdfDocument({ data }: { data: MenuPdfData }) {
    const runningTitle = [data.meta.activityName, data.meta.catalogName]
        .filter(Boolean)
        .join("  ·  ");

    return (
        <Document title={`${data.meta.catalogName} — ${data.meta.activityName}`}>
            {/* Copertina: nessun footer, nessun numero pagina */}
            <Page size="A4" style={styles.coverPage}>
                <Text style={styles.coverActivity}>{data.meta.activityName}</Text>
                <View style={styles.coverRule} />
                <Text style={styles.coverCatalog}>{data.meta.catalogName}</Text>
                {data.meta.address ? (
                    <Text style={styles.coverAddress}>{data.meta.address}</Text>
                ) : null}
            </Page>

            {/* Pagine menù */}
            <Page size="A4" style={styles.menuPage} wrap>
                <View style={styles.runningHeader} fixed>
                    <Text style={styles.runningHeaderText}>{runningTitle}</Text>
                </View>

                {data.categories.map(category => (
                    <CategorySection key={category.id} category={category} />
                ))}

                <View style={styles.footer} fixed>
                    <Text style={styles.footerText}>{data.meta.activityName}</Text>
                    <Text
                        style={styles.footerText}
                        render={({ pageNumber, totalPages }) =>
                            `Pagina ${pageNumber} di ${totalPages}`
                        }
                    />
                </View>
            </Page>
        </Document>
    );
}
