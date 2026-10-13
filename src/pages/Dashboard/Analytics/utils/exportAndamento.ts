import {
    buildXlsxWorkbook,
    downloadXlsx,
    type Cell,
    type CoverSpec,
    type SheetSpec
} from "./exportXlsx";
import type { AndamentoData } from "./andamentoData";
import { periodToDateRange, type PeriodKey } from "./periodComparison";

/** Dove si guarda: per la copertina e il nome del file. */
export interface ExportPlace {
    /** «Tutte le sedi» o il nome della sede. */
    activityName: string;
    /** «tutte-le-sedi» o lo slug della sede. */
    sedeSlug: string;
}

/**
 * L'Excel di Andamento: i dati grezzi del periodo, un foglio per famiglia
 * (pagina pubblica, ordini, prenotazioni) e una copertina.
 */
export function exportAndamentoXlsx(data: AndamentoData, period: PeriodKey, { activityName, sedeSlug }: ExportPlace): void {
    const orders = data.orders;
    const reservations = data.reservations;
    // Conversione selezione = % finale del funnel (selection_add / page_view).
    const selectionConversion = data.funnel.length > 0 ? data.funnel[data.funnel.length - 1].percentage : null;

    const SLOT_LABELS: Record<string, string> = {
        before_catalog: "Prima del menù",
        after_catalog: "Dopo il menù"
    };

    const CURRENCY_FMT = "#,##0.00 €";
    const DURATION_FMT = '#,##0" s"';
    const PCT_FMT = "0.0%";

    // numero grezzo + numFmt valuta (mai stringa pre-formattata).
    const eur = (v: number | null | undefined): Cell => ({ v: v ?? 0, numFmt: CURRENCY_FMT });
    // durata in secondi come numero (resta calcolabile) + formato " s".
    const dur = (s: number | null | undefined): Cell => ({ v: s ?? 0, numFmt: DURATION_FMT });
    // percentuale: dato sorgente 0–100 → frazione 0–1 + formato nativo 0.0%.
    const pct = (v: number | null | undefined): Cell => ({ v: (v ?? 0) / 100, numFmt: PCT_FMT });

    const NAME_W = 40; // larghezza colonne nome prodotto / titolo

    // ── Pagina pubblica (sempre) ─────────────────────────────────────────
    // Dati grezzi com'è (A5), con le parole della pagina: «visite», non
    // «sessioni» né «visitatori» (§36.1/2).
    const engagement: SheetSpec = {
        name: "Pagina pubblica",
        title: "PAGINA PUBBLICA",
        blocks: [
            {
                subtitle: "Panoramica",
                headers: ["Metrica", "Valore"],
                rows: data.overview
                    ? [
                          ["Visite", data.overview.total_views],
                          ["Eventi per visita", data.overview.avg_events_per_session],
                          ["Visite con un'aggiunta alla selezione", pct(selectionConversion)]
                      ]
                    : []
            },
            {
                subtitle: "Visite nel tempo",
                headers: ["Data", "Visite"],
                rows: data.viewsTrend.map(r => [r.date, r.count])
            },
            {
                subtitle: "Dispositivi",
                headers: ["Tipo", "Percentuale"],
                rows: data.devices.map(r => [r.device_type, pct(r.percentage)])
            },
            {
                subtitle: "Fasce orarie",
                headers: ["Ora", "Visite"],
                rows: data.hourly.map(r => [r.hour, r.view_count])
            },
            {
                subtitle: "Dalla visita alla selezione",
                headers: ["Passo", "Visite", "Percentuale"],
                rows: data.funnel.map(r => [r.step_label, r.session_count, pct(r.percentage)])
            },
            {
                subtitle: "Prodotti più aperti",
                headers: ["#", "Prodotto", "Aperture"],
                rows: data.topViewed.map((r, i) => [i + 1, r.product_name, r.count]),
                columnWidths: [undefined, NAME_W, undefined]
            },
            {
                subtitle: "Prodotti più selezionati",
                headers: ["#", "Prodotto", "Aggiunte"],
                rows: data.topSelected.map((r, i) => [i + 1, r.product_name, r.count]),
                columnWidths: [undefined, NAME_W, undefined]
            },
            {
                subtitle: "Cosa cercano",
                headers: ["#", "Termine", "Ricerche", "Media risultati"],
                rows: data.searchTerms.map((r, i) => [i + 1, r.search_term, r.search_count, r.avg_results])
            },
            {
                subtitle: "Contenuti in evidenza",
                headers: ["#", "Titolo", "Posizione", "Click"],
                rows: data.featured.map((r, i) => [
                    i + 1,
                    r.title,
                    SLOT_LABELS[r.slot] ?? r.slot,
                    r.click_count
                ]),
                columnWidths: [undefined, NAME_W, undefined, undefined]
            },
            {
                subtitle: "Recensioni",
                headers: ["Metrica", "Valore"],
                rows: data.reviews
                    ? [
                          ["Recensioni lasciate", data.reviews.total],
                          ["Media stelle", data.reviews.avg_rating],
                          ["Redirect a Google", data.reviews.google_redirects]
                      ]
                    : []
            },
            {
                subtitle: "Distribuzione stelle",
                headers: ["Stelle", "Conteggio"],
                rows: data.reviews?.distribution.map(r => [r.stars, r.count]) ?? []
            },
            {
                subtitle: "Clic sui contatti e sui social",
                headers: ["Piattaforma", "Click"],
                rows: data.social.map(r => [r.social_type, r.click_count])
            }
        ]
    };

    const sheets: SheetSpec[] = [engagement];

    // ── Ordini (se feature attiva) ───────────────────────────────────────
    if (orders) {
        sheets.push({
            name: "Ordini",
            title: "ORDINI",
            blocks: [
                {
                    subtitle: "Panoramica",
                    headers: ["Metrica", "Valore"],
                    rows: orders.overview
                        ? [
                              ["Ordini", orders.overview.orders_count],
                              ["Ricavi", eur(orders.overview.revenue)],
                              ["Valore medio ordine", eur(orders.overview.avg_order_value)],
                              ["Tasso annullamento", pct(orders.overview.cancellation_rate)],
                              ["Ordini annullati", orders.overview.cancelled_count]
                          ]
                        : []
                },
                {
                    subtitle: "Andamento",
                    headers: ["Data", "Ordini", "Ricavi"],
                    rows: orders.trend.map(r => [r.date, r.orders_count, eur(r.revenue)])
                },
                {
                    subtitle: "Fasce orarie",
                    headers: ["Ora", "Ordini", "Ricavi"],
                    rows: orders.hourly.map(r => [r.hour, r.orders_count, eur(r.revenue)])
                },
                {
                    subtitle: "Top prodotti ordinati (qtà)",
                    headers: ["#", "Prodotto", "Quantità", "Ricavi"],
                    rows: orders.topByQuantity.map((r, i) => [i + 1, r.product_name, r.quantity, eur(r.revenue)]),
                    columnWidths: [undefined, NAME_W, undefined, undefined]
                },
                {
                    subtitle: "Top prodotti ordinati (ricavi)",
                    headers: ["#", "Prodotto", "Quantità", "Ricavi"],
                    rows: orders.topByRevenue.map((r, i) => [i + 1, r.product_name, r.quantity, eur(r.revenue)]),
                    columnWidths: [undefined, NAME_W, undefined, undefined]
                },
                {
                    subtitle: "Tempi operativi",
                    headers: ["Fase", "Media", "Mediana"],
                    rows: orders.latency
                        ? [
                              ["Preparazione", dur(orders.latency.avg_prep_seconds), dur(orders.latency.median_prep_seconds)],
                              ["Consegna", dur(orders.latency.avg_delivery_seconds), dur(orders.latency.median_delivery_seconds)],
                              ["Totale", dur(orders.latency.avg_total_seconds), dur(orders.latency.median_total_seconds)]
                          ]
                        : []
                },
                {
                    subtitle: "Campione tempi operativi",
                    headers: ["Metrica", "Valore"],
                    rows: orders.latency
                        ? [
                              ["Ordini consegnati", orders.latency.delivered_count],
                              ["Consegne dirette (no 'Pronto')", orders.latency.skipped_ready_count]
                          ]
                        : []
                },
                {
                    subtitle: "Dalla selezione all'ordine",
                    headers: ["Metrica", "Valore"],
                    rows: orders.conversion
                        ? [
                              ["Visite con selezione", orders.conversion.selection_sessions],
                              ["Ordini inviati", orders.conversion.orders_count],
                              ["Tasso di conversione", pct(orders.conversion.conversion_rate)]
                          ]
                        : []
                }
            ]
        });
    }

    // ── Prenotazioni (se feature attiva) ─────────────────────────────────
    if (reservations) {
        sheets.push({
            name: "Prenotazioni",
            title: "PRENOTAZIONI",
            blocks: [
                {
                    subtitle: "Panoramica",
                    headers: ["Metrica", "Valore"],
                    rows: reservations.overview
                        ? [
                              ["Prenotazioni (ricevute)", reservations.overview.reservations_count],
                              ["Coperti", reservations.overview.covers],
                              ["Confermate", reservations.overview.confirmed_count],
                              ["Tasso conferma", pct(reservations.overview.confirm_rate)],
                              ["Rifiutate", reservations.overview.declined_count],
                              ["Annullate", reservations.overview.cancelled_count],
                              ["Online", reservations.overview.online_count],
                              ["Manuali", reservations.overview.manual_count]
                          ]
                        : []
                },
                {
                    subtitle: "Andamento",
                    headers: ["Data", "Prenotazioni", "Coperti"],
                    rows: reservations.trend.map(r => [r.date, r.reservations_count, r.covers])
                },
                {
                    subtitle: "Fasce orarie",
                    headers: ["Ora", "Prenotazioni"],
                    rows: reservations.hourly.map(r => [r.hour, r.reservations_count])
                }
            ]
        });
    }

    // ── Copertina ─────────────────────────────────────────────────────────
    const periodHumanLabel: Record<PeriodKey, string> = {
        today: "Oggi",
        "7d": "Ultimi 7 giorni",
        "30d": "Ultimi 30 giorni",
        "90d": "Ultimi 90 giorni",
        all: "Tutto il periodo"
    };
    const { from, to } = periodToDateRange(period);
    const dateFmt = new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
    const dateTimeFmt = new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

    const cover: CoverSpec = {
        bannerTitle: "CataloGlobe · Andamento",
        subtitle: activityName,
        info: [
            { label: "Periodo", value: periodHumanLabel[period] },
            // Il campione prima di ogni numero derivato (§36.1/1, A5): nel
            // foglio le percentuali restano, il lettore sa su cosa pesano.
            { label: "Campione", value: `${data.overview?.total_views ?? 0} visite` },
            { label: "Intervallo date", value: `${dateFmt.format(from)} – ${dateFmt.format(to)}` },
            { label: "Generato il", value: dateTimeFmt.format(new Date()) },
            { label: "Valuta", value: "EUR (€)" }
        ],
        indexEntries: sheets.map(s => s.name)
    };

    const wb = buildXlsxWorkbook(cover, sheets);

    const periodoLabel: Record<PeriodKey, string> = {
        today: "oggi",
        "7d": "7-giorni",
        "30d": "30-giorni",
        "90d": "90-giorni",
        all: "tutto"
    };
    const date = new Date().toISOString().split("T")[0];
    const filename = `analytics_cataloglobe_${sedeSlug}_${periodoLabel[period]}_${date}.xlsx`;

    downloadXlsx(wb, filename);
}
