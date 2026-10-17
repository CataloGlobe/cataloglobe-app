/**
 * Curve di livello («contour»): campo periodico (somma di seni con frequenze
 * intere) tagliato a 9 quote con marching squares, ripetibile senza giunzioni.
 * Stesso disegno dell'editor stili (`motivi-studio.mjs`, `topo()`); calcolato
 * una volta alla prima richiesta invece di portare 47 KB di tracciato nel bundle.
 */

export const CONTOUR_TILE = 280;

let cached: string | null = null;

export function contourPath(): string {
    if (cached) return cached;
    const T = CONTOUR_TILE;
    const N = 112;
    const levels = 9;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const terms = [[1, 0], [0, 1], [1, 1], [1, -1], [2, 1], [1, 2], [2, -1], [3, 1], [1, 3], [3, -2]].map(([a, b], i) => ({
        a,
        b,
        amp: 1 / (1 + i * 0.45),
        ph: rnd() * Math.PI * 2
    }));
    const f = (x: number, y: number) => terms.reduce((s, t) => s + t.amp * Math.sin((2 * Math.PI * (t.a * x + t.b * y)) / T + t.ph), 0);
    const h = T / N;
    const G: number[][] = [];
    let mn = Infinity;
    let mx = -Infinity;
    for (let j = 0; j <= N; j++) {
        G[j] = [];
        for (let i = 0; i <= N; i++) {
            const v = f(i * h, j * h);
            G[j][i] = v;
            mn = Math.min(mn, v);
            mx = Math.max(mx, v);
        }
    }
    let d = "";
    for (let l = 1; l <= levels; l++) {
        const L = mn + ((mx - mn) * l) / (levels + 1);
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                const v = [G[j][i], G[j][i + 1], G[j + 1][i + 1], G[j + 1][i]];
                const P = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
                const pts: [number, number][] = [];
                for (let e = 0; e < 4; e++) {
                    const a = v[e];
                    const b = v[(e + 1) % 4];
                    if (a < L !== b < L) {
                        const t = (L - a) / (b - a);
                        const A = P[e];
                        const B = P[(e + 1) % 4];
                        pts.push([(A[0] + (B[0] - A[0]) * t) * h, (A[1] + (B[1] - A[1]) * t) * h]);
                    }
                }
                const seg = (p: [number, number], q: [number, number]) => {
                    d += "M" + r1(p[0]) + " " + r1(p[1]) + "L" + r1(q[0]) + " " + r1(q[1]);
                };
                if (pts.length === 2) seg(pts[0], pts[1]);
                else if (pts.length === 4) {
                    seg(pts[0], pts[1]);
                    seg(pts[2], pts[3]);
                }
            }
        }
    }
    cached = d;
    return d;
}
