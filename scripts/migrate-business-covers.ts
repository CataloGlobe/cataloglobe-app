#!/usr/bin/env node
/**
 * migrate-business-covers.ts
 *
 * Script una tantum: sposta i file nel bucket business-covers
 * dal vecchio path  {slug}__{activityId}/...
 * al nuovo path     {tenantId}/{slug}__{activityId}/...
 *
 * Aggiorna anche:
 *   - activities.cover_image
 *   - activity_media.url
 *
 * Idempotente: salta folder/URL già nel formato nuovo.
 *
 * Esecuzione:
 *   SUPABASE_URL="https://xxx.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   node --loader ./scripts/ts-loader.mjs scripts/migrate-business-covers.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Mancano le variabili d'ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

const BUCKET = "business-covers";

/** Replica esatta di toSafeSlug() in activities.ts */
function toSafeSlug(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

/** UUID v4 regex per il check idempotenza */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//;

let totalMoved = 0;
let totalErrors = 0;

async function moveFile(from: string, to: string): Promise<boolean> {
    const { error } = await supabase.storage.from(BUCKET).move(from, to);
    if (error) {
        console.error(`    ❌ move fail: ${from} → ${to}\n       ${error.message}`);
        totalErrors++;
        return false;
    }
    console.log(`    ✅ ${from} → ${to}`);
    totalMoved++;
    return true;
}

async function migrate(): Promise<void> {
    console.log("=== Migrazione business-covers ===\n");

    // 1. Recupera tutte le attività con cover_image o slug (anche senza cover)
    //    per trovare eventuali file orfani nel bucket.
    //    Usiamo cover_image IS NOT NULL come filtro primario (è l'unico riferimento DB ai file).
    const { data: activities, error: actErr } = await supabase
        .from("activities")
        .select("id, slug, tenant_id, cover_image")
        .not("cover_image", "is", null);

    if (actErr) {
        console.error("Errore query activities:", actErr.message);
        process.exit(1);
    }

    if (!activities || activities.length === 0) {
        console.log("Nessuna attività con cover_image. Nulla da fare.");
        return;
    }

    console.log(`Trovate ${activities.length} attività con cover_image\n`);

    // 2. Per ogni attività: sposta i file nel bucket
    for (const activity of activities) {
        const { id, slug, tenant_id, cover_image } = activity as {
            id: string;
            slug: string;
            tenant_id: string;
            cover_image: string;
        };

        const safeSlug = toSafeSlug(slug) || "activity";
        const oldFolder = `${safeSlug}__${id}`;
        const newFolder = `${tenant_id}/${safeSlug}__${id}`;

        console.log(`📁 Attività ${id} (${slug})`);
        console.log(`   ${oldFolder} → ${newFolder}`);

        // Controlla se la cartella vecchia ha file (idempotenza: skip se già migrata)
        const { data: rootFiles, error: listErr } = await supabase.storage
            .from(BUCKET)
            .list(oldFolder, { limit: 100 });

        if (listErr) {
            console.warn(`   ⚠️  list(${oldFolder}) errore: ${listErr.message} — skip`);
            continue;
        }

        if (!rootFiles || rootFiles.length === 0) {
            // Verifica se il file è già nella nuova posizione
            const { data: newFiles } = await supabase.storage
                .from(BUCKET)
                .list(newFolder, { limit: 1 });

            if (newFiles && newFiles.length > 0) {
                console.log(`   ⏭  Già migrata (${newFolder} esiste)`);
            } else {
                console.log(`   ⏭  Nessun file trovato in ${oldFolder} (bucket vuoto o già migrato)`);
            }
            continue;
        }

        // File diretti nella root del folder (cover.*, ecc.)
        const rootMoves = rootFiles
            .filter(f => f.id !== null) // esclude sottocartelle
            .map(f => ({
                from: `${oldFolder}/${f.name}`,
                to: `${newFolder}/${f.name}`
            }));

        // File nella sottocartella gallery/
        const { data: galleryFiles } = await supabase.storage
            .from(BUCKET)
            .list(`${oldFolder}/gallery`, { limit: 100 });

        const galleryMoves = (galleryFiles ?? [])
            .filter(f => f.id !== null)
            .map(f => ({
                from: `${oldFolder}/gallery/${f.name}`,
                to: `${newFolder}/gallery/${f.name}`
            }));

        const allMoves = [...rootMoves, ...galleryMoves];

        if (allMoves.length === 0) {
            console.log(`   ⏭  Solo sottocartelle trovate, nessun file da spostare`);
            continue;
        }

        console.log(`   ${allMoves.length} file da spostare`);

        let allOk = true;
        for (const mv of allMoves) {
            const ok = await moveFile(mv.from, mv.to);
            if (!ok) allOk = false;
        }

        // 3. Aggiorna cover_image solo se tutti i move hanno avuto successo
        if (allOk) {
            const alreadyMigrated = cover_image.includes(`/business-covers/${tenant_id}/`);
            if (alreadyMigrated) {
                console.log(`   ⏭  cover_image già aggiornato`);
            } else {
                const newCoverImage = cover_image.replace(
                    "/business-covers/",
                    `/business-covers/${tenant_id}/`
                );

                const { error: updateErr } = await supabase
                    .from("activities")
                    .update({ cover_image: newCoverImage })
                    .eq("id", id);

                if (updateErr) {
                    console.error(`   ❌ UPDATE activities.cover_image: ${updateErr.message}`);
                    totalErrors++;
                } else {
                    console.log(`   ✅ cover_image aggiornato`);
                }
            }
        } else {
            console.warn(`   ⚠️  Alcuni file non spostati — cover_image NON aggiornato per sicurezza`);
        }

        console.log();
    }

    // 4. Aggiorna activity_media.url
    console.log("--- Aggiornamento activity_media ---\n");

    const { data: mediaRows, error: mediaErr } = await supabase
        .from("activity_media")
        .select("id, url, activity_id")
        .like("url", `%/${BUCKET}/%`);

    if (mediaErr) {
        console.error("Errore query activity_media:", mediaErr.message);
    } else if (!mediaRows || mediaRows.length === 0) {
        console.log("Nessuna riga in activity_media con URL business-covers");
    } else {
        const activityMap = new Map(
            (activities as Array<{ id: string; tenant_id: string }>).map(a => [a.id, a.tenant_id])
        );

        for (const media of mediaRows as Array<{ id: string; url: string; activity_id: string }>) {
            const tenantId = activityMap.get(media.activity_id);
            if (!tenantId) {
                console.warn(`   ⚠️  activity_media ${media.id}: tenant_id non trovato per activity ${media.activity_id}`);
                continue;
            }

            if (media.url.includes(`/${BUCKET}/${tenantId}/`)) {
                console.log(`   ⏭  activity_media ${media.id}: già aggiornato`);
                continue;
            }

            const newUrl = media.url.replace(
                `/${BUCKET}/`,
                `/${BUCKET}/${tenantId}/`
            );

            const { error: mUpdateErr } = await supabase
                .from("activity_media")
                .update({ url: newUrl })
                .eq("id", media.id);

            if (mUpdateErr) {
                console.error(`   ❌ activity_media ${media.id}: ${mUpdateErr.message}`);
                totalErrors++;
            } else {
                console.log(`   ✅ activity_media ${media.id} aggiornato`);
            }
        }
    }

    // 5. Report finale
    console.log("\n=== Report finale ===");
    console.log(`File spostati:   ${totalMoved}`);
    console.log(`Errori:          ${totalErrors}`);

    if (totalErrors > 0) {
        console.error("\n⚠️  Ci sono stati errori. Verificare i log sopra e rieseguire.");
        process.exit(1);
    } else {
        console.log("\n✅ Migrazione completata senza errori.");
    }
}

migrate().catch(err => {
    console.error("Errore non gestito:", err);
    process.exit(1);
});
