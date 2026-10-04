// Dev command di `vercel dev` (vedi `devCommand` in vercel.json).
// In locale il frontend lo serve Vite (`npm run dev`, 5173) e fa proxy di
// /api verso `vercel dev` (3001): qui serve solo un processo che occupi
// $PORT, così `vercel dev` non avvia un secondo Vite e serve le sole
// funzioni in api/. Ogni richiesta non /api che arriva qui risponde 404.
import { createServer } from "node:http";

const port = Number(process.env.PORT);

createServer((_req, res) => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("vercel dev serve solo /api: il frontend è su Vite (npm run dev).\n");
}).listen(port, "127.0.0.1");
