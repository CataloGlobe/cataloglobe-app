function readEnvFlag(name: string): string | undefined {
    const importMetaEnv =
        typeof import.meta !== "undefined"
            ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
            : undefined;
    if (importMetaEnv?.[name] != null) return importMetaEnv[name];

    const processEnv =
        (
            globalThis as typeof globalThis & {
                process?: { env?: Record<string, string | undefined> };
            }
        ).process?.env ?? {};
    return processEnv[name];
}
