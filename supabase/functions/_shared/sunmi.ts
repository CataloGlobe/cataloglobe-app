// Sunmi Cloud Printer OpenAPI — client condiviso (firma HMAC, trasporto,
// mapping degli errori).
//
// ⚠️ GATEWAY: `https://openapi.sunmi.com`, NON `https://openapi.eu.sunmi.com`.
// Il dominio "eu" esiste ed accetta la firma, ma per il nostro account
// risponde `{"code":30001,"msg":"can not get ability"}` su ogni endpoint
// printer: la capability "cloud printer" e' agganciata al gateway globale.
// Verificato con stampante fisica NT311_S. Non "correggere" il dominio.
//
// Protocollo (verificato via curl):
//   * POST JSON, header `Source: openapi` OBBLIGATORIO (senza → 30001).
//   * `Sunmi-Appid`, `Sunmi-Timestamp` (unix secondi, 10 cifre),
//     `Sunmi-Nonce` (6 cifre), `Sunmi-Sign`.
//   * Firma: HMAC-SHA256(jsonBody + appid + timestamp + nonce, appkey),
//     hex minuscolo. La stringa firmata DEVE essere byte-identica al body
//     spedito: serializziamo UNA volta e usiamo la stessa const per firma e
//     fetch.
//   * Successo: `{"code":1,"msg":"...","data":...}`. Errore: `code` != 1.
//
// Modulo senza side-effect a import-time (niente Deno.env al top-level):
// testabile sotto vitest (Node) iniettando credenziali e fetch.

export const SUNMI_API_BASE = "https://openapi.sunmi.com";

export const SUNMI_PATHS = {
    bindShop: "/v2/printer/open/open/device/bindShop",
    unbindShop: "/v2/printer/open/open/device/unbindShop",
    onlineStatus: "/v2/printer/open/open/device/onlineStatus",
    pushContent: "/v2/printer/open/open/device/pushContent"
} as const;

/** Codici di risposta Sunmi documentati/osservati. */
export const SUNMI_CODES = {
    OK: 1,
    AUTH_FAILED: 30000,
    NO_ABILITY: 30001,
    BAD_SIGNATURE: 40000,
    DEVICE_UNKNOWN: 10071701,
    ALREADY_BOUND: 10071702,
    NOT_IN_CHANNEL: 10071704,
    TRADE_NO_DUPLICATE: 10071705,
    NO_DEVICE: 10071707
} as const;

/**
 * Categoria d'errore: cosa deve fare il chiamante.
 *  - config:  credenziali/firma/capability → bug nostro o segreti sbagliati.
 *  - device:  il dispositivo non e' valido per noi (sn errato, altro canale).
 *  - state:   conflitto di stato lato Sunmi (gia' bound, trade_no duplicato).
 *  - unknown: codice non mappato.
 */
export type SunmiErrorCategory = "config" | "device" | "state" | "unknown";

export function categorizeSunmiCode(code: number): SunmiErrorCategory {
    switch (code) {
        case SUNMI_CODES.AUTH_FAILED:
        case SUNMI_CODES.NO_ABILITY:
        case SUNMI_CODES.BAD_SIGNATURE:
            return "config";
        case SUNMI_CODES.DEVICE_UNKNOWN:
        case SUNMI_CODES.NOT_IN_CHANNEL:
        case SUNMI_CODES.NO_DEVICE:
            return "device";
        case SUNMI_CODES.ALREADY_BOUND:
        case SUNMI_CODES.TRADE_NO_DUPLICATE:
            return "state";
        default:
            return "unknown";
    }
}

export type SunmiResult<T = unknown> =
    | { kind: "ok"; data: T; msg: string }
    | { kind: "sunmi_error"; code: number; msg: string; category: SunmiErrorCategory }
    | { kind: "transport_error"; message: string; status?: number }
    | { kind: "config_error"; message: string };

export interface SunmiCredentials {
    appId: string;
    appKey: string;
}

export interface SunmiRequestOptions {
    /** Default: letti da SUNMI_APP_ID / SUNMI_APP_KEY (Deno.env). */
    credentials?: SunmiCredentials;
    /** Default: globalThis.fetch. Iniettabile nei test. */
    fetchImpl?: typeof fetch;
    /** Default 10s. Nel repo non esistevano timeout espliciti: introdotto qui. */
    timeoutMs?: number;
    /** Override deterministici per i test. */
    timestamp?: string;
    nonce?: string;
    baseUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

// ============================================================
// Firma
// ============================================================

function _toHex(bytes: ArrayBuffer): string {
    return Array.from(new Uint8Array(bytes))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * HMAC-SHA256(bodyJson + appId + timestamp + nonce, appKey) → hex minuscolo.
 * `bodyJson` deve essere ESATTAMENTE la stringa che verra' spedita.
 */
export async function buildSunmiSignature(
    bodyJson: string,
    appId: string,
    timestamp: string,
    nonce: string,
    appKey: string
): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(appKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(bodyJson + appId + timestamp + nonce)
    );
    return _toHex(sig);
}

/** Unix seconds, 10 cifre. */
export function sunmiTimestamp(now: number = Date.now()): string {
    return Math.floor(now / 1000).toString().padStart(10, "0");
}

/** 6 cifre decimali, prima cifra non zero. */
export function sunmiNonce(): string {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return String(100000 + (buf[0] % 900000));
}

export async function buildSunmiHeaders(
    bodyJson: string,
    credentials: SunmiCredentials,
    timestamp: string,
    nonce: string
): Promise<Record<string, string>> {
    const sign = await buildSunmiSignature(
        bodyJson,
        credentials.appId,
        timestamp,
        nonce,
        credentials.appKey
    );
    return {
        "Content-Type": "application/json",
        "Source": "openapi",
        "Sunmi-Appid": credentials.appId,
        "Sunmi-Timestamp": timestamp,
        "Sunmi-Nonce": nonce,
        "Sunmi-Sign": sign
    };
}

// ============================================================
// Credenziali
// ============================================================

function _readEnv(name: string): string | undefined {
    const d = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
    return d?.env.get(name);
}

export function readSunmiCredentialsFromEnv(): SunmiCredentials | null {
    const appId = _readEnv("SUNMI_APP_ID");
    const appKey = _readEnv("SUNMI_APP_KEY");
    if (!appId || !appKey) return null;
    return { appId, appKey };
}

// ============================================================
// Trasporto
// ============================================================

interface SunmiRawResponse {
    code?: unknown;
    msg?: unknown;
    data?: unknown;
}

/**
 * Esegue una POST firmata verso Sunmi e mappa la risposta in un risultato
 * discriminato. Non lancia mai: ogni fallimento e' un `kind` diverso da "ok".
 */
export async function sunmiRequest<T = unknown>(
    path: string,
    body: Record<string, unknown>,
    options: SunmiRequestOptions = {}
): Promise<SunmiResult<T>> {
    const credentials = options.credentials ?? readSunmiCredentialsFromEnv();
    if (!credentials) {
        return {
            kind: "config_error",
            message: "SUNMI_APP_ID / SUNMI_APP_KEY non configurati."
        };
    }

    // Serializzazione UNICA: la stessa stringa va nella firma e nel body.
    const bodyJson = JSON.stringify(body);
    const timestamp = options.timestamp ?? sunmiTimestamp();
    const nonce = options.nonce ?? sunmiNonce();
    const headers = await buildSunmiHeaders(bodyJson, credentials, timestamp, nonce);

    const fetchImpl = options.fetchImpl ?? fetch;
    const url = `${options.baseUrl ?? SUNMI_API_BASE}${path}`;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let res: Response;
    try {
        res = await fetchImpl(url, {
            method: "POST",
            headers,
            body: bodyJson,
            signal: AbortSignal.timeout(timeoutMs)
        });
    } catch (e) {
        const err = e as Error;
        const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
        return {
            kind: "transport_error",
            message: isTimeout
                ? `Timeout Sunmi dopo ${timeoutMs}ms`
                : (err?.message ?? "Errore di rete verso Sunmi")
        };
    }

    let parsed: SunmiRawResponse;
    try {
        parsed = (await res.json()) as SunmiRawResponse;
    } catch {
        return {
            kind: "transport_error",
            message: `Risposta Sunmi non JSON (HTTP ${res.status})`,
            status: res.status
        };
    }

    if (!res.ok && typeof parsed?.code !== "number") {
        return {
            kind: "transport_error",
            message: `HTTP ${res.status} da Sunmi`,
            status: res.status
        };
    }

    const code = typeof parsed.code === "number" ? parsed.code : NaN;
    const msg = typeof parsed.msg === "string" ? parsed.msg : "";

    if (code === SUNMI_CODES.OK) {
        return { kind: "ok", data: parsed.data as T, msg };
    }
    if (Number.isNaN(code)) {
        return {
            kind: "transport_error",
            message: "Risposta Sunmi senza campo code",
            status: res.status
        };
    }
    return { kind: "sunmi_error", code, msg, category: categorizeSunmiCode(code) };
}

// ============================================================
// Endpoint tipizzati
// ============================================================

export function sunmiBindShop(
    sn: string,
    shopId: number,
    options?: SunmiRequestOptions
): Promise<SunmiResult<unknown>> {
    return sunmiRequest(SUNMI_PATHS.bindShop, { sn, shop_id: shopId }, options);
}

export function sunmiUnbindShop(
    sn: string,
    shopId: number,
    options?: SunmiRequestOptions
): Promise<SunmiResult<unknown>> {
    return sunmiRequest(SUNMI_PATHS.unbindShop, { sn, shop_id: shopId }, options);
}

export interface SunmiOnlineStatusEntry {
    sn: string;
    is_online: number | boolean;
}

export interface SunmiOnlineStatusData {
    list?: SunmiOnlineStatusEntry[];
}

export function sunmiOnlineStatusBySn(
    sn: string,
    options?: SunmiRequestOptions
): Promise<SunmiResult<SunmiOnlineStatusData>> {
    return sunmiRequest<SunmiOnlineStatusData>(SUNMI_PATHS.onlineStatus, { sn }, options);
}
