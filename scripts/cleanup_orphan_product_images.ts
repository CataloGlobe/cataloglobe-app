#!/usr/bin/env node
/**
 * cleanup_orphan_product_images.ts
 *
 * Script una tantum: rimuove i file orfani nel bucket `product-images`,
 * cioè i file il cui `product_id` (estratto dal path) non esiste più
 * nella tabella `products`.
 *
 * Path layout atteso: `{tenant_id}/products/{product_id}.{ext}`.
 *
 * Idempotente: file con product esistente vengono saltati. File con path non
 * conforme vengono saltati con warning (non rimossi, prudenza).
 *
 * Esecuzione:
 *   SUPABASE_URL="https://xxx.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   node --loader ./scripts/ts-loader.mjs scripts/cleanup_orphan_product_images.ts
 *
 * Flag opzionale `--dry-run` per stampare gli orfani senza rimuoverli.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Mancano le variabili d'ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET = "product-images";
const REMOVE_BATCH_SIZE = 100;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ParsedFile {
    path: string;
    tenantId: string;
    productId: string;
}

let totalScanned = 0;
let totalSkippedMalformed = 0;
let totalOrphan = 0;
let totalRemoved = 0;
let totalRemoveErrors = 0;

/**
 * Lista tutti i file del bucket leggendo direttamente `storage.objects` via
 * SQL (più semplice e affidabile della ricorsione su `storage.list` con i
 * suoi limiti di paginazione).
 */
async function listAllFiles(): Promise<string[]> {
    const PAGE = 1000;
    const all: string[] = [];
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .schema("storage")
            .from("objects")
            .select("name")
            .eq("bucket_id", BUCKET)
            .order("name", { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as Array<{ name: string }>;
        all.push(...rows.map(r => r.name));
        if (rows.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

function parsePath(name: string): ParsedFile | null {
    // Atteso: {uuid}/products/{uuid}.{ext}
    const parts = name.split("/");
    if (parts.length !== 3) return null;
    const [tenantId, segment, fileName] = parts;
    if (segment !== "products") return null;
    if (!UUID_RE.test(tenantId)) return null;
    const productId = fileName.split(".")[0];
    if (!UUID_RE.test(productId)) return null;
    return { path: name, tenantId, productId };
}

async function findOrphans(parsed: ParsedFile[]): Promise<ParsedFile[]> {
    if (parsed.length === 0) return [];
    const productIds = Array.from(new Set(parsed.map(p => p.productId)));
    const existing = new Set<string>();

    const CHUNK = 500;
    for (let i = 0; i < productIds.length; i += CHUNK) {
        const slice = productIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
            .from("products")
            .select("id")
            .in("id", slice);
        if (error) throw error;
        for (const row of (data ?? []) as Array<{ id: string }>) {
            existing.add(row.id);
        }
    }

    return parsed.filter(p => !existing.has(p.productId));
}

async function removeBatch(paths: string[]): Promise<void> {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
        console.error(`    Errore rimozione batch:`, error.message);
        totalRemoveErrors += paths.length;
        return;
    }
    totalRemoved += paths.length;
    for (const p of paths) {
        console.log(`    Rimosso: ${p}`);
    }
}

async function main(): Promise<void> {
    console.log(`=== Cleanup orfani product-images ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

    const allFiles = await listAllFiles();
    totalScanned = allFiles.length;
    console.log(`File totali nel bucket: ${totalScanned}`);

    const parsed: ParsedFile[] = [];
    for (const name of allFiles) {
        const p = parsePath(name);
        if (!p) {
            totalSkippedMalformed++;
            console.warn(`  Path non conforme, skip: ${name}`);
            continue;
        }
        parsed.push(p);
    }

    const orphans = await findOrphans(parsed);
    totalOrphan = orphans.length;
    console.log(`Orfani trovati: ${totalOrphan}`);

    if (totalOrphan === 0) {
        console.log("Nessun orfano da rimuovere.");
        return;
    }

    if (DRY_RUN) {
        for (const o of orphans) console.log(`  DRY: ${o.path}`);
    } else {
        for (let i = 0; i < orphans.length; i += REMOVE_BATCH_SIZE) {
            const batch = orphans.slice(i, i + REMOVE_BATCH_SIZE).map(o => o.path);
            await removeBatch(batch);
        }
    }
}

main()
    .then(() => {
        console.log("\n=== Fine ===");
        console.log(`Scansionati:       ${totalScanned}`);
        console.log(`Path malformati:   ${totalSkippedMalformed}`);
        console.log(`Orfani:            ${totalOrphan}`);
        console.log(`Rimossi:           ${totalRemoved}`);
        console.log(`Errori rimozione:  ${totalRemoveErrors}`);
        process.exit(totalRemoveErrors > 0 ? 1 : 0);
    })
    .catch(err => {
        console.error("Errore fatale:", err);
        process.exit(1);
    });
