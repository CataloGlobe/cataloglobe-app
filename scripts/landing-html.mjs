// Dopo `vite build` e `vite build --mode landing`: la landing prende il posto
// di dist/index.html, che Vercel serve su / dal filesystem prima dei rewrite
// (e su /b con una rewrite). La shell dell'app diventa dist/app.html: la
// servono le rewrite di vercel.json (route app e il resto) e la legge
// api/ssr-render come fallback SPA.
import { existsSync, renameSync } from "node:fs";

const APP_SHELL = "dist/index.html";
const LANDING = "dist/landing.html";

for (const file of [APP_SHELL, LANDING]) {
    if (!existsSync(file)) {
        console.error(`[landing-html] manca ${file}: lanciare dopo i due vite build.`);
        process.exit(1);
    }
}

renameSync(APP_SHELL, "dist/app.html");
renameSync(LANDING, APP_SHELL);
console.log("[landing-html] dist/index.html = landing, dist/app.html = shell dell'app");
