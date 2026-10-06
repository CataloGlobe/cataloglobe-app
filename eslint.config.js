import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `docs/extracted_*`: copie di codice per la documentazione, non sorgenti.
  globalIgnores(['dist', 'docs/extracted_*']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // `_nome`: parametro tenuto per la firma del service (`tenantId`), non usato.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Edge Functions: girano su Deno, non nel bundle Vite. Molti `index.ts`
    // aprono con `// @ts-nocheck` di proposito: importano da URL
    // (`https://esm.sh/...`, `https://deno.land/...`) e usano il global `Deno`,
    // che il TypeScript dell'app non risolve. Il controllo tipi lì è
    // `deno check`, non tsc. ESLint resta attivo su questi file (any, variabili
    // inutilizzate): si spegne solo il divieto di `@ts-nocheck`.
    files: ['supabase/functions/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': false }],
    },
  },
])
