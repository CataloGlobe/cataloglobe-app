import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Ogni <form> dell'app è noValidate: i controlli li facciamo noi, con il
// messaggio sotto il campo (TextInput `error`), mai col fumetto del browser
// («Aggiungi un simbolo @…»), che ha un altro stile e la lingua del browser.
// Un form nuovo senza noValidate fa fallire questo test.

function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return tsxFiles(path);
        return entry.name.endsWith(".tsx") ? [path] : [];
    });
}

/** Il tag di apertura di ogni <form>, fino al primo `>` che non sta in `=>` né dentro {}. */
function formOpenTags(source: string): string[] {
    const tags: string[] = [];
    const re = /<form(?=[\s>])/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
        let depth = 0;
        let i = match.index + 5;
        for (; i < source.length; i++) {
            const ch = source[i];
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
            else if (ch === ">" && depth === 0) break;
        }
        tags.push(source.slice(match.index, i + 1));
    }
    return tags;
}

describe("form noValidate", () => {
    it("ogni <form> in src ha noValidate", () => {
        const missing = tsxFiles("src").flatMap(file => {
            const source = readFileSync(file, "utf8")
                // Commenti fuori: «Submit fuori dal <form>» non è un tag.
                .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/^\s*\/\/.*$/gm, "");
            return formOpenTags(source)
                .filter(tag => !/\bnoValidate\b/.test(tag))
                .map(() => file);
        });
        expect(missing).toEqual([]);
    });
});
