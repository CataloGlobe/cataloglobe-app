import { readFile } from "node:fs/promises";
import ts from "typescript";

function isTsLike(url) {
    return url.endsWith(".ts") || url.endsWith(".tsx");
}

function isRelativeOrAbsolute(specifier) {
    return (
        specifier.startsWith("./") ||
        specifier.startsWith("../") ||
        specifier.startsWith("/") ||
        specifier.startsWith("file://")
    );
}

export async function resolve(specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        if (!isRelativeOrAbsolute(specifier)) {
            throw error;
        }

        const hasKnownExtension = /\.[a-zA-Z0-9]+($|\?)/.test(specifier);
        if (hasKnownExtension) {
            throw error;
        }

        return nextResolve(`${specifier}.ts`, context);
    }
}

export async function load(url, context, nextLoad) {
    if (!isTsLike(url)) {
        return nextLoad(url, context);
    }

    const source = await readFile(new URL(url), "utf8");

    const transpiled = ts.transpileModule(source, {
        fileName: new URL(url).pathname,
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            esModuleInterop: true,
            sourceMap: false,
            jsx: ts.JsxEmit.ReactJSX
        }
    });

    return {
        format: "module",
        source: transpiled.outputText,
        shortCircuit: true
    };
}
