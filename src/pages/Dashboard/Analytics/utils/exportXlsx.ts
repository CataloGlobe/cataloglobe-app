// Engine export Excel Analitiche.
// Usa `xlsx-js-style` (fork SheetJS con supporto `cell.s`): stessa API di
// SheetJS community (`utils.aoa_to_sheet`, `utils.book_new`, `write`) + stili
// di cella serializzati nativamente da `XLSX.write`.
//
// Modello: un foglio = più tabelle ("blocchi") impilate verticalmente, ciascuna
// con titolo opzionale, banda header brand e righe zebra. Tutti i blocchi
// partono dalla colonna A → colonna-blocco == colonna-foglio.
import * as XLSX from "xlsx-js-style";

// ── Modello dati ─────────────────────────────────────────────────────────
export type CellValue = string | number | null;

export interface CellObject {
    v: CellValue;
    numFmt?: string;
    align?: "left" | "right" | "center";
}

export type Cell = CellValue | CellObject;

export interface TableBlock {
    /** Etichetta della tabella (es. "Visite nel tempo"). Omessa → nessun titolo. */
    subtitle?: string;
    headers: string[];
    rows: Cell[][];
    /** numFmt per colonna (tabelle uniformi: trend, top prodotti). */
    columnFormats?: (string | undefined)[];
    /** Override larghezza per colonna (es. nomi prodotto → 40). */
    columnWidths?: (number | undefined)[];
}

export interface SheetSpec {
    /** Nome del tab Excel (≤31 char). */
    name: string;
    /** Titolo dominio mostrato in prima riga (es. "ENGAGEMENT"). */
    title: string;
    blocks: TableBlock[];
}

export interface CoverInfoRow {
    label: string;
    value: string;
}

export interface CoverSpec {
    /** Banda titolo (es. "CataloGlobe · Analitiche"). */
    bannerTitle: string;
    /** Sottotitolo (nome attività). */
    subtitle: string;
    /** Mini-tabella Metrica|Valore (periodo, intervallo, generato il, valuta). */
    info: CoverInfoRow[];
    /** Elenco dei fogli effettivamente inclusi nel workbook. */
    indexEntries: string[];
}

// ── Token di stile ──────────────────────────────────────────────────────────
// Il colore primario (violetto di sistema) NON è hardcoded: viene letto a
// runtime dalla CSS var `--brand-primary` (fonte autoritativa: _theme.scss).
// Bordi volutamente neutri (grigio, niente viola) per delineare le tabelle.
const TEXT_DARK = "0F172A"; // neutro scuro (titoli + dati)
const GRID = "CBD5E1"; // gridline interne, grigio sobrio ma visibile
const OUTLINE = "94A3B8"; // contorno tabella, grigio leggermente più scuro
const ZEBRA = "F8FAFC"; // riga alternata, neutro
const WHITE = "FFFFFF";

// Fallback del primario in ARGB. Fonte autoritativa: _theme.scss
// `--brand-primary` (#6366f1, light theme). Usato solo se la var CSS non si
// risolve (es. ambiente senza DOM o valore vuoto).
const BRAND_FALLBACK = "FF6366F1";

type Align = "left" | "right" | "center";

const hex2 = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0").toUpperCase();

/**
 * Normalizza un qualsiasi colore CSS (hex/rgb/hsl/nome) in ARGB a 8 cifre
 * maiuscolo (FFRRGGBB). Tecnica robusta: applica il valore a un elemento
 * temporaneo e rilegge `getComputedStyle().color`, sempre in forma `rgb(...)`.
 * Ritorna null se l'input è vuoto o non risolvibile.
 */
function cssColorToArgb(input: string): string | null {
    const value = input.trim();
    if (!value) return null;
    if (typeof document === "undefined") return null;
    const el = document.createElement("span");
    el.style.color = value;
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = computed.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map(p => parseInt(p.trim(), 10));
    if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return null;
    return `FF${hex2(parts[0])}${hex2(parts[1])}${hex2(parts[2])}`;
}

/** Primario di sistema (ARGB) letto da --brand-primary, con fallback _theme.scss. */
function resolveBrandColor(): string {
    try {
        if (typeof document === "undefined") return BRAND_FALLBACK;
        const raw = getComputedStyle(document.documentElement).getPropertyValue("--brand-primary");
        return cssColorToArgb(raw) ?? BRAND_FALLBACK;
    } catch {
        return BRAND_FALLBACK;
    }
}

const thin = (rgb: string) => ({ style: "thin", color: { rgb } });

interface EdgeFlags {
    top?: boolean;
    bottom?: boolean;
    left?: boolean;
    right?: boolean;
}

/** Bordo cella: gridline grigia ovunque, contorno più scuro sui lati-blocco. */
function cellBorder(edges: EdgeFlags) {
    return {
        top: thin(edges.top ? OUTLINE : GRID),
        bottom: thin(edges.bottom ? OUTLINE : GRID),
        left: thin(edges.left ? OUTLINE : GRID),
        right: thin(edges.right ? OUTLINE : GRID)
    };
}

const TITLE_STYLE = { font: { bold: true, sz: 14, color: { rgb: TEXT_DARK } } };

const subtitleStyle = (brand: string) => ({
    font: { bold: true, sz: 11, color: { rgb: brand } }
});

const headerStyle = (align: Align, brand: string, edges: EdgeFlags) => ({
    font: { bold: true, sz: 11, color: { rgb: WHITE } },
    fill: { patternType: "solid", fgColor: { rgb: brand } },
    alignment: { horizontal: align, vertical: "center" },
    border: cellBorder(edges)
});

const dataStyle = (align: Align, zebra: boolean, edges: EdgeFlags) => ({
    font: { sz: 10, color: { rgb: TEXT_DARK } },
    border: cellBorder(edges),
    alignment: { horizontal: align, vertical: "center" },
    ...(zebra ? { fill: { patternType: "solid", fgColor: { rgb: ZEBRA } } } : {})
});

const coverBannerStyle = (brand: string) => ({
    font: { bold: true, sz: 20, color: { rgb: WHITE } },
    fill: { patternType: "solid", fgColor: { rgb: brand } },
    alignment: { horizontal: "left", vertical: "center" }
});
const COVER_SUBTITLE_STYLE = { font: { bold: true, sz: 13, color: { rgb: TEXT_DARK } } };

// ── Helper celle ───────────────────────────────────────────────────────────
function isCellObject(c: Cell): c is CellObject {
    return c !== null && typeof c === "object";
}

function rawValue(c: Cell): CellValue {
    return isCellObject(c) ? c.v : c;
}

function displayLength(c: Cell): number {
    const v = rawValue(c);
    return v === null || v === undefined ? 0 : String(v).length;
}

function alignFor(c: Cell): Align {
    if (isCellObject(c) && c.align) return c.align;
    return typeof rawValue(c) === "number" ? "right" : "left";
}

function numFmtFor(c: Cell, columnFmt: string | undefined): string | undefined {
    if (isCellObject(c) && c.numFmt) return c.numFmt;
    return columnFmt;
}

/** Applica stile (+ numFmt) a una cella, creandola se assente. */
function styleCell(
    ws: XLSX.WorkSheet,
    r: number,
    c: number,
    style: object,
    numFmt?: string
): void {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!ws[ref]) ws[ref] = { t: "s", v: "" };
    ws[ref].s = style;
    if (numFmt) ws[ref].z = numFmt;
}

// ── Larghezze colonna (max contenuto su TUTTI i blocchi del foglio) ─────────
function computeColumnWidths(blocks: TableBlock[]): number[] {
    const widths: number[] = [];
    const bump = (c: number, candidate: number) => {
        widths[c] = Math.max(widths[c] ?? 0, candidate);
    };
    for (const block of blocks) {
        block.headers.forEach((h, c) => bump(c, h.length));
        for (const row of block.rows) {
            row.forEach((cell, c) => bump(c, displayLength(cell)));
        }
        block.columnWidths?.forEach((w, c) => {
            if (w !== undefined) bump(c, w);
        });
    }
    return widths.map(w => Math.min(40, Math.max(10, w + 2)));
}

// ── Foglio dominio (blocchi impilati) ───────────────────────────────────────
type RowRole = "title" | "subtitle" | "header" | "data" | "spacer";
interface PlannedRow {
    role: RowRole;
    cells: Cell[];
    columnFormats?: (string | undefined)[];
    /** numero colonne del blocco (header/data) — per contorno e iterazione. */
    ncol?: number;
    /** allineamenti header dedotti dalla prima riga dati (header). */
    headerAligns?: Align[];
    /** riga header del blocco → contorno top. */
    isHeaderTop?: boolean;
    /** indice 0-based della riga dati nel blocco (per zebra). */
    dataIndex?: number;
    /** ultima riga dati del blocco → contorno bottom. */
    isLastData?: boolean;
}

function buildDomainSheet(spec: SheetSpec, brand: string): XLSX.WorkSheet {
    const blocks = spec.blocks.filter(b => b.rows.length > 0);

    const plan: PlannedRow[] = [];
    plan.push({ role: "title", cells: [spec.title] });
    plan.push({ role: "spacer", cells: [] });

    for (const block of blocks) {
        const ncol = block.headers.length;
        // Allineamento header = natura della prima riga dati (numerico → destra).
        const headerAligns = block.headers.map((_h, c) => alignFor(block.rows[0][c]));
        if (block.subtitle) plan.push({ role: "subtitle", cells: [block.subtitle] });
        plan.push({ role: "header", cells: block.headers, ncol, headerAligns, isHeaderTop: true });
        block.rows.forEach((row, i) => {
            plan.push({
                role: "data",
                cells: row,
                columnFormats: block.columnFormats,
                ncol,
                dataIndex: i,
                isLastData: i === block.rows.length - 1
            });
        });
        plan.push({ role: "spacer", cells: [] });
    }

    const aoa: CellValue[][] = plan.map(p => {
        if (p.role === "data" || p.role === "header") {
            return p.cells.map(c => {
                const v = typeof c === "string" || typeof c === "number" || c === null
                    ? c
                    : rawValue(c);
                return v === null ? "" : v;
            });
        }
        return p.cells.map(c => (rawValue(c) === null ? "" : rawValue(c)));
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    plan.forEach((p, r) => {
        const ncol = p.ncol ?? 0;
        switch (p.role) {
            case "title":
                styleCell(ws, r, 0, TITLE_STYLE);
                break;
            case "subtitle":
                styleCell(ws, r, 0, subtitleStyle(brand));
                break;
            case "header":
                for (let c = 0; c < ncol; c++) {
                    const edges: EdgeFlags = { top: true, left: c === 0, right: c === ncol - 1 };
                    styleCell(ws, r, c, headerStyle(p.headerAligns?.[c] ?? "left", brand, edges));
                }
                break;
            case "data":
                for (let c = 0; c < ncol; c++) {
                    const cell = p.cells[c] ?? "";
                    const zebra = (p.dataIndex ?? 0) % 2 === 1;
                    const edges: EdgeFlags = {
                        bottom: p.isLastData,
                        left: c === 0,
                        right: c === ncol - 1
                    };
                    styleCell(
                        ws,
                        r,
                        c,
                        dataStyle(alignFor(cell), zebra, edges),
                        numFmtFor(cell, p.columnFormats?.[c])
                    );
                }
                break;
            case "spacer":
            default:
                break;
        }
    });

    ws["!cols"] = computeColumnWidths(blocks).map(w => ({ wch: w }));
    // Niente !freeze: header impilati rendono il blocco inutile.
    return ws;
}

// ── Foglio Copertina ────────────────────────────────────────────────────────
function buildCoverSheet(cover: CoverSpec, brand: string): XLSX.WorkSheet {
    const aoa: CellValue[][] = [];
    aoa.push([cover.bannerTitle, "", ""]); // r0 banner (merge 3 col)
    aoa.push(["", "", ""]); // r1 spacer
    aoa.push([cover.subtitle, "", ""]); // r2 sottotitolo
    aoa.push(["", "", ""]); // r3 spacer

    const infoStartRow = aoa.length;
    aoa.push(["Metrica", "Valore"]); // header mini-tabella
    cover.info.forEach(row => aoa.push([row.label, row.value]));
    const infoEndRow = aoa.length - 1;

    aoa.push(["", ""]); // spacer
    aoa.push(["", ""]); // spacer

    const indexTitleRow = aoa.length;
    aoa.push(["Fogli inclusi"]);
    const indexStartRow = aoa.length;
    cover.indexEntries.forEach((name, i) => aoa.push([`${i + 1}. ${name}`]));

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Banner (merge A:C)
    const bannerStyle = coverBannerStyle(brand);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    styleCell(ws, 0, 0, bannerStyle);
    styleCell(ws, 0, 1, bannerStyle);
    styleCell(ws, 0, 2, bannerStyle);

    // Sottotitolo
    styleCell(ws, 2, 0, COVER_SUBTITLE_STYLE);

    // Mini-tabella info (header + dati) — contorno blocco su 2 colonne.
    styleCell(ws, infoStartRow, 0, headerStyle("left", brand, { top: true, left: true }));
    styleCell(ws, infoStartRow, 1, headerStyle("left", brand, { top: true, right: true }));
    for (let r = infoStartRow + 1; r <= infoEndRow; r++) {
        const zebra = (r - (infoStartRow + 1)) % 2 === 1;
        const last = r === infoEndRow;
        styleCell(ws, r, 0, dataStyle("left", zebra, { bottom: last, left: true }));
        styleCell(ws, r, 1, dataStyle("left", zebra, { bottom: last, right: true }));
    }

    // Indice
    styleCell(ws, indexTitleRow, 0, subtitleStyle(brand));
    for (let r = indexStartRow; r < indexStartRow + cover.indexEntries.length; r++) {
        styleCell(ws, r, 0, dataStyle("left", false, {}));
    }

    ws["!cols"] = [{ wch: 26 }, { wch: 34 }, { wch: 16 }];
    return ws;
}

// ── API pubblica ─────────────────────────────────────────────────────────────
export function buildXlsxWorkbook(cover: CoverSpec, sheets: SheetSpec[]): XLSX.WorkBook {
    const brand = resolveBrandColor();
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, buildCoverSheet(cover, brand), "Copertina");

    for (const spec of sheets) {
        if (spec.blocks.every(b => b.rows.length === 0)) continue;
        XLSX.utils.book_append_sheet(wb, buildDomainSheet(spec, brand), spec.name);
    }

    return wb;
}

export function downloadXlsx(workbook: XLSX.WorkBook, filename: string): void {
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
