// Documento react-pdf del menu (Stage 3 — theming dai token stile).
// Consuma MenuPdfData già risolto: nessun fetch, nessuna logica dati.
// Colori/tipografia/radius da PdfTheme (derivato da brand.tokens); elementi
// testuali di copertina e running header gated dai toggle tokens.header.
// Logo/cover-image/QR → Stage 3b; allergeni → Stage 4; foto → Stage 5.
import {
  Circle,
  Document,
  Image,
  Line,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type {
  MenuPdfCategory,
  MenuPdfClosingInfo,
  MenuPdfData,
  MenuPdfInfoRow,
  MenuPdfProduct,
} from "./menuPdfTypes";
import { buildPdfTheme, type PdfTheme } from "./pdfTheme";
import { resolvePdfFontFamily } from "./pdfFonts";
import { PdfIcon, allergenIconGeometry } from "./pdfIcons";
import {
  ALLERGEN_COVERAGE_THRESHOLD,
  ALL_ALLERGENS,
} from "./allergenEuNumbers";
import { COMPACT_COLUMNS, buildCategoryBlocks } from "./compactMenuLayout";

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

/**
 * Icone contatti della pagina di chiusura.
 *
 * ⚠️ Stessi glifi delle icone inline di
 * `src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx:21-75`
 * (path-data replicata, non importata): quelle sono **stroke-only** e mescolano
 * `<circle>/<rect>/<line>`, mentre `pdfIcons.extractIconGeometry` sa estrarre
 * solo `<path>` fill-based → tornerebbe null. Stesso trattamento del segnaposto
 * posate qui sopra. Se cambiano i glifi del footer pubblico, questi restano
 * indietro senza rompersi (icona diversa, mai crash).
 */
type ContactIconName =
  | "phone"
  | "mail"
  | "website"
  | "whatsapp"
  | "instagram"
  | "facebook";

function PdfContactIcon({
  name,
  size,
  color,
}: {
  name: ContactIconName;
  size: number;
  color: string;
}) {
  const stroke = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "phone" ? (
        <Path
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
          {...stroke}
        />
      ) : null}
      {name === "mail" ? (
        <>
          <Rect x="2" y="4" width="20" height="16" rx="2" {...stroke} />
          <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" {...stroke} />
        </>
      ) : null}
      {name === "website" ? (
        <>
          <Circle cx="12" cy="12" r="10" {...stroke} />
          <Line x1="2" y1="12" x2="22" y2="12" {...stroke} />
          <Path
            d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            {...stroke}
          />
        </>
      ) : null}
      {name === "whatsapp" ? (
        <Path
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
          {...stroke}
        />
      ) : null}
      {name === "instagram" ? (
        <>
          <Rect x="2" y="2" width="20" height="20" rx="5" {...stroke} />
          <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" {...stroke} />
          <Line x1="17.5" y1="6.5" x2="17.51" y2="6.5" {...stroke} />
        </>
      ) : null}
      {name === "facebook" ? (
        <Path
          d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"
          {...stroke}
        />
      ) : null}
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
      paddingTop: PAGE_MARGIN,
      paddingHorizontal: PAGE_MARGIN,
      // Nudge sobrio: extra padding in fondo → il blocco brand centrato si
      // alza (~40pt) sopra la metà esatta, bilanciando contro il QR ancorato
      // in basso. Vale sia col band immagine sia in tipografico.
      paddingBottom: PAGE_MARGIN + 80,
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
      // Tight verso l'indirizzo: nome sede + indirizzo = blocco "identità sede".
      marginBottom: 6,
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
      // Stacco verso la rule accento (che separa l'identità sede dal titolo menù).
      marginBottom: 22,
    },

    // ── Pagine menù ───────────────────────────────────────────────────
    menuPage: {
      backgroundColor: theme.pageBg,
      paddingTop: PAGE_MARGIN,
      paddingHorizontal: PAGE_MARGIN,
      paddingBottom: PAGE_MARGIN + 26,
      color: theme.ink,
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
    // Menù compatto: contenitore di una sequenza di voci nude affiancate.
    // Stesso meccanismo di `legendGrid` (row + wrap, item a width 50%).
    //
    // NESSUN wrap={false} qui: un blocco indivisibile più alto della pagina fa
    // scattare `!fitsInsidePage && !canWrap` in @react-pdf/layout e viene
    // disegnato oltre il bordo, sbalzando i fratelli (stesso difetto già
    // corretto sulla legenda). L'indivisibilità sta sulla singola cella.
    compactGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    // Cella della griglia compatta. paddingRight = gutter fra le colonne,
    // applicato anche alla colonna destra (come `legendItem`) così le due
    // celle restano esattamente della stessa larghezza.
    productRowHalf: {
      width: "50%",
      paddingRight: 14,
    },
    // photoMode: colonna gutter fissa su OGNI riga (thumb o vuota) cosi il
    // bordo sinistro del contenuto e' identico riga per riga.
    // width 100% obbligatoria: senza, il row si dimensiona sul max-content del
    // testo → nessuno shrink → la descrizione sfora il margine destro e viene
    // clippata. Con width definita, productContent = 100% − gutter → il Text wrappa.
    productRowPhotoMode: {
      flexDirection: "row",
      width: "100%",
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
      // flexBasis 0: la colonna si dimensiona SOLO dallo spazio libero (grow),
      // non dal max-content del testo. Senza, react-pdf misura la descrizione a
      // larghezza naturale e non sottrae il gutter → wrappa a larghezza piena
      // pagina e sfora il margine destro (clip). minWidth 0 per sicurezza.
      flexBasis: 0,
      minWidth: 0,
    },
    productLine: {
      flexDirection: "row",
      // flex-start: con un nome su più righe il prezzo resta allineato in alto
      // (prima riga), mai spinto in fondo al blocco nome.
      alignItems: "flex-start",
    },
    productName: {
      fontFamily,
      fontWeight: 700,
      fontSize: 11,
      color: theme.ink,
      // flexGrow riempie lo spazio meno il prezzo; il nome lungo wrappa DENTRO
      // questa colonna invece di sovrapporsi al prezzo. flexBasis 0 (come
      // productContent): in una row il Text va dimensionato dal grow, non dal
      // max-content, altrimenti non wrappa e sfora sul prezzo.
      //
      // Corollario (control render 2026-07-28): niente leader dots su questa
      // riga. I dots richiederebbero il nome dimensionato sul contenuto
      // (flexBasis auto), ma yoga/react-pdf NON comprime un nodo testo in row:
      // lo misura a max-content e il nome lungo finisce SOPRA il prezzo
      // (sovrapposizione, non wrap). Provata anche la variante con wrapper View
      // shrink: identica. Trade-off del motore — o il wrap è corretto, o i dots
      // sono utili; qui vince il wrap. Sulle righe formato il caso non si pone
      // (label corte, monoriga) e i dots ci sono.
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
    },
    // Sub-line sotto la descrizione: i numeri UE degli allergeni, l'unica
    // nota di servizio che resta sul piatto. L'allergene è un avviso
    // obbligatorio, e il numero è leggibile anche in bianco e nero.
    productIconsLine: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
    },
    // Numeri UE: stesso corpo della descrizione (9pt) per non sbilanciare la
    // riga, in bold e in `ink` — a 9pt il muted a stampa sparisce, ed è
    // esattamente il difetto che i numeri correggono. 700 e non 600: il font
    // PDF registra solo 400 e 700 (pdfFonts.ts).
    productAllergenNumbers: {
      fontFamily,
      fontWeight: 700,
      fontSize: 9,
      color: theme.ink,
    },
    productPrice: {
      fontFamily,
      fontWeight: 700,
      fontSize: 11,
      color: theme.ink,
      marginLeft: 12,
      // Il prezzo non si comprime né wrappa: resta intatto a destra con lo
      // stacco garantito dal marginLeft, mai a contatto col nome.
      flexShrink: 0,
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
    // Label formato in bold: deve staccarsi dalla descrizione muted sopra,
    // altrimenti il blocco prezzi si legge come testo di servizio.
    formatName: {
      fontFamily,
      fontWeight: 700,
      fontSize: 9.5,
      color: theme.muted,
      flexShrink: 1,
    },
    // Leader dots label→prezzo. Filler elastico con solo il bordo inferiore
    // punteggiato; alignItems flex-end della row allinea i box in basso e il
    // marginBottom lo risolleva all'altezza della baseline (il box del Text
    // scende sotto la baseline per i descender). Le label formato sono corte
    // e non wrappano → il tratto resta sempre su una riga sola.
    formatDots: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 8,
      marginHorizontal: 5,
      marginBottom: 2.5,
      borderBottomWidth: 1,
      borderBottomStyle: "dotted",
      borderBottomColor: theme.primarySoft,
    },
    formatPrice: {
      fontFamily,
      fontSize: 9.5,
      color: theme.ink,
      flexShrink: 0,
    },

    // ── Legenda allergeni (pagina finale, scala media) ─────────────────
    // Griglia "chiave" a 2 colonne: icona (grande) + label. Gap verticale
    // ampio per leggibilità (pagina dedicata, non coda di menù).
    legendGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    legendItem: {
      width: "50%",
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
      paddingRight: 12,
    },
    // Numero UE della legenda: larghezza fissa + allineamento a destra così
    // le icone restano incolonnate fra numeri a una e a due cifre.
    legendNumber: {
      fontFamily,
      fontWeight: 700,
      fontSize: 11.5,
      color: theme.primary,
      width: 18,
      textAlign: "right",
      marginRight: 8,
    },
    legendLabel: {
      fontFamily,
      fontSize: 11.5,
      color: theme.ink,
      marginLeft: 10,
    },

    // ── Pagina finale "Allergeni" ─────────────────────────────────────
    // column + altezza piena: gli spaziatori elastici distribuiscono i blocchi
    // verticalmente — titolo in alto, nota in fondo, e lo spazio libero
    // ripartito FRA le sezioni invece di accumularsi tutto in coda.
    finalPage: {
      backgroundColor: theme.pageBg,
      paddingTop: PAGE_MARGIN,
      paddingHorizontal: PAGE_MARGIN,
      paddingBottom: PAGE_MARGIN,
      color: theme.ink,
      flexDirection: "column",
    },
    finalTitleBlock: {
      alignItems: "center",
      // Stacco minimo garantito testata → contenuto: quando la pagina è piena
      // gli spaziatori elastici collassano a 0 e resta solo questo margine.
      marginBottom: 24,
    },
    finalTitle: {
      fontFamily,
      fontWeight: 700,
      fontSize: 24,
      color: theme.ink,
      textAlign: "center",
      marginBottom: 14,
    },
    finalRule: {
      width: 48,
      height: 4,
      backgroundColor: theme.primary,
      borderRadius: theme.radius / 5,
    },
    // Spaziatori elastici della pagina finale. Il rapporto NON è uniforme: lo
    // stacco fra due blocchi di natura diversa (legenda → contatti) merita più
    // respiro di quello fra testata e legenda, che sono un discorso solo.
    // Elastici e non margini fissi: nel caso sfortunato (cautela + contatti
    // lunghi + 5 fee) collassano a 0 e il contenuto resta compatto, invece di
    // spingere una seconda pagina causata dai margini stessi.
    // Rapporto 1 : 2 : 1.5 (testata→legenda : legenda→contatti : contatti→nota).
    finalSpacerTitle: {
      flexGrow: 1,
    },
    finalSpacerSections: {
      flexGrow: 2,
    },
    finalSpacer: {
      flexGrow: 1.5,
    },
    finalSubtitle: {
      fontFamily,
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: 1,
      color: theme.primary,
      textTransform: "uppercase",
      marginBottom: 12,
    },
    finalNoteBlock: {
      alignItems: "center",
      // Stacco minimo garantito: quando il contenuto riempie la pagina lo
      // spaziatore elastico collassa a 0 e la nota si incollerebbe all'ultima
      // voce della griglia. Nel caso normale il margine è irrilevante (lo
      // spaziatore fa il grosso del lavoro).
      marginTop: 18,
    },
    finalNote: {
      fontFamily,
      fontSize: 8.5,
      lineHeight: 1.4,
      color: theme.muted,
      textAlign: "center",
    },
    finalNoteDivider: {
      alignSelf: "stretch",
      height: 1,
      backgroundColor: theme.primarySoft,
      marginTop: 10,
    },
    // Didascalia sotto il rule: dichiara come si legge la griglia (i numeri
    // stampati accanto ai piatti). Testo variabile per copertura (vedi
    // ALLERGEN_PAGE_TEXT).
    // maxWidth: senza vincolo la riga più lunga correva da margine a margine
    // mentre quella sopra restava corta — due elementi scollegati invece di un
    // blocco. Stessa gabbia per entrambe le righe.
    finalCaption: {
      fontFamily,
      fontSize: 9,
      lineHeight: 1.45,
      color: theme.muted,
      textAlign: "center",
      maxWidth: "72%",
      marginTop: 14,
    },
    // Riga di cautela (solo copertura bassa): stesso stile della didascalia —
    // non è un allarme, è una precisazione. Applicata IN AGGIUNTA a finalCaption
    // (array di stili): cambia solo lo stacco verticale.
    finalCaptionCaution: {
      marginTop: 6,
    },
    // Blocco promosso in testa (solo copertura zero): la nota di rito sale qui
    // perché con zero dati è l'unica informazione vera della pagina. Barra
    // sinistra + fondo tenue dai token esistenti, nessun colore nuovo.
    finalPromoBlock: {
      backgroundColor: theme.primarySoft,
      borderLeftWidth: 3,
      borderLeftColor: theme.primary,
      borderRadius: theme.radius / 5,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 28,
    },
    finalPromoText: {
      fontFamily,
      fontSize: 9,
      lineHeight: 1.45,
      color: theme.ink,
    },
    // ── Blocco contatti + costi di servizio (Step 2) ──────────────────
    // Divider identico a quello della nota: la stessa hairline separa i due
    // blocchi di servizio in fondo alla pagina.
    finalInfoBlock: {
      marginTop: 28,
    },
    finalInfoDivider: {
      alignSelf: "stretch",
      height: 1,
      backgroundColor: theme.primarySoft,
      marginBottom: 18,
    },
    finalInfoColumns: {
      flexDirection: "row",
    },
    // width 50% anche a colonna singola: allineata alla griglia a 2 colonne
    // sopra, e le righe fee (label ↔ valore) non si allargano a tutta pagina
    // lasciando un vuoto enorme in mezzo.
    finalInfoColumn: {
      width: "50%",
      paddingRight: 12,
    },
    finalInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    // Riga fee: label a sinistra, valore a destra dentro la colonna.
    finalInfoRowSpread: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    finalInfoText: {
      fontFamily,
      fontSize: 9.5,
      color: theme.ink,
      marginLeft: 8,
    },
    // Stesso corpo e stesso colore del valore contatto: i costi hanno la
    // medesima dignità visiva, nessuna enfasi (niente riquadri o accenti).
    finalInfoFeeLabel: {
      fontFamily,
      fontSize: 9.5,
      color: theme.muted,
      flexShrink: 1,
      paddingRight: 8,
    },
    finalInfoFeeValue: {
      fontFamily,
      fontSize: 9.5,
      color: theme.ink,
      flexShrink: 0,
    },
    finalPromoTextSecondary: {
      fontFamily,
      fontSize: 9,
      lineHeight: 1.45,
      color: theme.ink,
      marginTop: 5,
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
  half = false,
}: {
  product: MenuPdfProduct;
  styles: Styles;
  theme: PdfTheme;
  thumbSrc: string | null;
  photoMode: boolean;
  /** Cella a metà larghezza dentro una griglia compatta (menù compatto). */
  half?: boolean;
}) {
  // Allergeni come numeri UE crescenti ("1 · 3 · 7 · 12"): compatti anche con
  // quattro allergeni, leggibili senza colore, e la convenzione dei menù
  // italiani stampati. Le icone restano, ma solo nella legenda finale.
  //
  // Le caratteristiche NON entrano nel PDF: su carta perdono la funzione (non
  // filtrano nulla) e molte datano il documento ("Nuovo", "Più richiesto").
  // `product.characteristics` resta nel dato, semplicemente non consumato qui.
  const allergenNumbersLabel = [...product.allergens]
    .map((a) => a.euNumber)
    .sort((a, b) => a - b)
    .join(" · ");

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
        {product.priceLabel ? (
          <Text style={styles.productPrice}>{product.priceLabel}</Text>
        ) : null}
      </View>
      {product.description ? (
        <Text style={styles.productDescription}>{product.description}</Text>
      ) : null}
      {/* Formati (prezzo del prodotto) subito dopo la descrizione. */}
      {product.formats.map((format) => (
        <View key={format.name} style={styles.formatLine}>
          <Text style={styles.formatName}>{format.name}</Text>
          <View style={styles.formatDots} />
          <Text style={styles.formatPrice}>{format.priceLabel}</Text>
        </View>
      ))}
      {/* Numeri allergeni = nota di servizio → sempre per ultimi. */}
      {allergenNumbersLabel ? (
        <View style={styles.productIconsLine}>
          <Text style={styles.productAllergenNumbers}>
            {allergenNumbersLabel}
          </Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View
      style={half ? [styles.productRow, styles.productRowHalf] : styles.productRow}
      wrap={false}
    >
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
  compact,
}: {
  category: MenuPdfCategory;
  styles: Styles;
  theme: PdfTheme;
  productImages: Record<string, string>;
  photoMode: boolean;
  compact: boolean;
}) {
  const isSubCategory = category.level > 0;
  // photoMode vince sempre: ogni riga riserva 62pt di gutter per la miniatura,
  // a metà larghezza resterebbero ~180pt per nome, prezzo e descrizione.
  const blocks = buildCategoryBlocks(category.products, compact && !photoMode);

  const renderRow = (product: MenuPdfProduct, half: boolean) => (
    <ProductRow
      key={product.id}
      product={product}
      styles={styles}
      theme={theme}
      thumbSrc={productImages[product.id] ?? null}
      photoMode={photoMode}
      half={half}
    />
  );

  const renderGrid = (items: MenuPdfProduct[], key: string) => (
    <View key={key} style={styles.compactGrid}>
      {items.map((product) => renderRow(product, true))}
    </View>
  );

  // Il PRIMO blocco è spezzato in due: la sua prima riga VISIVA sale nel blocco
  // indivisibile con l'header, il resto scorre libero.
  //
  // L'invariante da preservare è che l'header non resti mai solo a fine pagina
  // (minPresenceAhead non regge per categorie a prodotto singolo — fix Stage
  // 3c). Con una griglia in testa "prima riga visiva" non è più un prodotto ma
  // le prime COMPACT_COLUMNS celle, isolate in un container proprio: contenendo
  // esattamente due celle a width 50%, la griglia che segue riparte allineata
  // (stesso accorgimento di LegendSection).
  const [headBlock, ...restBlocks] = blocks;
  const headIsGrid = headBlock?.kind === "grid";
  const headFirst = headIsGrid
    ? headBlock.products.slice(0, COMPACT_COLUMNS)
    : (headBlock?.products.slice(0, 1) ?? []);
  const headRest = headIsGrid
    ? headBlock.products.slice(COMPACT_COLUMNS)
    : (headBlock?.products.slice(1) ?? []);

  return (
    <View style={styles.categorySection}>
      <View wrap={false}>
        <View style={styles.categoryHeader}>
          <Text
            style={isSubCategory ? styles.categoryNameSub : styles.categoryName}
          >
            {category.name}
          </Text>
          {!isSubCategory ? <View style={styles.categoryRule} /> : null}
        </View>
        {headFirst.length > 0
          ? headIsGrid
            ? renderGrid(headFirst, "head")
            : renderRow(headFirst[0], false)
          : null}
      </View>
      {headRest.length > 0
        ? headIsGrid
          ? renderGrid(headRest, "head-rest")
          : headRest.map((product) => renderRow(product, false))
        : null}
      {restBlocks.map((block, blockIndex) =>
        block.kind === "grid"
          ? renderGrid(block.products, `grid-${blockIndex}`)
          : block.products.map((product) => renderRow(product, false)),
      )}
    </View>
  );
}

/** Contatti pubblici in ordine di render, con la rispettiva icona. */
const CONTACT_FIELDS: Array<{
  key: keyof MenuPdfClosingInfo;
  icon: ContactIconName;
}> = [
  { key: "phone", icon: "phone" },
  { key: "email", icon: "mail" },
  { key: "website", icon: "website" },
  { key: "whatsapp", icon: "whatsapp" },
  { key: "instagram", icon: "instagram" },
  { key: "facebook", icon: "facebook" },
];

/** Su carta il protocollo è rumore: nessun altro ritocco al valore. */
function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//, "");
}

/**
 * Chiave di confronto per due numeri di telefono: sole cifre, ultime 9. Regge
 * le scritture diverse dello stesso numero (`+39 345 1559558` vs `3451559558`,
 * prefissi, spazi, trattini, punti) senza dover conoscere i piani di
 * numerazione nazionali. Serve SOLO al confronto: quello stampato resta il
 * valore originale del campo.
 */
function phoneComparisonKey(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/**
 * Instagram → handle `@nome`. Accetta URL completo, handle già prefissato o
 * nome nudo. Il servizio ha un formato di identificativo stabile, quindi
 * normalizzarlo è sicuro.
 */
function formatInstagram(value: string): string {
  const withoutProtocol = stripProtocol(value.trim());
  const fromUrl = withoutProtocol.match(/^(?:www\.)?instagram\.com\/([^/?#]+)/i);
  const handle = (fromUrl ? fromUrl[1] : withoutProtocol).replace(/^@/, "").replace(/\/$/, "");
  return handle.length > 0 ? `@${handle}` : value;
}

/**
 * Facebook: campo a testo libero (il valore reale osservato è "facebook/pagina",
 * né URL né handle). Da un dominio Facebook riconoscibile si estrae la coda del
 * percorso; in ogni altro caso il valore si stampa **grezzo** — meglio così che
 * trasformato male su un formato che non è garantito.
 */
function formatFacebook(value: string): string {
  const withoutProtocol = stripProtocol(value.trim());
  const fromUrl = withoutProtocol.match(/^(?:www\.)?(?:facebook\.com|fb\.com|fb\.me)\/([^?#]+)/i);
  if (!fromUrl) return withoutProtocol;
  const path = fromUrl[1].replace(/\/$/, "");
  return path.length > 0 ? path : withoutProtocol;
}

/**
 * Contatti pronti al render: valori formattati, campi vuoti fuori, e la riga
 * WhatsApp soppressa quando ripete il numero di telefono — caso frequentissimo
 * (stesso numero per chiamate e messaggi) che stampato due volte identico
 * sembra un errore di impaginazione. Resta l'icona del telefono: la riga dice
 * "questo è il numero della sede", WhatsApp è uno dei canali su quel numero.
 * Numeri diversi → due righe, che è corretto.
 */
function buildContactEntries(
  closingInfo: MenuPdfClosingInfo,
): Array<{ icon: ContactIconName; value: string }> {
  const phone = closingInfo.phone?.trim() ?? "";
  const whatsapp = closingInfo.whatsapp?.trim() ?? "";
  const sameNumber =
    phone.length > 0 &&
    whatsapp.length > 0 &&
    phoneComparisonKey(phone) === phoneComparisonKey(whatsapp);

  return CONTACT_FIELDS.map((field) => {
    if (field.key === "whatsapp" && sameNumber) return null;
    const raw = closingInfo[field.key];
    if (typeof raw !== "string" || raw.trim().length === 0) return null;

    const value =
      field.key === "instagram"
        ? formatInstagram(raw)
        : field.key === "facebook"
          ? formatFacebook(raw)
          : stripProtocol(raw.trim());

    return { icon: field.icon, value };
  }).filter((entry): entry is { icon: ContactIconName; value: string } => entry !== null);
}

/**
 * Contatti + costi di servizio in coda alla pagina finale (Step 2).
 *
 * Volutamente FUORI dal render: `closingInfo.hours` (un menù stampato che
 * dichiara orari vecchi è peggio di uno che tace — stessa ragione per cui gli
 * orari sono già fuori dalla copertina) e `googleReviewUrl` (trasformerebbe una
 * pagina informativa in una richiesta di recensione).
 *
 * `wrap={false}`: il blocco vale al massimo ~150pt (6 contatti + poche fee),
 * molto sotto l'altezza pagina, quindi scende intero alla pagina dopo invece di
 * spezzarsi. Non è il caso del vecchio wrapper su tutta la legenda, che poteva
 * superare la pagina e finiva disegnato oltre il bordo.
 *
 * Niente da dire (nessun contatto pubblico e nessuna fee) → `null`: nessun
 * divider, nessuno spazio, pagina identica a prima dello Step 2.
 */
function ClosingInfoBlock({
  closingInfo,
  styles,
  theme,
}: {
  closingInfo: MenuPdfClosingInfo;
  styles: Styles;
  theme: PdfTheme;
}) {
  const contacts = buildContactEntries(closingInfo);
  const fees: MenuPdfInfoRow[] = closingInfo.fees;

  if (contacts.length === 0 && fees.length === 0) return null;

  return (
    <View style={styles.finalInfoBlock} wrap={false}>
      <View style={styles.finalInfoDivider} />
      <View style={styles.finalInfoColumns}>
        {contacts.length > 0 ? (
          <View style={styles.finalInfoColumn}>
            <Text style={styles.finalSubtitle}>Contatti</Text>
            {contacts.map((contact) => (
              <View key={contact.icon} style={styles.finalInfoRow}>
                <PdfContactIcon
                  name={contact.icon}
                  size={11}
                  color={theme.primary}
                />
                <Text style={styles.finalInfoText}>{contact.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {fees.length > 0 ? (
          <View style={styles.finalInfoColumn}>
            {/* "Costi e condizioni", non "Costi di servizio": delle 5 fee di
                FEE_DEFINITIONS solo coperto e servizio sono costi — prenotazione
                minima, spesa minima ed età minima sono condizioni d'accesso.
                Nessun attributo nel dato le separa (unitFormatKey è un hint di
                formattazione, non una classe semantica): titolo unico. */}
            <Text style={styles.finalSubtitle}>Costi e condizioni</Text>
            {fees.map((fee) => (
              <View key={fee.label} style={styles.finalInfoRowSpread}>
                <Text style={styles.finalInfoFeeLabel}>{fee.label}</Text>
                <Text style={styles.finalInfoFeeValue}>{fee.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Testi della pagina finale, in un punto solo: sono in revisione legale e vanno
 * sostituiti qui senza toccare il render.
 *
 * `captionNoData` è la formulazione per copertura zero — senza nemmeno un
 * numero stampato nel menù la griglia non può rimandare ai numeri, quindi
 * dichiara solo cosa sta elencando. `caption` è la formulazione normale.
 */
const ALLERGEN_PAGE_TEXT = {
  caption:
    "I numeri accanto a ogni piatto corrispondono agli allergeni elencati qui sotto.",
  captionNoData: "Elenco dei 14 allergeni previsti dal Regolamento UE 1169/2011.",
  // Parla dei piatti, non degli allergeni "non evidenziati": dopo il passaggio
  // ai numeri UE l'evidenziazione in griglia non esiste più, mentre l'assenza
  // di numeri accanto al piatto è ciò che il lettore ha davanti.
  lowCoverageCaution:
    "I piatti senza numeri non hanno allergeni segnalati: per informazioni rivolgersi al personale di sala.",
  staffNote:
    "In caso di allergie o intolleranze si prega di informare il personale di sala.",
  askInRoom:
    "Le informazioni su ingredienti e allergeni di ogni piatto sono disponibili in sala su richiesta.",
} as const;

type LegendEntry = {
  key: string;
  label: string;
  geometry: ReturnType<typeof allergenIconGeometry>;
  iconColor: string;
  labelStyle: Styles["legendLabel"];
  /** Numero UE mostrato prima dell'icona. */
  euNumber?: number | null;
};

/** Numero di voci per riga della griglia legenda (legendItem = width 50%). */
const LEGEND_COLUMNS = 2;

/**
 * Sezione della pagina finale: sottotitolo + griglia a 2 colonne (numero +
 * icona + label).
 *
 * Impaginazione — il gruppo NON è indivisibile. Un unico `wrap={false}` su
 * tutta la sezione faceva scattare `!fitsInsidePage && !canWrap` in
 * @react-pdf/layout: il blocco veniva disegnato oltre il bordo pagina e i
 * fratelli (spaziatore, nota) sbalzati alla pagina dopo. Succedeva davvero
 * quando la pagina finale ospitava anche le caratteristiche (poi rimosse dal
 * PDF). Il wrap resta quindi a granularità fine:
 *
 * - `wrap={false}` sul singolo item → una voce non si spezza mai tra icona e label;
 * - `wrap={false}` su sottotitolo + PRIMA riga → il sottotitolo non resta orfano
 *   a fine pagina (stesso pattern di CategorySection per l'header categoria;
 *   `minPresenceAhead` era già stato scartato lì perché non regge).
 *
 * La prima riga è un container `legendGrid` separato dal resto: contenendo
 * esattamente LEGEND_COLUMNS voci a width 50%, la griglia successiva riparte
 * allineata e l'impaginazione resta identica a occhio.
 */
function LegendSection({
  subtitle,
  items,
  styles,
}: {
  subtitle: string;
  items: LegendEntry[];
  styles: Styles;
}) {
  const firstRow = items.slice(0, LEGEND_COLUMNS);
  const restRows = items.slice(LEGEND_COLUMNS);

  const renderItem = (item: LegendEntry) => (
    <View key={item.key} style={styles.legendItem} wrap={false}>
      {item.euNumber != null ? (
        <Text style={styles.legendNumber}>{item.euNumber}</Text>
      ) : null}
      {item.geometry ? (
        <PdfIcon geometry={item.geometry} size={20} color={item.iconColor} />
      ) : null}
      <Text style={item.labelStyle}>{item.label}</Text>
    </View>
  );

  return (
    <View>
      <View wrap={false}>
        <Text style={styles.finalSubtitle}>{subtitle}</Text>
        <View style={styles.legendGrid}>{firstRow.map(renderItem)}</View>
      </View>
      {restRows.length > 0 ? (
        <View style={styles.legendGrid}>{restRows.map(renderItem)}</View>
      ) : null}
    </View>
  );
}

/**
 * Ultima pagina del menù: pagina dedicata "Allergeni". Titolo di pagina +
 * rule + didascalia, i 14 allergeni UE come LEGENDA dei numeri stampati
 * accanto ai piatti (numero + icona + nome, tutti allo stesso peso) e la nota
 * di rito in fondo. Le caratteristiche NON compaiono nel PDF: su carta non
 * filtrano nulla e molte datano il documento. Nessun footer/numero (come la
 * copertina). Contenuto distribuito verticalmente dagli spaziatori elastici.
 *
 * Il testo si adatta alla copertura del dato: senza nemmeno un numero nel
 * menù la didascalia sui numeri sarebbe assurda, quindi si ricade su quella
 * normativa. Layout, colori e griglia sono identici nei tre casi — cambia
 * solo il testo.
 */
function AllergensPage({
  data,
  styles,
  theme,
}: {
  data: MenuPdfData;
  styles: Styles;
  theme: PdfTheme;
}) {
  const { productsTotal, productsWithAllergens } = data.allergenCoverage;
  const hasNoAllergenData = productsWithAllergens === 0;
  // productsTotal > 0: un catalogo senza prodotti stampabili non deve dividere
  // per zero — ricade su hasNoAllergenData (numeratore 0).
  const isLowCoverage =
    !hasNoAllergenData &&
    productsTotal > 0 &&
    productsWithAllergens / productsTotal < ALLERGEN_COVERAGE_THRESHOLD;

  return (
    <Page size="A4" style={styles.finalPage}>
      <View style={styles.finalTitleBlock}>
        <Text style={styles.finalTitle}>Allergeni</Text>
        <View style={styles.finalRule} />
        <Text style={styles.finalCaption}>
          {hasNoAllergenData
            ? ALLERGEN_PAGE_TEXT.captionNoData
            : ALLERGEN_PAGE_TEXT.caption}
        </Text>
        {isLowCoverage ? (
          <Text style={[styles.finalCaption, styles.finalCaptionCaution]}>
            {ALLERGEN_PAGE_TEXT.lowCoverageCaution}
          </Text>
        ) : null}
      </View>

      {/* Copertura zero: la nota di rito sale in testa (e sparisce dal fondo:
          deve comparire una volta sola) insieme al rimando alla sala. */}
      {hasNoAllergenData ? (
        <View style={styles.finalPromoBlock}>
          <Text style={styles.finalPromoText}>
            {ALLERGEN_PAGE_TEXT.staffNote}
          </Text>
          <Text style={styles.finalPromoTextSecondary}>
            {ALLERGEN_PAGE_TEXT.askInRoom}
          </Text>
        </View>
      ) : null}

      {/* NB: nessun wrap={false} sul gruppo — un blocco più alto della pagina
          sfonderebbe il bordo invece di impaginarsi (vedi LegendSection). */}
      <View style={styles.finalSpacerTitle} />

      <LegendSection
        subtitle="Allergeni"
        styles={styles}
        // Tutti e 14 gli allergeni UE con lo stesso peso: è una legenda che
        // spiega i numeri stampati accanto ai piatti, non una dichiarazione di
        // cosa il locale serve. Nessuna dicotomia presente/attenuato.
        items={ALL_ALLERGENS.map((allergen) => ({
          key: allergen.code,
          label: allergen.label,
          euNumber: allergen.euNumber,
          geometry: allergenIconGeometry(allergen.code),
          iconColor: theme.muted,
          labelStyle: styles.legendLabel,
        }))}
      />

      <View style={styles.finalSpacerSections} />

      {/* Contatti + costi di servizio, in coda alle sezioni legenda. */}
      <ClosingInfoBlock
        closingInfo={data.meta.closingInfo}
        styles={styles}
        theme={theme}
      />

      {/* Ultimo spaziatore: la nota resta ancorata in fondo (sotto di lei non
          c'è altro che il padding pagina). Resta anche nel caso senza nota —
          con nulla sotto, evita che i contatti si incollino al margine. */}
      <View style={styles.finalSpacer} />

      {/* Nota di rito in fondo, sopra un divider sottile. Assente a copertura
          zero: è già stata promossa in testa. */}
      {hasNoAllergenData ? null : (
        <View style={styles.finalNoteBlock}>
          <Text style={styles.finalNote}>{ALLERGEN_PAGE_TEXT.staffNote}</Text>
          <View style={styles.finalNoteDivider} />
        </View>
      )}
    </Page>
  );
}

export function MenuPdfDocument({
  data,
  assets = EMPTY_ASSETS,
  compact = false,
}: {
  data: MenuPdfData;
  assets?: MenuPdfAssets;
  /** Menù compatto: affianca su due colonne le sequenze di voci senza
   *  descrizione. Default FALSE — il layout storico resta lo status quo. */
  compact?: boolean;
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

  // Il toggle export "Includi immagine di copertina" è il controllo effettivo:
  // controlla il prefetch (coverDataUrl null se off) → qui basta la presenza
  // dell'asset. Non si somma più al gate di stile header.showCoverImage.
  const showCoverBand = assets.coverDataUrl !== null;
  const showLogo = header.showLogo && assets.logoDataUrl !== null;

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
          {/* Indirizzo = dato della sede: sotto il nome sede (blocco identità),
              prima della rule accento che stacca verso il titolo del menù. */}
          {header.showAddress && data.meta.address ? (
            <Text style={styles.coverAddress}>{data.meta.address}</Text>
          ) : null}
          <View style={styles.coverRule} />
          {header.showCatalogName ? (
            <Text style={styles.coverCatalog}>{data.meta.catalogName}</Text>
          ) : null}
        </View>
        {assets.qrDataUrl ? (
          <View style={styles.coverQrBlock}>
            <Image style={styles.coverQr} src={assets.qrDataUrl} />
            <Text style={styles.coverQrCaption}>Menu digitale</Text>
          </View>
        ) : null}
      </Page>

      {/* Pagine menù — nessun running header: partono pulite dalla prima
          categoria; l'identificazione pagina resta nel footer. */}
      <Page size="A4" style={styles.menuPage} wrap>
        {data.categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            styles={styles}
            theme={theme}
            productImages={productImages}
            photoMode={photoMode}
            compact={compact}
          />
        ))}

        {/* Legenda spostata nella pagina di chiusura (Step 2): non più in coda
            ai prodotti, così resta fuori dalla numerazione. */}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {header.showActivityName ? data.meta.activityName : ""}
          </Text>
          <Text
            style={styles.footerText}
            // Numerazione LOCALE a questa <Page>: subPageNumber (base 1) e
            // subPageTotalPages contano solo le pagine fisiche in cui questa
            // Page si è spezzata, ignorando copertina e chiusura.
            //
            // Prima era `pageNumber - 1` / `totalPages - 2` su indici globali:
            // l'offset costante presupponeva frontespizi a pagina singola, e
            // quando la chiusura ne occupava due il totale usciva sovrastimato
            // di 1 ("Pagina 1 di 2" con una sola pagina prodotti). Con i sub-*
            // l'assunzione sparisce del tutto.
            render={({ subPageNumber, subPageTotalPages }) =>
              `Pagina ${subPageNumber} di ${subPageTotalPages}`
            }
          />
        </View>
      </Page>

      {/* Pagina finale "Allergeni". Nessun footer/numero, come la copertina. */}
      <AllergensPage data={data} styles={styles} theme={theme} />
    </Document>
  );
}
