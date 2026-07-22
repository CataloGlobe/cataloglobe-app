// Documento react-pdf del menu (Stage 3 — theming dai token stile).
// Consuma MenuPdfData già risolto: nessun fetch, nessuna logica dati.
// Colori/tipografia/radius da PdfTheme (derivato da brand.tokens); elementi
// testuali di copertina e running header gated dai toggle tokens.header.
// Logo/cover-image/QR → Stage 3b; allergeni → Stage 4; foto → Stage 5.
import {
  Document,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type {
  MenuPdfCategory,
  MenuPdfCharacteristic,
  MenuPdfData,
  MenuPdfProduct,
} from "./menuPdfTypes";
import { buildPdfTheme, type PdfTheme } from "./pdfTheme";
import { resolvePdfFontFamily } from "./pdfFonts";
import {
  PdfIcon,
  allergenIconGeometry,
  characteristicIconGeometry,
} from "./pdfIcons";
import { ALL_ALLERGENS } from "./allergenEuNumbers";

/** Asset immagine già pre-fetchati come data-URL (o null): il documento non
 *  fa MAI fetch a runtime — pipeline in renderMenuPdf/prefetchPdfImage. */
export type MenuPdfAssets = {
  logoDataUrl: string | null;
  coverDataUrl: string | null;
  qrDataUrl: string | null;
  /** Foto prodotto (Stage 5, flag includePhotos): productId → data-URL.
   *  Mappa vuota/assente = niente thumbnail. */
  productImages?: Record<string, string>;
};

const EMPTY_ASSETS: MenuPdfAssets = {
  logoDataUrl: null,
  coverDataUrl: null,
  qrDataUrl: null,
};

const PAGE_MARGIN = 40;

/** Mix solido fg-su-bg per la tinta del segnaposto foto (react-pdf preferisce
 *  hex pieni alle alpha — stessa ricetta di pdfTheme, locale per non toccare il
 *  theming condiviso). Fallback a fg se un hex non è parsabile. */
function mixHexColor(bgHex: string, fgHex: string, amount: number): string {
  const parse = (hex: string): { r: number; g: number; b: number } | null => {
    const clean = hex.trim().replace(/^#/, "");
    const full =
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  };
  const bg = parse(bgHex);
  const fg = parse(fgHex);
  if (!bg || !fg) return fgHex;
  const ch = (b: number, f: number) => Math.round(b + (f - b) * amount);
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(ch(bg.r, fg.r))}${to2(ch(bg.g, fg.g))}${to2(ch(bg.b, fg.b))}`;
}

/** Segnaposto foto: glifo "posate" (forchetta+coltello) replicato da lucide
 *  `Utensils` — simbolo ristorazione per i prodotti senza immagine.
 *  Icona stroke-only: non passa dall'adapter fill-only PdfIcon, disegnata qui. */
function PdfUtensilsPlaceholder({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  const strokeProps = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" {...strokeProps} />
      <Path d="M7 2v20" {...strokeProps} />
      <Path
        d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"
        {...strokeProps}
      />
    </Svg>
  );
}

function createStyles(theme: PdfTheme, fontFamily: string) {
  return StyleSheet.create({
    // ── Copertina ─────────────────────────────────────────────────────
    coverPage: {
      backgroundColor: theme.pageBg,
    },
    // Band cover-image full-bleed: altezza fissa, crop via objectFit cover.
    coverBand: {
      height: 220,
      overflow: "hidden",
    },
    coverBandImage: {
      width: "100%",
      height: 220,
      objectFit: "cover",
    },
    coverContent: {
      flexGrow: 1,
      padding: PAGE_MARGIN,
      justifyContent: "center",
      alignItems: "center",
    },
    coverLogo: {
      width: 88,
      height: 88,
      objectFit: "contain",
      borderRadius: theme.radius / 2,
      marginBottom: 22,
    },
    coverQrBlock: {
      alignItems: "center",
      paddingBottom: PAGE_MARGIN,
    },
    coverQr: {
      width: 84,
      height: 84,
      marginBottom: 8,
    },
    coverQrCaption: {
      fontFamily,
      fontSize: 8,
      letterSpacing: 1.5,
      color: theme.muted,
      textTransform: "uppercase",
    },
    coverActivity: {
      fontFamily,
      fontSize: 11,
      letterSpacing: 3,
      color: theme.muted,
      textTransform: "uppercase",
      marginBottom: 18,
    },
    coverRule: {
      width: 48,
      height: 4,
      backgroundColor: theme.primary,
      borderRadius: theme.radius / 5,
      marginBottom: 28,
    },
    coverCatalog: {
      fontFamily,
      fontWeight: 700,
      fontSize: 32,
      color: theme.ink,
      textAlign: "center",
      marginBottom: 28,
    },
    coverAddress: {
      fontFamily,
      fontSize: 10,
      color: theme.muted,
      textAlign: "center",
    },

    // ── Pagine menù ───────────────────────────────────────────────────
    menuPage: {
      backgroundColor: theme.pageBg,
      paddingTop: PAGE_MARGIN,
      paddingHorizontal: PAGE_MARGIN,
      paddingBottom: PAGE_MARGIN + 26,
      color: theme.ink,
    },
    runningHeader: {
      flexDirection: "row",
      justifyContent: "center",
      borderBottomWidth: 1,
      borderBottomColor: theme.primarySoft,
      paddingBottom: 8,
      marginBottom: 20,
    },
    runningHeaderText: {
      fontFamily,
      fontSize: 8,
      letterSpacing: 1.5,
      color: theme.muted,
      textTransform: "uppercase",
    },

    categorySection: {
      marginBottom: 22,
    },
    categoryHeader: {
      marginBottom: 10,
    },
    categoryName: {
      fontFamily,
      fontWeight: 700,
      fontSize: 14,
      letterSpacing: 1,
      color: theme.primary,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    categoryNameSub: {
      fontFamily,
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: 0.5,
      color: theme.muted,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    categoryRule: {
      height: 1,
      backgroundColor: theme.primarySoft,
    },

    productRow: {
      marginBottom: 12,
    },
    // photoMode: colonna gutter fissa su OGNI riga (thumb o vuota) cosi il
    // bordo sinistro del contenuto e' identico riga per riga.
    productRowPhotoMode: {
      flexDirection: "row",
    },
    productThumbBox: {
      width: 52,
      height: 52,
      overflow: "hidden",
      borderRadius: theme.radius / 3,
      marginRight: 10,
      flexShrink: 0,
    },
    productThumbImage: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
    },
    // Segnaposto per i prodotti senza foto in photoMode: stessa dimensione/
    // radius della thumb, tinta tenue del brand + glifo sbiadito. Evita il
    // buco bianco che sembrerebbe un'immagine non caricata.
    productThumbPlaceholder: {
      width: 52,
      height: 52,
      borderRadius: theme.radius / 3,
      marginRight: 10,
      flexShrink: 0,
      backgroundColor: mixHexColor(theme.pageBg, theme.primary, 0.07),
      alignItems: "center",
      justifyContent: "center",
    },
    productContent: {
      flexGrow: 1,
      flexShrink: 1,
    },
    productLine: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    productName: {
      fontFamily,
      fontWeight: 700,
      fontSize: 11,
      color: theme.ink,
      flexShrink: 1,
    },
    // Sub-line icone sotto la descrizione: allergeni | caratteristiche,
    // tutte in primary come sul menu online (Stage 4c: via i numeri inline).
    productIconsLine: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
    },
    productIconGap: {
      marginRight: 3,
    },
    iconSeparator: {
      width: 1,
      height: 9,
      backgroundColor: theme.primarySoft,
      marginLeft: 3,
      marginRight: 6,
    },
    productPrice: {
      fontFamily,
      fontWeight: 700,
      fontSize: 11,
      color: theme.ink,
      marginLeft: 12,
    },
    productSpacer: {
      flexGrow: 1,
    },
    productDescription: {
      fontFamily,
      fontSize: 9,
      lineHeight: 1.45,
      color: theme.muted,
      marginTop: 3,
    },
    formatLine: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginTop: 3,
    },
    formatName: {
      fontFamily,
      fontSize: 9.5,
      color: theme.muted,
      flexShrink: 1,
    },
    formatPrice: {
      fontFamily,
      fontSize: 9.5,
      color: theme.ink,
      marginLeft: 12,
    },

    // ── Legenda ───────────────────────────────────────────────────────
    legendSection: {
      marginTop: 18,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: theme.primarySoft,
    },
    legendTitle: {
      fontFamily,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: 1.5,
      color: theme.primary,
      textTransform: "uppercase",
      marginBottom: 10,
    },
    legendSubtitle: {
      fontFamily,
      fontWeight: 700,
      fontSize: 9,
      letterSpacing: 1,
      color: theme.primary,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    legendCharsBlock: {
      marginTop: 12,
    },
    // Griglia "chiave" a 2 colonne: icona sempre visibile + label.
    legendGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    legendItem: {
      width: "50%",
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 5,
      paddingRight: 10,
    },
    legendLabel: {
      fontFamily,
      fontSize: 8.5,
      color: theme.ink,
      marginLeft: 6,
    },
    legendLabelMuted: {
      fontFamily,
      fontSize: 8.5,
      color: theme.muted,
      marginLeft: 6,
    },
    footer: {
      position: "absolute",
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
      bottom: 22,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: theme.primarySoft,
      paddingTop: 6,
    },
    footerText: {
      fontFamily,
      fontSize: 8,
      color: theme.muted,
    },
  });
}

type Styles = ReturnType<typeof createStyles>;

function ProductRow({
  product,
  styles,
  theme,
  thumbSrc,
  photoMode,
}: {
  product: MenuPdfProduct;
  styles: Styles;
  theme: PdfTheme;
  thumbSrc: string | null;
  photoMode: boolean;
}) {
  // Icone risolte a monte: servono i conteggi per decidere il separatore.
  const allergenIcons = [...product.allergens]
    .sort((a, b) => a.euNumber - b.euNumber)
    .map((a) => ({ key: a.code, geometry: allergenIconGeometry(a.code) }))
    .filter(
      (
        x,
      ): x is {
        key: string;
        geometry: NonNullable<ReturnType<typeof allergenIconGeometry>>;
      } => x.geometry !== null,
    );
  const characteristicIcons = product.characteristics
    .map((c) => ({ key: c.code, geometry: characteristicIconGeometry(c.icon) }))
    .filter(
      (
        x,
      ): x is {
        key: string;
        geometry: NonNullable<ReturnType<typeof characteristicIconGeometry>>;
      } => x.geometry !== null,
    );

  // Cover-crop centrato sul focal point salvato quando presente (fedeltà
  // piena zoom/fillMode di FramedMedia rimandata — v1 esperimento).
  const framing = product.imageFraming;
  const objectPosition = framing
    ? `${Math.round(framing.focalX * 100)}% ${Math.round(framing.focalY * 100)}%`
    : "50% 50%";

  const content = (
    <>
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
      {allergenIcons.length > 0 || characteristicIcons.length > 0 ? (
        <View style={styles.productIconsLine}>
          {allergenIcons.map((icon) => (
            <View key={`al-${icon.key}`} style={styles.productIconGap}>
              <PdfIcon
                geometry={icon.geometry}
                size={9}
                color={theme.primary}
              />
            </View>
          ))}
          {allergenIcons.length > 0 && characteristicIcons.length > 0 ? (
            <View style={styles.iconSeparator} />
          ) : null}
          {characteristicIcons.map((icon) => (
            <View key={`ch-${icon.key}`} style={styles.productIconGap}>
              <PdfIcon
                geometry={icon.geometry}
                size={9}
                color={theme.primary}
              />
            </View>
          ))}
        </View>
      ) : null}
      {product.formats.map((format) => (
        <View key={format.name} style={styles.formatLine}>
          <Text style={styles.formatName}>{format.name}</Text>
          <View style={styles.productSpacer} />
          <Text style={styles.formatPrice}>{format.priceLabel}</Text>
        </View>
      ))}
    </>
  );

  return (
    <View style={styles.productRow} wrap={false}>
      {photoMode ? (
        <View style={styles.productRowPhotoMode}>
          {thumbSrc ? (
            <View style={styles.productThumbBox}>
              <Image
                style={[styles.productThumbImage, { objectPosition }]}
                src={thumbSrc}
              />
            </View>
          ) : (
            <View style={styles.productThumbPlaceholder}>
              <PdfUtensilsPlaceholder size={14} color={theme.muted} />
            </View>
          )}
          <View style={styles.productContent}>{content}</View>
        </View>
      ) : (
        content
      )}
    </View>
  );
}

function CategorySection({
  category,
  styles,
  theme,
  productImages,
  photoMode,
}: {
  category: MenuPdfCategory;
  styles: Styles;
  theme: PdfTheme;
  productImages: Record<string, string>;
  photoMode: boolean;
}) {
  const isSubCategory = category.level > 0;
  const [firstProduct, ...restProducts] = category.products;
  return (
    <View style={styles.categorySection}>
      {/* Header + PRIMO prodotto in un blocco indivisibile: l'header non
                può mai restare orfano a fine pagina (minPresenceAhead non regge
                per categorie a prodotto singolo — fix Stage 3c). */}
      <View wrap={false}>
        <View style={styles.categoryHeader}>
          <Text
            style={isSubCategory ? styles.categoryNameSub : styles.categoryName}
          >
            {category.name}
          </Text>
          {!isSubCategory ? <View style={styles.categoryRule} /> : null}
        </View>
        {firstProduct ? (
          <ProductRow
            product={firstProduct}
            styles={styles}
            theme={theme}
            thumbSrc={productImages[firstProduct.id] ?? null}
            photoMode={photoMode}
          />
        ) : null}
      </View>
      {restProducts.map((product) => (
        <ProductRow
          key={product.id}
          product={product}
          styles={styles}
          theme={theme}
          thumbSrc={productImages[product.id] ?? null}
          photoMode={photoMode}
        />
      ))}
    </View>
  );
}

/** Caratteristiche usate nel menù (prodotti + varianti), dedup per code. */
function collectUsedCharacteristics(
  data: MenuPdfData,
): MenuPdfCharacteristic[] {
  const byCode = new Map<string, MenuPdfCharacteristic>();
  for (const category of data.categories) {
    for (const product of category.products) {
      for (const characteristic of [
        ...product.characteristics,
        ...product.variants.flatMap((v) => v.characteristics),
      ]) {
        if (!byCode.has(characteristic.code))
          byCode.set(characteristic.code, characteristic);
      }
    }
  }
  return Array.from(byCode.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

function LegendSection({
  data,
  styles,
  theme,
}: {
  data: MenuPdfData;
  styles: Styles;
  theme: PdfTheme;
}) {
  const usedCharacteristics = collectUsedCharacteristics(data);
  if (data.allergenLegend.length === 0 && usedCharacteristics.length === 0)
    return null;

  const presentAllergenCodes = new Set(data.allergenLegend.map((a) => a.code));

  return (
    <View style={styles.legendSection}>
      {data.allergenLegend.length > 0 ? (
        <View wrap={false}>
          <Text style={styles.legendTitle}>Legenda</Text>
          <Text style={styles.legendSubtitle}>Allergeni</Text>
          <View style={styles.legendGrid}>
            {/* Tutti e 14 gli allergeni UE: presenti nel menù in
                            evidenza, assenti attenuati. Nessun numero visibile. */}
            {ALL_ALLERGENS.map((allergen) => {
              const isPresent = presentAllergenCodes.has(allergen.code);
              const geometry = allergenIconGeometry(allergen.code);
              return (
                <View key={allergen.code} style={styles.legendItem}>
                  {geometry ? (
                    <PdfIcon
                      geometry={geometry}
                      size={11}
                      color={isPresent ? theme.primary : theme.muted}
                    />
                  ) : null}
                  <Text
                    style={
                      isPresent ? styles.legendLabel : styles.legendLabelMuted
                    }
                  >
                    {allergen.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      {usedCharacteristics.length > 0 ? (
        <View wrap={false} style={styles.legendCharsBlock}>
          {data.allergenLegend.length === 0 ? (
            <Text style={styles.legendTitle}>Legenda</Text>
          ) : null}
          <Text style={styles.legendSubtitle}>Caratteristiche</Text>
          <View style={styles.legendGrid}>
            {usedCharacteristics.map((characteristic) => {
              const geometry = characteristicIconGeometry(characteristic.icon);
              return (
                <View key={characteristic.code} style={styles.legendItem}>
                  {geometry ? (
                    <PdfIcon
                      geometry={geometry}
                      size={11}
                      color={theme.primary}
                    />
                  ) : null}
                  <Text style={styles.legendLabel}>{characteristic.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function MenuPdfDocument({
  data,
  assets = EMPTY_ASSETS,
}: {
  data: MenuPdfData;
  assets?: MenuPdfAssets;
}) {
  const theme = buildPdfTheme(data.brand.tokens);
  const fontFamily = resolvePdfFontFamily(theme.fontFamily);
  const styles = createStyles(theme, fontFamily);
  const header = data.brand.tokens.header;
  const productImages = assets.productImages ?? {};
  // photoMode deriva da productImages non vuoto: includePhotos on ma zero
  // thumbnail prodotte (nessuna foto nel catalogo, o tutte fallite) →
  // niente gutter riservato, layout testo-only pieno-larghezza.
  const photoMode = Object.keys(productImages).length > 0;

  const showCoverBand = header.showCoverImage && assets.coverDataUrl !== null;
  const showLogo = header.showLogo && assets.logoDataUrl !== null;

  const runningTitle = [
    header.showActivityName ? data.meta.activityName : null,
    header.showCatalogName ? data.meta.catalogName : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Document title={`${data.meta.catalogName} — ${data.meta.activityName}`}>
      {/* Copertina: nessun footer, nessun numero pagina */}
      <Page size="A4" style={styles.coverPage}>
        {showCoverBand ? (
          <View style={styles.coverBand}>
            <Image
              style={styles.coverBandImage}
              src={assets.coverDataUrl as string}
            />
          </View>
        ) : null}
        <View style={styles.coverContent}>
          {showLogo ? (
            <Image
              style={styles.coverLogo}
              src={assets.logoDataUrl as string}
            />
          ) : null}
          {header.showActivityName ? (
            <Text style={styles.coverActivity}>{data.meta.activityName}</Text>
          ) : null}
          <View style={styles.coverRule} />
          {header.showCatalogName ? (
            <Text style={styles.coverCatalog}>{data.meta.catalogName}</Text>
          ) : null}
          {header.showAddress && data.meta.address ? (
            <Text style={styles.coverAddress}>{data.meta.address}</Text>
          ) : null}
        </View>
        {assets.qrDataUrl ? (
          <View style={styles.coverQrBlock}>
            <Image style={styles.coverQr} src={assets.qrDataUrl} />
            <Text style={styles.coverQrCaption}>Menu online</Text>
          </View>
        ) : null}
      </Page>

      {/* Pagine menù */}
      <Page size="A4" style={styles.menuPage} wrap>
        {runningTitle ? (
          <View style={styles.runningHeader} fixed>
            <Text style={styles.runningHeaderText}>{runningTitle}</Text>
          </View>
        ) : null}

        {data.categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            styles={styles}
            theme={theme}
            productImages={productImages}
            photoMode={photoMode}
          />
        ))}

        <LegendSection data={data} styles={styles} theme={theme} />

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {header.showActivityName ? data.meta.activityName : ""}
          </Text>
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
