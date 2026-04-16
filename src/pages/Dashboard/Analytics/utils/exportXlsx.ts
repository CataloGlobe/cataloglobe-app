// Utilizza la libreria `xlsx` (SheetJS) — aggiunta al progetto con decisione esplicita
// per migliorare significativamente l'UX dell'export analytics rispetto al CSV grezzo.
import * as XLSX from "xlsx";

export interface XlsxSection {
    name: string;
    headers: string[];
    rows: (string | number)[][];
    columnWidths?: number[];
    columnFormats?: (string | undefined)[];
}

export function buildXlsxWorkbook(sections: XlsxSection[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    for (const section of sections) {
        if (section.rows.length === 0) continue;

        const data: (string | number)[][] = [section.headers, ...section.rows];
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Apply per-column number formats to data rows
        if (section.columnFormats) {
            for (let r = 1; r < data.length; r++) {
                for (let c = 0; c < section.columnFormats.length; c++) {
                    const fmt = section.columnFormats[c];
                    if (!fmt) continue;
                    const cellRef = XLSX.utils.encode_cell({ r, c });
                    if (ws[cellRef]) {
                        ws[cellRef].z = fmt;
                    }
                }
            }
        }

        // Column widths: explicit or auto-calculated from content
        const numCols = section.headers.length;
        if (section.columnWidths) {
            ws["!cols"] = section.columnWidths.map(w => ({ wch: w }));
        } else {
            const widths: number[] = [];
            for (let c = 0; c < numCols; c++) {
                let max = section.headers[c].length;
                for (const row of section.rows) {
                    const val = row[c];
                    const len = val !== null && val !== undefined ? String(val).length : 0;
                    if (len > max) max = len;
                }
                widths.push(Math.min(40, Math.max(10, max + 2)));
            }
            ws["!cols"] = widths.map(w => ({ wch: w }));
        }

        // Freeze first row
        ws["!freeze"] = { xSplit: 0, ySplit: 1 };

        XLSX.utils.book_append_sheet(wb, ws, section.name);
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
