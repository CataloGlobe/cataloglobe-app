// Dopo `vite build` (app), `vite build --mode landing` e il bundle server
// della landing (dist-landing-server): la landing prerenderizzata prende il
// posto di dist/index.html, che Vercel serve su / dal filesystem prima dei
// rewrite, e diventa dist/b.html per /b (rewrite in vercel.json). La shell
// dell'app diventa dist/app.html: la servono le rewrite di vercel.json (route
// app e il resto) e la legge api/ssr-render come fallback SPA.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP_SHELL = "dist/index.html";
const TEMPLATE = "dist/landing.html";
const SERVER = "dist-landing-server/entry-landing-server.js";

for (const file of [APP_SHELL, TEMPLATE, SERVER]) {
    if (!existsSync(file)) {
        console.error(`[prerender-landing] manca ${file}: lanciare dopo i tre vite build.`);
        process.exit(1);
    }
}

const { renderLanding } = await import(pathToFileURL(resolve(SERVER)).href);
const template = readFileSync(TEMPLATE, "utf8");
const form = renderLanding(template, "form");
const signup = renderLanding(template, "signup");

if (!form.includes('id="landing-hero-title"') || !signup.includes('id="landing-hero-title"')) {
    console.error("[prerender-landing] l'HTML renderizzato non contiene il titolo dell'hero.");
    process.exit(1);
}

renameSync(APP_SHELL, "dist/app.html");
writeFileSync(APP_SHELL, form);
writeFileSync("dist/b.html", signup);
rmSync(TEMPLATE);
console.log(
    `[prerender-landing] dist/index.html (/) ${form.length} B, dist/b.html (/b) ${signup.length} B, dist/app.html = shell dell'app`
);
